"""Scrapes a competitor's pricing page."""

from bs4 import BeautifulSoup

from backend.collectors.base import BaseCollector


class PricingCollector(BaseCollector):
    source_type = "pricing"

    def fetch_raw(self) -> str:
        response = self._get()
        soup = BeautifulSoup(response.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()

        return soup.get_text(separator=" ", strip=True)
