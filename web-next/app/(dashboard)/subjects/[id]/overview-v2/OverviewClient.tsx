"use client";

import { useRouter } from "next/navigation";
import {
  OverviewDashboard,
  type OverviewData,
  type ThemeId,
} from "@/components/overview/OverviewDashboard";

/**
 * Client wrapper: owns navigation for the prop-driven OverviewDashboard. A
 * server component can't pass an onClick across the boundary, so the adapted
 * (serializable) data comes in as a prop and this component supplies onNavigate.
 *
 * Theme-detail pages don't exist yet, so each ThemeId routes to the closest
 * existing spoke for now; repoint these once the theme routes are built.
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
    />
  );
}
