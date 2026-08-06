import pytest
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from app.agent.context_engine import (
    BM25Scorer,
    extract_chat_pairs,
    summarize_older_pairs,
    pack_context_messages,
)


def test_bm25_scorer():
    corpus = [
        "Apple Inc designs iPhones and Macs in Cupertino California",
        "Tata Consultancy Services TCS reported strong Q3 profit in IT services",
        "Mazagon Dock Shipbuilders builds stealth frigates and submarines for Indian Navy",
        "State Bank of India SBI declared dividend and higher net interest margin",
        "Reliance Industries operates oil refineries and retail stores across India",
    ]
    scorer = BM25Scorer(corpus)
    scores = scorer.get_scores("Mazagon Dock submarine frigate navy")
    assert len(scores) == 5
    # The 3rd document (index 2) should have the highest score
    assert scores[2] == max(scores)
    assert scores[2] > 0.0


def test_extract_chat_pairs():
    history = [
        {"sender": "user", "content": "Hello"},
        {"sender": "agent", "content": "Hi there"},
        {"sender": "user", "content": "Check TCS stock"},
        {"sender": "agent", "content": "TCS is at 3800"},
    ]
    pairs = extract_chat_pairs(history)
    assert len(pairs) == 2
    assert pairs[0]["user"] == "Hello"
    assert pairs[0]["agent"] == "Hi there"
    assert pairs[1]["user"] == "Check TCS stock"
    assert pairs[1]["agent"] == "TCS is at 3800"


def test_pack_context_under_10_pairs():
    # 8 pairs = 16 messages (< 10 threshold)
    history = []
    for i in range(8):
        history.append({"sender": "user", "content": f"Question {i}"})
        history.append({"sender": "agent", "content": f"Answer {i}"})

    packed = pack_context_messages("Current question 8", history)
    # Total messages should be 16 history + 1 current = 17 messages
    assert len(packed) == 17
    assert isinstance(packed[-1], HumanMessage)
    assert packed[-1].content == "Current question 8"


def test_pack_context_trigger_at_10_pairs():
    # 12 pairs = 24 messages (>= 10 threshold)
    history = []
    for i in range(12):
        history.append({"sender": "user", "content": f"Query about Stock_{i}.NS"})
        history.append({"sender": "agent", "content": f"Analysis for Stock_{i}.NS"})

    packed = pack_context_messages("Tell me about Stock_2.NS and Stock_11.NS", history)
    # Check structure
    assert isinstance(packed[0], SystemMessage)
    assert "CONVERSATION HISTORY SUMMARY" in packed[0].content

    # Check presence of BM25 recalled context
    system_messages = [m for m in packed if isinstance(m, SystemMessage)]
    bm25_msg = next((m for m in system_messages if "RELEVANT HISTORICAL CONTEXT" in m.content), None)
    assert bm25_msg is not None

    # Check sliding window (last 5 pairs = 10 messages) + current message
    # Last message is user prompt
    assert isinstance(packed[-1], HumanMessage)
    assert packed[-1].content == "Tell me about Stock_2.NS and Stock_11.NS"
