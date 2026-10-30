from io import BytesIO
from pathlib import Path

from docx import Document as DocxDocument
from pypdf import PdfReader

TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".text"}


def extract_text(filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()

    if ext in TEXT_EXTENSIONS:
        return data.decode("utf-8", errors="replace")

    if ext == ".pdf":
        reader = PdfReader(BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

    if ext == ".docx":
        document = DocxDocument(BytesIO(data))
        return "\n".join(paragraph.text for paragraph in document.paragraphs)

    raise ValueError(f"Unsupported file type: {ext or 'unknown'}")
