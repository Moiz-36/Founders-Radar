"""Scrapes a competitor's feature/changelog/blog page."""

from bs4 import BeautifulSoup

from backend.collectors.base import BaseCollector


class FeatureCollector(BaseCollector):
    source_type = "feature"

    def fetch_raw(self) -> str:
        response = self._get()
        soup = BeautifulSoup(response.text, "html.parser")

        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()

        return soup.get_text(separator=" ", strip=True)
