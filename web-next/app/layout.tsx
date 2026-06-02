import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Inter, exposed as a CSS variable so the landing's --sans/--serif tokens
// (components/landing/landing.css) bind to it. Replaces the render-blocking
// Google Fonts <link> the source HTML used.
const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

// ClerkProvider is WIRING — lib/api.ts and proxy.ts both depend on Clerk
// being initialized. Metadata reflects the real public landing page.
export const metadata: Metadata = {
  title: "Byline — AI narrative intelligence for public affairs",
  description:
    "Byline tracks how the major AI assistants describe the people and issues you represent — and alerts you when the narrative shifts.",
  openGraph: {
    title: "Byline — AI narrative intelligence for public affairs",
    description:
      "Byline tracks how the major AI assistants describe the people and issues you represent — and alerts you when the narrative shifts.",
    type: "website",
    // TODO(user): add a share image (images: ["/og.png"]) before launch.
  },
  twitter: {
    card: "summary_large_image",
    title: "Byline — AI narrative intelligence for public affairs",
    description:
      "Byline tracks how the major AI assistants describe the people and issues you represent — and alerts you when the narrative shifts.",
    // TODO(user): add the share image once it exists.
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={inter.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
