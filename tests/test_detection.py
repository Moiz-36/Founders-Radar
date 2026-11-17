import time

import numpy as np
import pytest

from backend.detection.change_detector import (
    EMBEDDING_DIM,
    MAX_REGIONS,
    cosine_similarity,
    detect_change,
    embed,
    meaningful_tokens,
)
from eval.run_eval import evaluate

FILLER = " ".join(f"section {i} explains how teams automate compliance evidence collection." for i in range(60))


@pytest.mark.parametrize(
    ("word", "expected"),
    [
        ("$49/month", ["$49", "month"]),
        ("©2026", []),
        ("$1,234.50.", ["$1,234.50"]),
        ("SSO,", ["sso"]),
        ("the", []),
        ("20%", ["20%"]),
        ("...", []),
        ("Node.js", ["node", "js"]),
        ("", []),
    ],
)
def test_meaningful_tokens(word, expected):
    assert meaningful_tokens(word) == expected


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ("Pro is $49/month.", "Pro is $49 per month!"),
        ("hello   world", "Hello world"),
        (f"{FILLER} © 2025", f"{FILLER} © 2026"),
        (f"built for the teams. {FILLER}", f"built for teams. {FILLER}"),
        ("same", "same"),
        ("", ""),
    ],
)
def test_noise_is_not_a_change(old, new):
    result = detect_change(old, new)
    assert not result.is_real
    assert result.regions == []
    assert result.similarity == 1.0


@pytest.mark.parametrize(
    ("old", "new", "must_appear"),
    [
        (f"{FILLER} growth plan $199 per month", f"{FILLER} growth plan $249 per month", "$249"),
        (f"starter $49. {FILLER}", f"starter $59. {FILLER}", "$59"),
        (f"growth includes sso and audit logs. {FILLER}", f"growth includes audit logs. {FILLER}", "sso"),
        (FILLER, f"{FILLER} new enterprise plan", "enterprise"),
        ("save 10% yearly", "save 20% yearly", "20%"),
    ],
)
def test_real_changes_detected_anywhere_in_long_pages(old, new, must_appear):
    result = detect_change(old, new)
    assert result.is_real
    assert result.similarity < 1.0
    joined = " ".join(o + " " + n for o, n in result.regions)
    assert must_appear in joined


def test_regions_show_old_and_new_sides_with_context():
    result = detect_change("plans start at $49 per month for teams", "plans start at $59 per month for teams")
    assert len(result.regions) == 1
    old, new = result.regions[0]
    assert "$49" in old and "$59" in new
    assert "plans" in old and "teams" in new  # surrounding context included


def test_pure_insertion_and_deletion_regions():
    added = detect_change("a b c", "a b c brand new feature")
    assert added.is_real and added.regions[0][0] == "" and "feature" in added.regions[0][1]
    removed = detect_change("alpha beta gamma", "alpha gamma")
    assert removed.is_real and "beta" in removed.regions[0][0] and removed.regions[0][1] == ""


def test_everything_removed_and_from_empty():
    assert detect_change("pricing page content", "").is_real
    assert detect_change("", "pricing page content").is_real


def test_region_count_is_capped():
    old = " ".join(f"item{i} same" for i in range(200))
    new = " ".join(f"changed{i} same" for i in range(200))
    assert len(detect_change(old, new).regions) == MAX_REGIONS


def test_large_pages_are_fast():
    big = " ".join(f"word{i % 500} filler{i}" for i in range(20_000))
    started = time.monotonic()
    result = detect_change(big, big.replace("word7 filler7 ", "word7 CHANGED "))
    assert result.is_real
    assert time.monotonic() - started < 10


def test_eval_set_has_full_precision_and_recall():
    r = evaluate()
    assert r["fn"] == 0, "a real change was missed"
    assert r["fp"] == 0, "noise was reported as a change"
    assert r["tp"] >= 8


def test_embed_is_unit_length_and_right_size():
    vector = embed("Pricing plans for growing teams")
    assert len(vector) == EMBEDDING_DIM
    assert np.linalg.norm(vector) == pytest.approx(1.0, abs=1e-5)
    assert len(embed("")) == EMBEDDING_DIM


def test_embed_sees_the_end_of_long_pages():
    """Regression: the model only reads 256 tokens, so a plain encode() of a long page ignored
    everything after the first ~200 words. Chunking must make the tail count."""
    head = " ".join(f"compliance automation platform section {i}" for i in range(100))
    a = embed(head + " " + "pricing starter growth enterprise plans " * 40)
    b = embed(head + " " + "kubernetes container orchestration clusters " * 40)
    assert cosine_similarity(a, b) < 0.99


def test_cosine_similarity_handles_zero_vectors():
    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
