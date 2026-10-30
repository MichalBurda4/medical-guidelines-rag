"""Document store backed by Chroma.

Chroma is the single source of truth: chunks live in one collection and the
document catalogue (what the sidebar lists) lives in another. Nothing is kept in
process memory except a mirror of the catalogue, refreshed on startup, so a
restart does not lose documents and the UI cannot drift from the index.
"""

from __future__ import annotations

import time
import uuid

from app.config import RETRIEVAL_TOP_K
from app.models import DocumentRecord
from app.rag.chunk import Chunk, ScoredChunk, chunk_text
from app.rag.embed import embedder
from app.rag.parse import extract_text
from app.rag.retrieve import chunks_collection, documents_collection, search


class DocumentStore:
    def __init__(self) -> None:
        self._documents: dict[str, DocumentRecord] = {}

    def hydrate(self) -> None:
        """Rebuild the catalogue from Chroma, so restarts keep the document list."""
        result = documents_collection().get(include=["metadatas"])
        self._documents.clear()
        for metadata in result.get("metadatas") or []:
            try:
                record = DocumentRecord(**metadata)
            except (TypeError, ValueError):
                continue  # ignore rows written by an older schema
            self._documents[record.id] = record

    def list_documents(self) -> list[DocumentRecord]:
        return sorted(self._documents.values(), key=lambda doc: doc.uploadedAt, reverse=True)

    def has_documents(self) -> bool:
        return bool(self._documents) or chunks_collection().count() > 0

    def search(self, query: str, top_k: int = RETRIEVAL_TOP_K) -> list[ScoredChunk]:
        return search(query, top_k=top_k)

    def add(self, filename: str, data: bytes, mime_type: str) -> DocumentRecord:
        text = extract_text(filename, data)
        if not text.strip():
            raise ValueError(f"No extractable text found in “{filename}”.")

        document_id = str(uuid.uuid4())
        doc_chunks: list[Chunk] = chunk_text(text, document_id, filename)
        if not doc_chunks:
            raise ValueError(f"Could not create chunks for “{filename}”.")

        vectors = embedder.embed_passages([chunk.text for chunk in doc_chunks])

        chunks_collection().add(
            ids=[f"{document_id}:{index}" for index in range(len(doc_chunks))],
            documents=[chunk.text for chunk in doc_chunks],
            embeddings=vectors,
            metadatas=[
                {
                    "document_id": document_id,
                    "document_name": filename,
                    "section": chunk.section or "",
                    "chunk_index": index,
                }
                for index, chunk in enumerate(doc_chunks)
            ],
        )

        record = DocumentRecord(
            id=document_id,
            name=filename,
            size=len(data),
            type=mime_type or "application/octet-stream",
            uploadedAt=int(time.time() * 1000),
            chunkCount=len(doc_chunks),
        )
        # Chroma needs a vector for every row; the file name is enough here.
        documents_collection().add(
            ids=[document_id],
            documents=[filename],
            embeddings=[embedder.embed_query(filename)],
            metadatas=[record.model_dump()],
        )

        self._documents[document_id] = record
        return record

    def remove(self, document_id: str) -> bool:
        if document_id not in self._documents:
            return False

        try:
            chunks_collection().delete(where={"document_id": document_id})
        except Exception:  # some Chroma versions raise when nothing matches
            pass
        documents_collection().delete(ids=[document_id])
        self._documents.pop(document_id, None)
        return True


store = DocumentStore()
