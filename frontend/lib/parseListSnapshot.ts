// backend/collectors/community_collector.py and news_collector.py each build their raw content
// as a list of "<title> — <url> (points: N[, comments: N])" lines, but BaseCollector._normalize()
// (backend/collectors/base.py) collapses ALL whitespace — including the newlines between those
// lines — into single spaces before storing it as Snapshot.content, so what's saved is one
// lowercase, run-on wall of text with no visible line breaks. Re-splitting it back into items
// here is a display-only fix: it doesn't touch collection, hashing, or change detection, so
// none of that behavior is at risk — this just reconstructs a readable list from the same text.
export interface ListSnapshotItem {
  title: string;
  url: string | null;
  points: number;
  comments: number | null;
}

// Non-greedy title capture up to the first " — ", then an optional URL, then the
// "(points: N[, comments: N])" tail that marks the end of one item.
const ITEM_RE = /([\s\S]+?)\s+—\s*(\S*)\s*\(points:\s*(\d+)(?:,\s*comments:\s*(\d+))?\)/g;

export function parseListSnapshot(content: string): ListSnapshotItem[] | null {
  const items: ListSnapshotItem[] = [];
  let match: RegExpExecArray | null;
  ITEM_RE.lastIndex = 0;
  while ((match = ITEM_RE.exec(content)) !== null) {
    const rawTitle = match[1].replace(/^\[hn\]\s*/i, "").trim();
    const url = match[2] && match[2] !== "" ? match[2] : null;
    items.push({
      title: rawTitle,
      url,
      points: Number(match[3]),
      comments: match[4] !== undefined ? Number(match[4]) : null,
    });
  }
  return items.length > 0 ? items : null;
}
