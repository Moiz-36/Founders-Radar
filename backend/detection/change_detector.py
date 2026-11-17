"""Change detection: is a new version of a source meaningfully different from the last one?

History: this used to compare whole-page embeddings (cosine similarity below 0.98 = real
change). That cannot work with all-MiniLM-L6-v2 — the model only reads the first 256 tokens
(~150-200 words) of its input, so a price change further down a pricing page produced a
similarity of exactly 1.0000 and was never reported. Even embedding just the changed region
doesn't help: embeddings barely register number changes ("$199" -> "$249" scored 0.9991, a
copyright-year bump 0.9928). Measured 2026-11-17; see docs/decisions.md.

So detection is now two steps:
1. Here, deterministically: a word-level diff over *meaningful* tokens. Whitespace, case,
   punctuation, filler words and bare years are ignored, so pure formatting/copyright noise
   never reaches the LLM. Any other difference counts as a candidate change, and the changed
   regions (with a little surrounding context) are returned for the analyst.
2. In analysis/analyst.py: the LLM rates the candidate's significance, and "none" is dropped.

Embeddings are still used where they work well — retrieval (pgvector RAG, company chat) —
and `embed()` now covers the whole text by averaging chunk embeddings instead of silently
truncating to the first 256 tokens.
"""

import difflib
import re
from dataclasses import dataclass, field

import numpy as np

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # must match backend/db/models.py and infra/sql/schema.sql
# The model's own input limit is 256 word-pieces; 150 words stays safely under it.
EMBED_CHUNK_WORDS = 150
# Long pages are capped so one huge page can't make a run arbitrarily slow.
EMBED_MAX_CHUNKS = 40
REGION_CONTEXT_WORDS = 12
MAX_REGIONS = 20

_STOPWORDS = frozenset(
    "a an the and or but of to in on at for from by with as per is are was were be been it its "
    "this that these those our your their we you they us them".split()
)
# A token is a number (optionally with currency symbol, separators and %) or a run of word
# characters, so "$49/month" -> ["$49", "month"] and compares equal to "$49 per month".
_TOKEN = re.compile(r"[$€£¥]?\d[\d.,]*%?|\w+")
_YEAR = re.compile(r"^(19|20)\d{2}$")

_model = None


def _get_model():
    global _model
    if _model is None:
        # Imported lazily: loading torch + the model takes seconds and ~500 MB, which tests
        # and the diff-only code paths below never need.
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def _chunks(text: str) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    chunks = [" ".join(words[i : i + EMBED_CHUNK_WORDS]) for i in range(0, len(words), EMBED_CHUNK_WORDS)]
    return chunks[:EMBED_MAX_CHUNKS]


def embed(text: str) -> list[float]:
    """Unit-length embedding of the whole text: the mean of its chunk embeddings."""
    vectors = _get_model().encode(_chunks(text), normalize_embeddings=True)
    mean = np.asarray(vectors).mean(axis=0)
    norm = np.linalg.norm(mean)
    return (mean / norm if norm else mean).tolist()


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr, b_arr = np.array(a), np.array(b)
    denom = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    return float(np.dot(a_arr, b_arr) / denom) if denom else 0.0


def meaningful_tokens(word: str) -> list[str]:
    """The comparable tokens in one whitespace-separated word, without noise (punctuation,
    filler words, bare years). Trailing sentence punctuation is dropped from numbers."""
    tokens = []
    for token in _TOKEN.findall(word.lower()):
        token = token.rstrip(".,")
        if token and token not in _STOPWORDS and not _YEAR.match(token):
            tokens.append(token)
    return tokens


def _meaningful(words: list[str]) -> tuple[list[str], list[int]]:
    """Meaningful tokens of a text, and the index of the word each came from."""
    tokens, positions = [], []
    for i, word in enumerate(words):
        for token in meaningful_tokens(word):
            tokens.append(token)
            positions.append(i)
    return tokens, positions


def _span(words: list[str], positions: list[int], start: int, end: int) -> str:
    """Original words covering meaningful tokens [start, end), plus a little context."""
    if start == end:
        if not positions:
            return ""
        anchor = positions[min(start, len(positions) - 1)]
        lo, hi = anchor, anchor
    else:
        lo, hi = positions[start], positions[end - 1]
    lo = max(0, lo - REGION_CONTEXT_WORDS)
    hi = min(len(words), hi + 1 + REGION_CONTEXT_WORDS)
    return " ".join(words[lo:hi])


@dataclass
class ChangeResult:
    is_real: bool
    # Share of meaningful tokens unchanged, 0..1 (1.0 = no meaningful difference). Stored as
    # signals.similarity_score.
    similarity: float
    regions: list[tuple[str, str]] = field(default_factory=list)


def detect_change(old_text: str, new_text: str) -> ChangeResult:
    old_words, new_words = old_text.split(), new_text.split()
    old_tokens, old_pos = _meaningful(old_words)
    new_tokens, new_pos = _meaningful(new_words)

    matcher = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
    regions: list[tuple[str, str]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        regions.append((_span(old_words, old_pos, i1, i2) if i1 != i2 else "",
                        _span(new_words, new_pos, j1, j2) if j1 != j2 else ""))

    similarity = matcher.ratio() if (old_tokens or new_tokens) else 1.0
    return ChangeResult(is_real=bool(regions), similarity=similarity, regions=regions[:MAX_REGIONS])
