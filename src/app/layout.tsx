import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContinuityGhost — Comparison Studio",
  description: "A private, human-reviewed cinematic continuity workspace. Compare frames with Google Gemini, review findings, and export your report.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
