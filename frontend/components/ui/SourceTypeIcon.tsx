import { Briefcase, DollarSign, Globe, MessageSquare, Newspaper, Sparkles, Star, type LucideIcon } from "lucide-react";
import { SourceType } from "@/lib/types";

const ICON_BY_SOURCE_TYPE: Record<SourceType, LucideIcon> = {
  pricing: DollarSign,
  feature: Sparkles,
  job_posting: Briefcase,
  review: Star,
  news: Newspaper,
  community: MessageSquare,
  general: Globe,
};

export function SourceTypeIcon({
  type,
  size = 14,
  className,
}: {
  type: SourceType;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_BY_SOURCE_TYPE[type];
  return <Icon size={size} className={className} aria-hidden="true" />;
}
