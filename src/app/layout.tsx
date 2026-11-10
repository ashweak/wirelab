import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WireLab PH — 3D wiring lab with PEC checks",
  description:
    "Browser 3D residential wiring lab for Filipino electrical engineers: load schedule, breaker and wire sizing, voltage drop, and a breaker-trip demo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
