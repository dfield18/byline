import { LandingPage } from "@/components/landing/LandingPage";

export default function Home() {
  // `/` always renders the public marketing landing. Signed-in users
  // navigate to the dashboard at `/subjects` themselves via the
  // header link.
  return <LandingPage />;
}
