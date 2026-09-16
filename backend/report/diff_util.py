"""Word-level diff between two snapshot contents, rendered as HTML with <ins>/<del> markup —
the "raw diff view alongside the LLM summary" from docs/10-competitive-feature-research.md's
quick win #2. Used by backend/report/assembler.py for the PDF; the web report page computes
an equivalent diff client-side in frontend/lib/diff.ts instead, since it never goes through
this backend module.
"""

import difflib
import html

MAX_CHARS = 4000  # same truncation convention as backend/analysis/analyst.py's LLM prompt


def render_diff_html(old_content: str, new_content: str) -> tuple[str, bool]:
    """Returns (diff_html, truncated)."""
    truncated = len(old_content) > MAX_CHARS or len(new_content) > MAX_CHARS
    old_words = old_content[:MAX_CHARS].split()
    new_words = new_content[:MAX_CHARS].split()

    matcher = difflib.SequenceMatcher(a=old_words, b=new_words, autojunk=False)
    parts = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            parts.append(html.escape(" ".join(old_words[i1:i2])))
        else:
            if i1 != i2:
                parts.append(f"<del>{html.escape(' '.join(old_words[i1:i2]))}</del>")
            if j1 != j2:
                parts.append(f"<ins>{html.escape(' '.join(new_words[j1:j2]))}</ins>")
    return " ".join(parts), truncated
