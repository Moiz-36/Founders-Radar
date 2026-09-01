"""Embedding-based change detection.

Raw text diffing flags cosmetic rewording as a "change" far too often. Instead
we embed the old and new content and flag a real change only when cosine
similarity drops below a tuned threshold. The threshold is chosen against the
labeled eval set in /eval — see eval/run_eval.py.
"""

import numpy as np
from openai import OpenAI

EMBEDDING_MODEL = "text-embedding-3-small"

# Tuned against /eval/change_detection_eval_set.json — see eval/run_eval.py for
# the precision this achieves. Revisit as the eval set grows.
DEFAULT_SIMILARITY_THRESHOLD = 0.92

_client = OpenAI()


def embed(text: str) -> list[float]:
    response = _client.embeddings.create(model=EMBEDDING_MODEL, input=text)
    return response.data[0].embedding


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
