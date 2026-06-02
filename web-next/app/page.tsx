import LandingPage from "@/components/landing/LandingPage";

// Public marketing landing at `/` (proxy.ts treats `/` as the only public
// route). Replaces the Phase-0 seam-check — the backend was confirmed
// reachable during QA, so the throwaway has served its purpose.
export default function Home() {
  return <LandingPage />;
}
