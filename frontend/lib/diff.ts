// Word-level diff via LCS — the "raw diff view alongside the LLM summary" from
// docs/10-competitive-feature-research.md's quick win #2, computed client-side since the web
// report page fetches snapshot content directly from Supabase rather than through the
// backend. Mirrors backend/report/diff_util.py's difflib-based equivalent used for the PDF.
export interface DiffSegment {
  type: "equal" | "insert" | "delete";
  text: string;
}

export interface WordDiff {
  segments: DiffSegment[];
  truncated: boolean;
}

// Same truncation convention as backend/analysis/analyst.py's LLM prompt — these are full
// scraped-page snapshots, not short strings, and diffing them untruncated would both be slow
// (O(n*m) LCS) and unreadable.
const MAX_CHARS = 4000;

export function diffWords(oldText: string, newText: string): WordDiff {
  const truncated = oldText.length > MAX_CHARS || newText.length > MAX_CHARS;
  const a = oldText.slice(0, MAX_CHARS).split(/\s+/).filter(Boolean);
  const b = newText.slice(0, MAX_CHARS).split(/\s+/).filter(Boolean);

  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  const push = (type: DiffSegment["type"], word: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.text += " " + word;
    else segments.push({ type, text: word });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("delete", a[i]);
      i++;
    } else {
      push("insert", b[j]);
      j++;
    }
  }
  while (i < n) {
    push("delete", a[i]);
    i++;
  }
  while (j < m) {
    push("insert", b[j]);
    j++;
  }

  return { segments, truncated };
}
