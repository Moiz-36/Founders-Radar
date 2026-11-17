"""One collector per source type.

Most types share one of three fetch strategies from base.py; a subclass exists per type so
each has its own `source_type` (and a place for type-specific parsing if one ever needs it).
"""

from backend.collectors.base import (
    BaseCollector,
    CollectedContent,
    HackerNewsCollector,
    RenderedPageCollector,
    StaticPageCollector,
)


class PricingCollector(StaticPageCollector):
    source_type = "pricing"


class FeatureCollector(StaticPageCollector):
    """A feature, changelog, or "what's new" page."""

    source_type = "feature"


class GeneralCollector(StaticPageCollector):
    """Any page, as a catch-all "track everything about this competitor" source (usually the
    homepage) — breadth rather than depth on one topic; the analyst describes whatever changed."""

    source_type = "general"


class JobsCollector(RenderedPageCollector):
    """Careers pages are commonly JS-rendered (Greenhouse, Lever, Ashby)."""

    source_type = "job_posting"


class ReviewCollector(RenderedPageCollector):
    """G2 / Capterra / Trustpilot profile pages render rating and review count client-side."""

    source_type = "review"


class NewsCollector(HackerNewsCollector):
    """Recent HN stories mentioning the competitor — free, keyless, no rate-limit trouble."""

    source_type = "news"


class CommunityCollector(HackerNewsCollector):
    """Buying-intent / complaint chatter ("alternative to X", "switching from X") — what a
    founder deciding what to build next actually wants, per
    docs/10-competitive-feature-research.md's quick win #5.

    Reddit was dropped: its unauthenticated search endpoints now serve a login wall instead of
    JSON (2023 API lockdown), and OAuth wasn't worth provisioning for one collector — see
    docs/decisions.md's 2026-09-11 entry.
    """

    source_type = "community"
    tags = "(story,comment)"
    hits_per_query = 10
    QUERY_TEMPLATES = ("{name} alternative", "switching from {name}")

    def queries(self) -> list[str]:
        return [template.format(name=self.url) for template in self.QUERY_TEMPLATES]


COLLECTOR_BY_SOURCE_TYPE: dict[str, type[BaseCollector]] = {
    collector.source_type: collector
    for collector in (
        PricingCollector,
        FeatureCollector,
        GeneralCollector,
        JobsCollector,
        ReviewCollector,
        NewsCollector,
        CommunityCollector,
    )
}

__all__ = [
    "BaseCollector",
    "CollectedContent",
    "COLLECTOR_BY_SOURCE_TYPE",
    "CommunityCollector",
    "FeatureCollector",
    "GeneralCollector",
    "JobsCollector",
    "NewsCollector",
    "PricingCollector",
    "ReviewCollector",
]
