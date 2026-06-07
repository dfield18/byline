"use client";

import { useRouter } from "next/navigation";
import {
  OverviewDashboard,
  type OverviewData,
  type ThemeId,
  type Spoke,
} from "@/components/dashboard-v2/OverviewDashboard";

/**
 * Client wrapper for the dashboard_v2 copy: owns navigation for the prop-driven
 * OverviewDashboard. A server component can't pass an onClick across the
 * boundary, so the adapted (serializable) data comes in as a prop and this
 * component supplies onNavigate / onOpenSpoke.
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
      onOpenSpoke={(spoke: Spoke) => router.push(`/subjects/${subjectId}/${spoke}`)}
    />
  );
}
