// Deterministic color per name (hash into a fixed palette) rather than random, so the same
// company/competitor always gets the same color across pages without storing one. Palette
// pulled from DESIGN.md's brand + semantic hues so avatars read as part of the same system.
const PALETTE = [
  "bg-[#0B57D0]", // brand
  "bg-[#007A82]", // secondary/teal
  "bg-[#6f3a00]", // tertiary/brown
  "bg-[#1A73E8]", // informational blue
  "bg-[#137333]", // positive green
  "bg-[#8430CE]", // violet (not in DESIGN.md's core triad, kept desaturated-adjacent)
  "bg-[#B06000]", // warning amber (darker text step, safe as a fill)
  "bg-[#C5221F]", // critical red (darker step, safe as a fill)
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-lg font-heading font-semibold text-white ${colorFor(name)}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initialsOf(name)}
    </div>
  );
}
