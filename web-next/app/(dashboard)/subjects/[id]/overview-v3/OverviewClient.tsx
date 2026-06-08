"use client";

import { useRouter } from "next/navigation";
import {
  OverviewDashboard,
  type OverviewData,
  type ThemeId,
  type Spoke,
} from "@/components/overview-v3/OverviewDashboard";

/**
 * Client wrapper for overview-v3: owns navigation for the prop-driven
 * OverviewDashboard (server components can't pass onClick across the boundary).
 */
const THEME_ROUTE: Record<ThemeId, string> = {
  issues: "prompts",
  "recent-news": "visibility",
  candidate: "narrative",
  race: "competition",
};

export function OverviewClient({
  data,
  subjectId,
}: {
  data: OverviewData;
  subjectId: number;
}) {
  const router = useRouter();
  return (
    <OverviewDashboard
      data={data}
      onNavigate={(themeId) =>
        router.push(`/subjects/${subjectId}/${THEME_ROUTE[themeId]}`)
      }
      onOpenSpoke={(spoke: Spoke) => router.push(`/subjects/${subjectId}/${spoke}`)}
    />
  );
}
