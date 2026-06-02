import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Phase 0: intentionally minimal. ClerkProvider is WIRING — lib/api.ts
// and proxy.ts both depend on Clerk being initialized. No fonts, theme,
// or branding here on purpose: the new front end is a blank canvas.
export const metadata: Metadata = {
  title: "byline (web-next)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
