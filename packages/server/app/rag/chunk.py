import re
from dataclasses import dataclass

from langchain_text_splitters import RecursiveCharacterTextSplitter

DEFAULT_CHUNK_SIZE = 900
DEFAULT_OVERLAP = 150

HEADING_MAX_WORDS = 8
HEADING_MAX_CHARS = 72

# Markdown headings carry a decoration ("## Pregnancy") we strip before
# treating the line as a section. Other bullet markers still disqualify a line,
# so "- Eye drops" never becomes a heading.
MARKDOWN_HEADING = re.compile(r"^#{1,6}\s+(?P<text>.+)$")
BULLET_CHARS = "-•*|>"

@dataclass
class Chunk:
    document_id: str
    document_name: str
    text: str
    section: str | None = None


@dataclass
class ScoredChunk(Chunk):
    score: float = 0.0


def _heading_text(line: str) -> str:
    """Strip markdown decoration so "## Pregnancy" reads as "Pregnancy"."""
    match = MARKDOWN_HEADING.match(line)
    return match.group("text").strip() if match else line.strip()


def _looks_like_heading(line: str) -> bool:
    """Guideline sections are short, unpunctuated lines such as "Pregnancy"."""
    text = _heading_text(line)
    if not text or len(text) > HEADING_MAX_CHARS:
        return False
    if len(text.split()) > HEADING_MAX_WORDS:
        return False
    if text[0] in BULLET_CHARS or text[0].isdigit():
        return False
    if text.endswith((".", ",", ";", ":", "!", "?")):
        return False
    return any(char.isalpha() for char in text)


def _split_sections(text: str) -> list[tuple[str | None, str]]:
    """Split a guideline into (heading, body) pairs so sections stay searchable."""
    sections: list[tuple[str | None, str]] = []
    heading: str | None = None
    buffer: list[str] = []

    for line in text.split("\n"):
        stripped = line.strip()
        if _looks_like_heading(stripped):
            body = "\n".join(buffer).strip()
            if body:
                sections.append((heading, body))
            heading = _heading_text(stripped)
            buffer = []
        else:
            buffer.append(line)

    body = "\n".join(buffer).strip()
    if body:
        sections.append((heading, body))

    return sections


def chunk_text(
    text: str,
    document_id: str,
    document_name: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[Chunk]:
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks: list[Chunk] = []
    for heading, body in _split_sections(normalized):
        # Keep the heading inside the chunk text so section names are searchable.
        section_text = f"{heading}\n{body}" if heading else body
        pieces = (
            splitter.split_text(section_text)
            if len(section_text) > chunk_size
            else [section_text]
        )
        for piece in pieces:
            cleaned = piece.strip()
            if cleaned:
                chunks.append(
                    Chunk(
                        document_id=document_id,
                        document_name=document_name,
                        text=cleaned,
                        section=heading,
                    )
                )
    return chunks
