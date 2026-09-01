"""Renders chart_data (from assembler.build_chart_data) to PNG files for report embedding."""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless rendering for server-side use
import matplotlib.pyplot as plt

# Palette kept small and consistent across all charts in a report.
PALETTE = ["#2C3E50", "#5B7DB1", "#8FA8C7", "#C4CFDB", "#E8B84B"]


def render_volume_by_competitor(chart_data: dict, output_path: Path) -> Path:
    volume = chart_data["volume_by_competitor"]
    fig, ax = plt.subplots(figsize=(6, 3.5))
    ax.bar(volume.keys(), volume.values(), color=PALETTE[0])
    ax.set_title("Signal Volume by Competitor")
    ax.set_ylabel("Signals")
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    return output_path


def render_category_breakdown(chart_data: dict, output_path: Path) -> Path:
    breakdown = chart_data["category_breakdown"]
    fig, ax = plt.subplots(figsize=(4.5, 4.5))
    ax.pie(
        breakdown.values(),
        labels=breakdown.keys(),
        colors=PALETTE,
        autopct="%1.0f%%",
        startangle=90,
    )
    ax.set_title("Signals by Category")
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    return output_path


def render_report_charts(chart_data: dict, output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    return {
        "volume_by_competitor": render_volume_by_competitor(
            chart_data, output_dir / "volume_by_competitor.png"
        ),
        "category_breakdown": render_category_breakdown(
            chart_data, output_dir / "category_breakdown.png"
        ),
    }
