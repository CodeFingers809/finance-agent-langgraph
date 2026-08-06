import base64
import json
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app.agent.graph import stream_agent_events
from app.api.deps import CurrentUser, SessionDep
from app.core.db import engine
from app.core.quota import check_and_update_quota, get_user_quota_status
from app.models import (
    ChatMessage,
    ChatMessagePublic,
    Conversation,
    ConversationPublic,
    QuotaStatusPublic,
)
from app.proto.financial_agent_pb2 import (
    HRPOptimizationResult,
    StreamEvent,
    TextChunk,
    ToolCallEnd,
    ToolCallStart,
)

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequestPayload(BaseModel):
    conversation_id: str | None = None
    message: str
    model_name: str = "gemini-2.0-flash-lite"


@router.get("/quota", response_model=QuotaStatusPublic)
async def get_quota_status(session: SessionDep, current_user: CurrentUser) -> QuotaStatusPublic:
    status_dict = get_user_quota_status(session, current_user.id)
    return QuotaStatusPublic(**status_dict)


@router.get("/conversations", response_model=list[ConversationPublic])
async def list_conversations(session: SessionDep, current_user: CurrentUser) -> list[ConversationPublic]:
    statement = (
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
    )
    results = session.exec(statement).all()
    return [ConversationPublic.model_validate(c) for c in results]


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessagePublic])
async def list_conversation_messages(
    conversation_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> list[ChatMessagePublic]:
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    statement = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    results = session.exec(statement).all()
    return [ChatMessagePublic.model_validate(m) for m in results]


class ConversationUpdatePayload(BaseModel):
    title: str


class BranchConversationPayload(BaseModel):
    until_message_id: str | None = None


@router.patch("/conversations/{conversation_id}", response_model=ConversationPublic)
async def update_conversation_title(
    conversation_id: uuid.UUID,
    payload: ConversationUpdatePayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> ConversationPublic:
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    conv.title = payload.title.strip()
    session.add(conv)
    session.commit()
    session.refresh(conv)
    return ConversationPublic.model_validate(conv)


@router.post("/conversations/{conversation_id}/branch")
async def branch_conversation(
    conversation_id: uuid.UUID,
    payload: BranchConversationPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    orig_conv = session.get(Conversation, conversation_id)
    if not orig_conv or orig_conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    orig_messages = session.exec(stmt).all()

    messages_to_copy = []
    target_msg = None
    for m in orig_messages:
        messages_to_copy.append(m)
        if payload.until_message_id and str(m.id) == str(payload.until_message_id):
            target_msg = m
            break

    if not target_msg and orig_messages:
        target_msg = orig_messages[-1]

    new_title = f"{orig_conv.title} (Branch)"
    new_conv = Conversation(user_id=current_user.id, title=new_title)
    session.add(new_conv)
    session.commit()
    session.refresh(new_conv)

    divider_ts = (target_msg.created_at + timedelta(milliseconds=1)) if target_msg else datetime.now(UTC)

    divider_orig = ChatMessage(
        conversation_id=conversation_id,
        sender="agent",
        content=f"[BRANCHED_TO:{str(new_conv.id)}:{new_title}]",
        created_at=divider_ts,
    )
    session.add(divider_orig)

    new_start_ts = (orig_messages[0].created_at - timedelta(milliseconds=1)) if orig_messages else datetime.now(UTC)
    divider_new = ChatMessage(
        conversation_id=new_conv.id,
        sender="agent",
        content=f"[BRANCHED_FROM:{str(orig_conv.id)}:{orig_conv.title}]",
        created_at=new_start_ts,
    )
    session.add(divider_new)

    for old_m in messages_to_copy:
        copied = ChatMessage(
            conversation_id=new_conv.id,
            sender=old_m.sender,
            content=old_m.content,
            metadata_json=old_m.metadata_json,
            created_at=old_m.created_at,
        )
        session.add(copied)

    session.commit()
    return {
        "new_conversation_id": str(new_conv.id),
        "new_title": new_title,
        "orig_conversation_id": str(orig_conv.id),
    }



@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
):
    conv = session.get(Conversation, conversation_id)
    if not conv or conv.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    session.delete(conv)
    session.commit()
    return {"message": "Conversation deleted"}



@router.options("/chat/stream")
async def options_chat_stream():
    return {}


@router.post("/chat/stream")
async def chat_stream(
    payload: ChatRequestPayload,
    session: SessionDep,
    current_user: CurrentUser,
):
    # 1. Enforce Quota & Rate Limit
    check_and_update_quota(session, current_user.id, payload.model_name)

    # 2. Retrieve or create conversation
    conv = None
    if payload.conversation_id:
        try:
            conv_id = uuid.UUID(payload.conversation_id)
            conv = session.get(Conversation, conv_id)
        except Exception:
            conv = None

    if not conv:
        title = payload.message[:30] + ("..." if len(payload.message) > 30 else "")
        conv = Conversation(user_id=current_user.id, title=title)
        session.add(conv)
        session.commit()
        session.refresh(conv)

    conv_id = conv.id

    # Save user message
    user_msg = ChatMessage(
        conversation_id=conv_id,
        sender="user",
        content=payload.message,
    )
    session.add(user_msg)
    session.commit()

    # Load recent history
    history_stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_id)
        .order_by(ChatMessage.created_at.asc())
    )
    history_records = session.exec(history_stmt).all()
    history_dicts = [{"sender": m.sender, "content": m.content} for m in history_records[:-1]]

    accumulated_agent_text = []
    tool_events_log = []

    async def event_generator():
        nonlocal accumulated_agent_text, tool_events_log

        # Initial conversation_id event
        init_event = StreamEvent(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(UTC).isoformat(),
            text_chunk=TextChunk(text=f"[CONVERSATION_ID:{str(conv_id)}]")
        )
        init_b64 = base64.b64encode(init_event.SerializeToString()).decode("utf-8")
        yield f"event: text_stream\ndata: {init_b64}\n\n"

        async for evt in stream_agent_events(
            user_message=payload.message,
            history_messages=history_dicts,
            model_name=payload.model_name,
        ):
            event_id = str(uuid.uuid4())
            ts = datetime.now(UTC).isoformat()

            pb_event = StreamEvent(event_id=event_id, timestamp=ts)
            evt_type = evt.get("type")

            if evt_type == "text_chunk":
                text = evt.get("text", "")
                accumulated_agent_text.append(text)
                pb_event.text_chunk.CopyFrom(TextChunk(text=text))
                b64_data = base64.b64encode(pb_event.SerializeToString()).decode("utf-8")
                # Per-token realtime text stream
                yield f"event: text_stream\ndata: {b64_data}\n\n"

            elif evt_type == "tool_start":
                tool_events_log.append(evt)
                pb_event.tool_start.CopyFrom(
                    ToolCallStart(
                        tool_name=evt.get("tool_name", ""),
                        arguments_json=evt.get("arguments_json", ""),
                    )
                )
                b64_data = base64.b64encode(pb_event.SerializeToString()).decode("utf-8")
                yield f"event: tool_event\ndata: {b64_data}\n\n"

            elif evt_type == "tool_end":
                tool_events_log.append(evt)
                pb_event.tool_end.CopyFrom(
                    ToolCallEnd(
                        tool_name=evt.get("tool_name", ""),
                        output_json=evt.get("output_json", ""),
                        execution_time_ms=evt.get("execution_time_ms", 0),
                    )
                )
                b64_data = base64.b64encode(pb_event.SerializeToString()).decode("utf-8")
                yield f"event: tool_event\ndata: {b64_data}\n\n"

            elif evt_type == "hrp_result":
                tool_events_log.append(evt)
                pb_event.hrp_result.CopyFrom(
                    HRPOptimizationResult(
                        symbols=evt.get("symbols", []),
                        weights=evt.get("weights", []),
                        summary_notes=evt.get("summary_notes", ""),
                    )
                )
                b64_data = base64.b64encode(pb_event.SerializeToString()).decode("utf-8")
                yield f"event: tool_event\ndata: {b64_data}\n\n"

            elif evt_type == "error_message":
                pb_event.error_message = evt.get("error", "Unknown error")
                b64_data = base64.b64encode(pb_event.SerializeToString()).decode("utf-8")
                yield f"event: tool_event\ndata: {b64_data}\n\n"

            elif evt_type == "is_finished":
                pb_event.is_finished = True
                b64_data = base64.b64encode(pb_event.SerializeToString()).decode("utf-8")
                yield f"event: tool_event\ndata: {b64_data}\n\n"

        # Save complete agent response to DB in dedicated thread-safe session
        with Session(engine) as db_session:
            full_content = "".join(accumulated_agent_text)
            if full_content.strip():
                agent_msg = ChatMessage(
                    conversation_id=conv_id,
                    sender="agent",
                    content=full_content,
                    metadata_json=json.dumps(tool_events_log) if tool_events_log else None,
                )
                db_session.add(agent_msg)
                c_record = db_session.get(Conversation, conv_id)
                if c_record:
                    c_record.updated_at = datetime.now(UTC)
                    db_session.add(c_record)
                db_session.commit()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
