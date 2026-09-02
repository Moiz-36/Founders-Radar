from backend.collectors.base import BaseCollector, CollectedContent
from backend.collectors.feature_collector import FeatureCollector
from backend.collectors.jobs_collector import JobsCollector
from backend.collectors.news_collector import NewsCollector
from backend.collectors.pricing_collector import PricingCollector

COLLECTOR_BY_SOURCE_TYPE = {
    "pricing": PricingCollector,
    "feature": FeatureCollector,
    "job_posting": JobsCollector,
    "news": NewsCollector,
}

__all__ = [
    "BaseCollector",
    "CollectedContent",
    "PricingCollector",
    "FeatureCollector",
    "JobsCollector",
    "NewsCollector",
    "COLLECTOR_BY_SOURCE_TYPE",
]
