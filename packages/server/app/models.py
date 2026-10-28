from typing import Literal

from pydantic import BaseModel, Field

LanguageLevel = Literal["child", "teen", "adult"]
AudienceProfile = Literal["patient", "business"]
LlmProvider = Literal["openai", "deepseek"]


class AnswerProfile(BaseModel):
    languageLevel: LanguageLevel = "adult"
    audience: AudienceProfile = "patient"


class LlmAvailability(BaseModel):
    openai: bool
    deepseek: bool


class EmbeddingInfo(BaseModel):
    model: str
    dim: int | None = None
    ready: bool


class HealthResponse(BaseModel):
    ok: Literal[True] = True
    llm: LlmAvailability
    embeddings: EmbeddingInfo


class DocumentRecord(BaseModel):
    id: str
    name: str
    size: int
    type: str
    uploadedAt: int
    chunkCount: int


class ChatSource(BaseModel):
    documentName: str
    excerpt: str
    score: float


class ChatRequest(BaseModel):
    question: str
    languageLevel: LanguageLevel | None = None
    audience: AudienceProfile | None = None
    llm: LlmProvider | None = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSource] = Field(default_factory=list)
    profile: AnswerProfile | None = None
    # None only for the "no relevant context" refusal, which never reaches an LLM.
    llm: LlmProvider | None = None


class DocumentsResponse(BaseModel):
    documents: list[DocumentRecord]


class DeleteResponse(BaseModel):
    ok: Literal[True] = True


class ApiError(BaseModel):
    error: str
