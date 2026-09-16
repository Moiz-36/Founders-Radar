"""Scrapes any page as a catch-all "track everything about this competitor" source, for a
founder who wants the whole picture rather than one specific category (pricing, features,
etc). Same generic whole-page-text approach as PricingCollector/FeatureCollector — no
category-specific parsing — since the point is breadth, not depth on one topic; the analyst
LLM is generic enough to describe whatever actually changed on the page.
"""

from bs4 import BeautifulSoup

from backend.collectors.base import BaseCollector


class GeneralCollector(BaseCollector):
    source_type = "general"

    def fetch_raw(self) -> str:
        response = self._get()
        soup = BeautifulSoup(response.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()

        return soup.get_text(separator=" ", strip=True)
