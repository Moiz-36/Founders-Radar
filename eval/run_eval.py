"""Runs change_detector.is_real_change against the labeled eval set and reports precision/recall.

Usage: python -m eval.run_eval [--threshold 0.92]
"""

import argparse
import json
from pathlib import Path

from backend.detection.change_detector import DEFAULT_SIMILARITY_THRESHOLD, is_real_change

EVAL_SET_PATH = Path(__file__).parent / "change_detection_eval_set.json"


def load_examples() -> list[dict]:
    data = json.loads(EVAL_SET_PATH.read_text())
    return data["examples"]


def run(threshold: float) -> None:
    examples = load_examples()

    true_positives = false_positives = true_negatives = false_negatives = 0

    for example in examples:
        predicted_real, similarity = is_real_change(
            example["old_text"], example["new_text"], threshold=threshold
        )
        actual_real = example["label"] == "real"

        if predicted_real and actual_real:
            true_positives += 1
        elif predicted_real and not actual_real:
            false_positives += 1
        elif not predicted_real and not actual_real:
            true_negatives += 1
        else:
            false_negatives += 1

        status = "OK" if predicted_real == actual_real else "MISS"
        print(
            f"[{status}] {example['id']}: similarity={similarity:.4f} "
            f"predicted={'real' if predicted_real else 'noise'} actual={example['label']}"
        )

    precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) else float("nan")
    recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) else float("nan")

    print(f"\nThreshold: {threshold}")
    print(f"TP={true_positives} FP={false_positives} TN={true_negatives} FN={false_negatives}")
    print(f"Precision: {precision:.3f}" if precision == precision else "Precision: n/a (no positive predictions)")
    print(f"Recall: {recall:.3f}" if recall == recall else "Recall: n/a (no actual positives)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=DEFAULT_SIMILARITY_THRESHOLD)
    args = parser.parse_args()
    run(args.threshold)
