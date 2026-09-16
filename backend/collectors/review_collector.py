"""Scrapes a competitor's review-site profile page (G2 / Capterra / Trustpilot) for its
current rating and review count.

Review-site profile pages render their star rating and review count via client-side
JS widgets, same reasoning as JobsCollector, so this uses Playwright instead of a plain
`requests` GET.
"""

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from backend.collectors.base import BaseCollector, is_allowed_by_robots


class ReviewCollector(BaseCollector):
    source_type = "review"

    def fetch_raw(self) -> str:
        if not is_allowed_by_robots(self.url):
            raise PermissionError(f"robots.txt disallows fetching {self.url}")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page()
            page.goto(self.url, timeout=30_000, wait_until="networkidle")
            html = page.content()
            browser.close()

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()

        return soup.get_text(separator=" ", strip=True)
