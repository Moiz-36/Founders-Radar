"""Runs change_detector.detect_change (stage 1 of change detection) against the labeled eval
set and reports precision/recall.

Stage 1 is tuned for recall — it must never drop a real change — and may pass borderline
wording edits on to the LLM analyst (stage 2). Noise examples marked "stage2" are expected
to pass stage 1 and are reported separately rather than counted as false positives.

Usage: python -m eval.run_eval
"""

import json
from pathlib import Path

from backend.detection.change_detector import detect_change

EVAL_SET_PATH = Path(__file__).parent / "change_detection_eval_set.json"


def load_examples() -> list[dict]:
    data = json.loads(EVAL_SET_PATH.read_text(encoding="utf-8"))
    page = data.get("page", "")
    return [
        {**e, "old_text": e["old_text"].replace("{page}", page), "new_text": e["new_text"].replace("{page}", page)}
        for e in data["examples"]
    ]


def evaluate() -> dict:
    tp = fp = tn = fn = handed_to_stage2 = 0
    rows = []
    for example in load_examples():
        result = detect_change(example["old_text"], example["new_text"])
        actual_real = example["label"] == "real"
        if example.get("stage2"):
            handed_to_stage2 += result.is_real
            status = "OK (stage 2)" if result.is_real else "OK"
        elif result.is_real and actual_real:
            tp += 1
            status = "OK"
        elif result.is_real:
            fp += 1
            status = "MISS (false positive)"
        elif actual_real:
            fn += 1
            status = "MISS (false negative)"
        else:
            tn += 1
            status = "OK"
        rows.append((status, example["id"], result.similarity))
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "stage2": handed_to_stage2, "rows": rows}


def main() -> None:
    r = evaluate()
    for status, example_id, similarity in r["rows"]:
        print(f"[{status}] {example_id}: similarity={similarity:.4f}")
    precision = r["tp"] / (r["tp"] + r["fp"]) if r["tp"] + r["fp"] else float("nan")
    recall = r["tp"] / (r["tp"] + r["fn"]) if r["tp"] + r["fn"] else float("nan")
    print(f"\nTP={r['tp']} FP={r['fp']} TN={r['tn']} FN={r['fn']} (+{r['stage2']} handed to the LLM by design)")
    print(f"Precision: {precision:.3f}  Recall: {recall:.3f}")


if __name__ == "__main__":
    main()
