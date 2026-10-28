"""Answer profiles.

Language level and audience are expressed through the system prompt only. The
old regex-based rewriting (term swaps, sentence picking, decision-brief layout)
is gone: it was hardcoded to one sample guideline and could not generalise to
documents the user uploads.
"""

from __future__ import annotations

from app.models import AnswerProfile

_LEVEL_INSTRUCTIONS = {
    "child": (
        "Write for a child of about 8–11: very short sentences, everyday words. "
        "If a medical term is unavoidable, explain it in brackets right after it. "
        "End by telling them to ask a grown-up or a doctor before changing any medicine."
    ),
    "teen": (
        "Write for a high-school student: clear and direct, explain medical terms "
        "briefly in brackets where they appear."
    ),
    "adult": (
        "Write for an adult with standard health literacy; precise wording is fine."
    ),
}

_AUDIENCE_INSTRUCTIONS = {
    "patient": (
        "Format as patient-facing guidance: 3–5 numbered points with concrete actions, "
        "then one sentence stating this is educational information, not a personal diagnosis."
    ),
    "business": (
        "Format as a short decision brief with the headings 'Key outcomes', "
        "'Risks / safety' and 'Operational notes'. Keep it under 200 words."
    ),
}


def build_llm_system_prompt(profile: AnswerProfile) -> str:
    return " ".join(
        [
            "You are MediRAG, an assistant for medical guideline Q&A.",
            "Answer ONLY from the numbered context passages. Never add medical facts "
            "that are not in them, even if you know them.",
            "Cite the passages you used as [1], [2] … after the relevant sentence.",
            "Prioritise practical results: side effects and safety, adherence, patient age, "
            "pregnancy, and how quickly symptoms improve. Do not summarise study methodology.",
            _LEVEL_INSTRUCTIONS[profile.languageLevel],
            _AUDIENCE_INSTRUCTIONS[profile.audience],
            "Ignore procurement, staffing, cost, budget and service-delivery passages "
            "unless the question is explicitly about operations.",
            "If the passages do not answer the question, say so in one sentence and stop.",
        ]
    )
