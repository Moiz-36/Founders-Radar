# Competitive Feature Research — What to Add Next

Research pass done 2026-09-08 while the first Cloud Run deploy was building, to answer
"what features would make Founder's Radar great, based on what the actual competitive
intelligence market is shipping." This is idea-gathering, not a committed roadmap — nothing
here is scheduled into a phase yet. If any of these get picked up, they belong in
`docs/09-v2-plan.md`'s phase plan or a new phase.

**Caveat on sources:** several of the "best tools 2026" posts found during this research read
like SEO content-marketing (product blogs ranking their own competitors, or thin affiliate
roundups), so exact pricing/feature claims from any single post should be treated as
directional, not verified fact. The *pattern* of features repeating across independent
sources is what's trustworthy here, not any one post's specifics.

---

## The market splits into two tiers

- **Enterprise CI suites** — Klue, Crayon, Kompyte. Roughly $15K–$150K/yr, built for a
  dedicated analyst/PMM team, centered on sales "battlecards" and rep enablement.
- **Founder/indie tier** — Visualping, SnitchFeed, Competitors App, "Linkeddit Compete."
  Roughly $10–$100/mo, no dedicated analyst, just an automated weekly brief.

**Founder's Radar's actual competitive set is the founder/indie tier**, not the enterprise
suites — it's built for solo founders and small teams, not a dedicated PMM function.

---

## Features worth adding, ranked by fit with the current pipeline

### Quick wins (cheap given the existing architecture)

1. **Review-site monitoring** (G2 / Capterra / Trustpilot rating and review-count changes) —
   just another source type alongside the existing `pricing` / `feature` / `job_posting` /
   `news` collectors in `backend/collectors/`.
2. **Raw diff view alongside the LLM summary** — old/new snapshots are already stored
   (`Snapshot` model); showing "here's literally what changed" next to the AI-written summary
   builds trust the way Crayon's platform leans on.
3. **Slack/Discord delivery**, not just email — this audience lives in Slack, not
   inbox-zero email. Cheap to add alongside the email-provider decision already open on the
   Phase 3 list (`docs/09-v2-plan.md`).
4. **Multi-competitor trend chart** — `frontend/components/BarChart.tsx` already exists;
   extend it to plot several competitors' pricing/signal-count over time instead of one
   company at a time.

### Bigger differentiators (medium effort, high value)

5. **Social/community signal tracking** — the standout idea from SnitchFeed: scan
   Reddit/X/HN for "looking for an alternative to [competitor]" or complaint posts. That's a
   buying-intent signal, not just "they changed their pricing page" — more actionable for a
   founder deciding what to build next. The `news` source type already hits HN Algolia
   (per `docs/decisions.md`'s 2026-09-03 entry), so this is a natural extension of an existing
   collector, not new architecture.
6. **A single "competitive pressure score" per report** — one headline number per week (not
   just per-signal scores), so a founder can glance and know if this week matters before
   reading anything. `backend/scoring/scorer.py` already scores individual signals; this
   would aggregate them into one report-level number.

### Stretch / moonshot

7. **Auto-generated one-pager "battlecard"** ("here's how you compare to X") — the core
   value prop of Klue/Crayon, generated from the existing pricing/feature diffs via Groq.
   Biggest differentiator if the product ever expands toward small sales-led teams, not just
   solo founders.
8. **Expose an MCP server** — Crayon shipped exactly this in 2026 (letting AI agents query
   competitive data directly). Since the backend is already a FastAPI app, wrapping a couple
   of read endpoints as MCP tools is relatively cheap and rides the same agentic-AI wave the
   target users are already in.

---

## If picking just one thing next

**#5 (social/buying-intent signals)** — it's the one feature none of the cheap tools do well
yet, and it's the most "this actually told me something I didn't know" feature for a founder,
versus everyone else just diffing pricing pages.

---

## Sources

- [Competitive Intelligence Tools: 15 Compared (2026) | Autobound](https://www.autobound.ai/blog/top-15-competitive-intelligence-tools-2026)
- [Top Competitive Intelligence Tools for B2B Tech Teams in 2026 - Klue](https://klue.com/topics/competitive-intelligence-tools-b2b-software)
- [Kompyte vs. Crayon and Klue - Product, Feature and Pricing Comparison](https://www.kompyte.com/kompyte-klue-crayon-comparison)
- [Klue vs Crayon (2026): $15-20k Pricing, Features & Verdict | Parano.ai Blog](https://parano.ai/blog/klue-vs-crayon)
- [Best Competitor Monitoring Tools for Startups (2026)](https://qubit.capital/blog/monitor-competitor-activities-tools)
- [The Best Competitor Monitoring Tools for Indie Founders and Small SaaS Teams (2026) — RivalFlag](https://rivalflag.com/blog/best-competitor-monitoring-tools-2026)
- [Best Competitor Monitoring Tools for Startups in 2026 (12 Compared)](https://snitchfeed.com/blog/best-competitor-monitoring-tools-2026)
- [Best Competitor Intelligence Tools in 2026 (Compared) | Linkeddit](https://linkeddit.com/blog/best-competitor-intelligence-tools-2026)

---

*Research pass done 2026-09-08, not yet reviewed against a committed roadmap phase.*
