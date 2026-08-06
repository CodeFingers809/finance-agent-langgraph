import math
import re
from typing import List, Dict, Tuple, Any
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage

from app.agent.graph import SYSTEM_PROMPT


class BM25Scorer:
    """Lightweight Okapi BM25 implementation for chat pair retrieval."""
    def __init__(self, corpus: List[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus = corpus
        self.tokenized_corpus = [self._tokenize(doc) for doc in corpus]
        self.doc_len = [len(tokens) for tokens in self.tokenized_corpus]
        self.avgdl = (sum(self.doc_len) / len(corpus)) if corpus else 0
        self.doc_freqs: List[Dict[str, int]] = []
        self.idf: Dict[str, float] = {}
        self._initialize()

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"\w+", text.lower())

    def _initialize(self):
        N = len(self.corpus)
        if N == 0:
            return
        df: Dict[str, int] = {}
        for tokens in self.tokenized_corpus:
            tf_dict: Dict[str, int] = {}
            for t in tokens:
                tf_dict[t] = tf_dict.get(t, 0) + 1
            self.doc_freqs.append(tf_dict)
            for token in tf_dict.keys():
                df[token] = df.get(token, 0) + 1

        for token, freq in df.items():
            self.idf[token] = math.log((N - freq + 0.5) / (freq + 0.5) + 1.0)

    def get_scores(self, query: str) -> List[float]:
        query_tokens = self._tokenize(query)
        scores = [0.0] * len(self.corpus)
        if not self.corpus or self.avgdl == 0:
            return scores

        for i, tf_dict in enumerate(self.doc_freqs):
            d_len = self.doc_len[i]
            score = 0.0
            for token in query_tokens:
                if token in tf_dict:
                    tf = tf_dict[token]
                    idf = self.idf.get(token, 0.0)
                    numerator = tf * (self.k1 + 1)
                    denominator = tf + self.k1 * (1 - self.b + self.b * (d_len / self.avgdl))
                    score += idf * (numerator / denominator)
            scores[i] = score
        return scores


def extract_chat_pairs(history_messages: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Group history messages into chat pairs (user_prompt, agent_response)."""
    pairs: List[Dict[str, Any]] = []
    i = 0
    while i < len(history_messages):
        item = history_messages[i]
        if item.get("sender") == "user":
            user_content = item.get("content", "")
            agent_content = ""
            if i + 1 < len(history_messages) and history_messages[i + 1].get("sender") == "agent":
                agent_content = history_messages[i + 1].get("content", "")
                i += 1
            pairs.append({
                "pair_index": len(pairs),
                "user": user_content,
                "agent": agent_content,
                "text": f"User: {user_content}\nAgent: {agent_content}"
            })
        i += 1
    return pairs


def summarize_older_pairs(older_pairs: List[Dict[str, Any]]) -> str:
    """Generate a structured summary of older dialogue pairs to preserve key context."""
    if not older_pairs:
        return ""

    topics: List[str] = []
    for p in older_pairs:
        u_text = p["user"]
        # Extract stock symbols or key actions mentioned in user input
        symbols = re.findall(r"\b[A-Z]{2,10}(?:\.NS|\.BO)?\b", u_text)
        if symbols:
            topics.append(f"Turn {p['pair_index'] + 1}: Query on {', '.join(set(symbols))}")
        else:
            snippet = u_text[:60] + "..." if len(u_text) > 60 else u_text
            topics.append(f"Turn {p['pair_index'] + 1}: {snippet}")

    summary_text = (
        "CONVERSATION HISTORY SUMMARY (Older turns 1 to " + str(len(older_pairs)) + "):\n" +
        "\n".join([f"- {t}" for t in topics])
    )
    return summary_text


def pack_context_messages(
    user_message: str,
    history_messages: List[Dict[str, str]],
    system_prompt_template: str = SYSTEM_PROMPT,
) -> List[BaseMessage]:
    """
    Hybrid Context Engine:
    - Triggers only after 10 chats (10 user-agent pairs) have occurred.
    - Below 10 chats: Returns full history intact.
    - At/Above 10 chats:
        1. Sliding Window: Keeps recent 5 chat pairs.
        2. BM25 Recall: Fetches top 5 most relevant pairs from older turns based on current query + sliding window.
        3. Recursive Summarization: Condenses all older turns into a system summary node.
    """
    pairs = extract_chat_pairs(history_messages)

    # Condition: Only trigger context packing after 10 chat pairs have happened
    if len(pairs) < 10:
        messages: List[BaseMessage] = []
        for h in history_messages:
            if h.get("sender") == "user":
                messages.append(HumanMessage(content=h.get("content", "")))
            else:
                messages.append(AIMessage(content=h.get("content", "")))
        messages.append(HumanMessage(content=user_message))
        return messages

    # 1. Sliding Window: Recent 5 chat pairs
    recent_pairs = pairs[-5:]
    older_pairs = pairs[:-5]

    # 2. BM25 Keyword Search over older pairs
    recent_text = " ".join([p["text"] for p in recent_pairs])
    bm25_query = f"{user_message} {recent_text}"

    older_corpus = [p["text"] for p in older_pairs]
    bm25_scorer = BM25Scorer(older_corpus)
    scores = bm25_scorer.get_scores(bm25_query)

    # Attach score and sort older pairs by BM25 score
    scored_older = list(zip(scores, older_pairs))
    # Pick top 5 scores
    top_5_scored = sorted(scored_older, key=lambda x: x[0], reverse=True)[:5]

    # Re-sort top 5 by pair_index to maintain chronological order
    bm25_top_pairs = [pair for score, pair in sorted(top_5_scored, key=lambda x: x[1]["pair_index"])]

    # 3. Recursive Summarization of all older pairs
    summary_content = summarize_older_pairs(older_pairs)

    # 4. Assemble Packed Context Payload
    packed_messages: List[BaseMessage] = []

    # System Message with appended summary
    augmented_system_prompt = f"{system_prompt_template}\n\n{summary_content}"
    packed_messages.append(SystemMessage(content=augmented_system_prompt))

    # BM25 Relevant Historical Turns (labeled clearly for LLM)
    if bm25_top_pairs:
        bm25_formatted = "\n\n".join([
            f"[Historical Turn {p['pair_index'] + 1} (BM25 Recall)]\nUser: {p['user']}\nAgent: {p['agent']}"
            for p in bm25_top_pairs
        ])
        packed_messages.append(SystemMessage(content=f"RELEVANT HISTORICAL CONTEXT (BM25 Search):\n{bm25_formatted}"))

    # Recent Sliding Window (5 pairs = 10 messages)
    for p in recent_pairs:
        packed_messages.append(HumanMessage(content=p["user"]))
        if p["agent"]:
            packed_messages.append(AIMessage(content=p["agent"]))

    # Current User Message
    packed_messages.append(HumanMessage(content=user_message))

    return packed_messages
