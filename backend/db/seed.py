"""Seeds the ComplyDo pilot: target company, competitors, and their source URLs.

Run once against the real Supabase DB after applying infra/sql/schema.sql:
    python -m backend.db.seed

Idempotent: re-running skips rows that already exist (matched by name/url).
"""

import logging

from backend.db.models import Competitor, Source, TargetCompany
from backend.db.session import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("founders_radar.seed")

# Researched 2026-09-03 — see docs/decisions.md for why Vanta + Drata were picked
# over the other candidates considered (Scytale, StartComply).
COMPETITORS = [
    {
        "name": "Vanta",
        "website": "https://www.vanta.com",
        "sources": [
            ("pricing", "https://www.vanta.com/pricing"),
            ("feature", "https://www.vanta.com/whats-new"),
            ("job_posting", "https://jobs.ashbyhq.com/vanta"),
            # NewsCollector treats `url` as an HN Algolia search query, not a page to scrape.
            ("news", "Vanta"),
        ],
    },
    {
        "name": "Drata",
        "website": "https://drata.com",
        "sources": [
            ("pricing", "https://drata.com/pricing"),
            # No dedicated changelog exists; blog is the closest feature-update signal.
            ("feature", "https://drata.com/blog"),
            # No job_posting source: drata.com/about/careers sits behind a Cloudflare bot
            # challenge Playwright can't legitimately pass, and there's no external ATS
            # (Greenhouse/Lever/Ashby) mirror to use instead. See docs/decisions.md.
            ("news", "Drata"),
        ],
    },
]


def seed() -> None:
    session = SessionLocal()
    try:
        target_company = session.query(TargetCompany).filter_by(name="ComplyDo").one_or_none()
        if target_company is None:
            target_company = TargetCompany(name="ComplyDo")
            session.add(target_company)
            session.flush()
            logger.info("Created target company ComplyDo (%s)", target_company.id)
        else:
            logger.info("Target company ComplyDo already exists (%s)", target_company.id)

        for entry in COMPETITORS:
            competitor = (
                session.query(Competitor)
                .filter_by(target_company_id=target_company.id, name=entry["name"])
                .one_or_none()
            )
            if competitor is None:
                competitor = Competitor(
                    target_company_id=target_company.id,
                    name=entry["name"],
                    website=entry["website"],
                )
                session.add(competitor)
                session.flush()
                logger.info("Created competitor %s (%s)", competitor.name, competitor.id)
            else:
                logger.info("Competitor %s already exists (%s)", competitor.name, competitor.id)

            for source_type, url in entry["sources"]:
                existing = (
                    session.query(Source)
                    .filter_by(competitor_id=competitor.id, url=url)
                    .one_or_none()
                )
                if existing is None:
                    session.add(Source(competitor_id=competitor.id, source_type=source_type, url=url))
                    logger.info("  + %s source: %s", source_type, url)
                else:
                    logger.info("  = %s source already exists: %s", source_type, url)

        session.commit()
        logger.info("Seed complete.")
    finally:
        session.close()


if __name__ == "__main__":
    seed()
