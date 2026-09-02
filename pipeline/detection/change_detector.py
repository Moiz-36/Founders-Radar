"""Embedding-based change detection.

Raw text diffing flags cosmetic rewording as a "change" far too often. Instead
we embed the old and new content and flag a real change only when cosine
similarity drops below a tuned threshold. The threshold is chosen against the
labeled eval set in /eval — see eval/run_eval.py.

Embeddings run locally via sentence-transformers (free, no API key) rather
than a paid embeddings API — this project targets zero ongoing API cost.
"""

import numpy as np
from sentence_transformers import SentenceTransformer

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # must match pipeline/db/models.py and infra/sql/schema.sql

# Tuned against /eval/change_detection_eval_set.json — see eval/run_eval.py for
# the precision this achieves. MiniLM's cosine similarities run much higher than
# OpenAI's embeddings (near-1.0 even for real changes), so this threshold sits
# much closer to 1.0 than you'd expect. Currently tuned on only 2 placeholder
# examples — MUST be re-tuned once real labeled snapshot pairs are collected.
DEFAULT_SIMILARITY_THRESHOLD = 0.98

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def embed(text: str) -> list[float]:
    embedding = _get_model().encode(text, normalize_embeddings=True)
    return embedding.tolist()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr, b_arr = np.array(a), np.array(b)
    return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr)))


def is_real_change(
    old_text: str,
    new_text: str,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> tuple[bool, float]:
    """Returns (is_real_change, similarity_score)."""
    old_embedding = embed(old_text)
    new_embedding = embed(new_text)
    similarity = cosine_similarity(old_embedding, new_embedding)
    return similarity < threshold, similarity
