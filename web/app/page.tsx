import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { LandingPage } from "@/components/landing/LandingPage";

export default async function Home() {
  // `/` is the public marketing landing for signed-out visitors. Signed-in
  // users get bounced to the real dashboard at `/subjects` so the URL bar
  // matches the screen they're on.
  const { userId } = await auth();
  if (userId) {
    redirect("/subjects");
  }
  return <LandingPage />;
}
