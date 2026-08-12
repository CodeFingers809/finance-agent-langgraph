"""pgvector-backed vector store and embedding model for org research RAG.

Embeddings live in a pgvector table that LlamaIndex owns (`data_org_research`);
the RagDocument table tracks ingestion state, which the vector store cannot.
"""

import logging
from functools import lru_cache
from urllib.parse import urlparse

from google.genai.types import EmbedContentConfig
from llama_index.core import StorageContext, VectorStoreIndex
from llama_index.embeddings.google_genai import GoogleGenAIEmbedding
from llama_index.vector_stores.postgres import PGVectorStore

from app.core.config import settings

logger = logging.getLogger(__name__)

# gemini-embedding-001 natively returns 3072 dims, which exceeds pgvector's
# 2000-dim ceiling for HNSW/ivfflat indexes. The model is Matryoshka-trained, so
# truncating to 1536 keeps quality while staying indexable.
EMBED_MODEL = "gemini-embedding-001"
EMBED_DIM = 1536
TABLE_NAME = "org_research"


@lru_cache(maxsize=1)
def get_embed_model() -> GoogleGenAIEmbedding:
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is required for RAG embeddings")
    return GoogleGenAIEmbedding(
        model_name=EMBED_MODEL,
        api_key=settings.GEMINI_API_KEY,
        embedding_config=EmbedContentConfig(output_dimensionality=EMBED_DIM),
    )


@lru_cache(maxsize=1)
def get_vector_store() -> PGVectorStore:
    """PGVectorStore over the app's own Postgres.

    Requires the `vector` extension; PGVectorStore creates its table on first
    use. Raises if the URL isn't Postgres, since there is no local fallback.
    """
    uri = settings.SQLALCHEMY_DATABASE_URI
    if not uri.startswith("postgresql"):
        raise RuntimeError(
            "RAG requires PostgreSQL with pgvector; "
            f"DATABASE_URL points at {uri.split(':', 1)[0]}"
        )

    parsed = urlparse(uri.replace("postgresql+psycopg", "postgresql"))
    return PGVectorStore.from_params(
        database=(parsed.path or "/").lstrip("/"),
        host=parsed.hostname or "localhost",
        password=parsed.password or "",
        port=str(parsed.port or 5432),
        user=parsed.username or "postgres",
        table_name=TABLE_NAME,
        embed_dim=EMBED_DIM,
        hybrid_search=False,
    )


def get_index() -> VectorStoreIndex:
    """Index over the existing vector store (does not re-embed anything)."""
    vector_store = get_vector_store()
    return VectorStoreIndex.from_vector_store(
        vector_store=vector_store,
        embed_model=get_embed_model(),
        storage_context=StorageContext.from_defaults(vector_store=vector_store),
    )
