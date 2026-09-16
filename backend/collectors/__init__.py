from backend.collectors.base import BaseCollector, CollectedContent
from backend.collectors.community_collector import CommunityCollector
from backend.collectors.feature_collector import FeatureCollector
from backend.collectors.general_collector import GeneralCollector
from backend.collectors.jobs_collector import JobsCollector
from backend.collectors.news_collector import NewsCollector
from backend.collectors.pricing_collector import PricingCollector
from backend.collectors.review_collector import ReviewCollector

COLLECTOR_BY_SOURCE_TYPE = {
    "pricing": PricingCollector,
    "feature": FeatureCollector,
    "job_posting": JobsCollector,
    "news": NewsCollector,
    "community": CommunityCollector,
    "review": ReviewCollector,
    "general": GeneralCollector,
}

__all__ = [
    "BaseCollector",
    "CollectedContent",
    "PricingCollector",
    "FeatureCollector",
    "JobsCollector",
    "NewsCollector",
    "CommunityCollector",
    "ReviewCollector",
    "GeneralCollector",
    "COLLECTOR_BY_SOURCE_TYPE",
]
