from pipeline.collectors.base import BaseCollector, CollectedContent
from pipeline.collectors.feature_collector import FeatureCollector
from pipeline.collectors.jobs_collector import JobsCollector
from pipeline.collectors.news_collector import NewsCollector
from pipeline.collectors.pricing_collector import PricingCollector

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
