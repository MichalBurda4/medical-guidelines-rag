"""LangGraph retrieval agent.

Shape of the graph:

    START → retrieve ─┬─(passages found)──────────────────→ generate → END
                      ├─(nothing relevant, budget left)→ rewrite → retrieve
                      └─(budget exhausted)─────────────────→ give_up → END

`retrieve` is the only tool: a cosine query against the Chroma collection. The
rewrite loop exists because a single embedding of the user's wording is a weak
proxy for intent — an operational question can miss the section that answers it.
Answering is still refused when every attempt comes back empty, so the graph can
never turn a rewrite into an excuse to answer from the model's own knowledge.
"""

from __future__ import annotations

import logging
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.config import RETRIEVAL_MAX_REWRITES
from app.models import AnswerProfile, LlmProvider
from app.rag.chunk import ScoredChunk
from app.rag.generate import NO_CONTEXT_ANSWER, generate_answer
from app.rag.llm import resolve_llm_provider
from app.rag.retrieve import search_with_scores
from app.rag.rewrite import Attempt, rewrite_query

logger = logging.getLogger(__name__)


class AgentState(TypedDict, total=False):
    question: str
    profile: AnswerProfile
    requested_llm: LlmProvider | None
    query: str
    rewrites: int
    attempts: list[Attempt]
    passages: list[ScoredChunk]
    answer: str
    llm: LlmProvider | None


def _retrieve(state: AgentState) -> AgentState:
    """The tool: one cosine query against the vector store."""
    query = state["query"]
    passages, best = search_with_scores(query)
    attempts = state.get("attempts", [])
    logger.info(
        "retrieve #%d: %r → %d passages (best %.3f)",
        len(attempts) + 1,
        query,
        len(passages),
        best,
    )
    return {
        "passages": passages,
        "attempts": [*attempts, Attempt(query=query, bestScore=best)],
    }


def _rewrite(state: AgentState) -> AgentState:
    provider = resolve_llm_provider(state.get("requested_llm"))
    query = rewrite_query(
        provider,
        state["question"],
        state["profile"],
        list(state.get("attempts", [])),
    )
    rewrites = state.get("rewrites", 0) + 1
    logger.info("rewrite #%d: %r → %r", rewrites, state["question"], query)
    return {
        # A refused rewrite keeps the previous query: the attempt counter still
        # advances, so the loop terminates instead of cycling.
        "query": query or state["query"],
        "rewrites": rewrites,
    }


def _generate(state: AgentState) -> AgentState:
    answer, llm, passages = generate_answer(
        state["question"],
        state.get("passages", []),
        state["profile"],
        state.get("requested_llm"),
    )
    return {"answer": answer, "llm": llm, "passages": passages}


def _give_up(_state: AgentState) -> AgentState:
    """Budget exhausted without a hit: refuse, with no sources and no LLM."""
    return {"answer": NO_CONTEXT_ANSWER, "llm": None, "passages": []}


def _route_after_retrieve(state: AgentState) -> Literal["generate", "rewrite", "give_up"]:
    if state.get("passages"):
        return "generate"
    if state.get("rewrites", 0) >= RETRIEVAL_MAX_REWRITES:
        return "give_up"
    return "rewrite"


def _build_graph():
    builder = StateGraph(AgentState)
    builder.add_node("retrieve", _retrieve)
    builder.add_node("rewrite", _rewrite)
    builder.add_node("generate", _generate)
    builder.add_node("give_up", _give_up)

    builder.add_edge(START, "retrieve")
    builder.add_conditional_edges(
        "retrieve",
        _route_after_retrieve,
        {"generate": "generate", "rewrite": "rewrite", "give_up": "give_up"},
    )
    builder.add_edge("rewrite", "retrieve")
    builder.add_edge("generate", END)
    builder.add_edge("give_up", END)
    return builder.compile()


# The graph holds no per-request state: build it once at import and reuse it.
_GRAPH = _build_graph()


def answer_question(
    question: str,
    profile: AnswerProfile,
    requested_llm: LlmProvider | None = None,
) -> tuple[str, LlmProvider | None, list[ScoredChunk]]:
    """Run the agent. Returns (answer, provider, used_passages).

    Provider is None only for the refusal path, where no LLM answered. Raises
    LlmUnavailable / LlmRequestError / EmbeddingUnavailable.
    """
    final = _GRAPH.invoke(
        AgentState(
            question=question,
            profile=profile,
            requested_llm=requested_llm,
            query=question,
            rewrites=0,
            attempts=[],
        )
    )
    return final["answer"], final.get("llm"), list(final.get("passages", []))
