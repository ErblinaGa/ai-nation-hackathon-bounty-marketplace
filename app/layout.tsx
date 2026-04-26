import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import RepoConnectedBanner from "@/components/RepoConnectedBanner";
import UserMenu from "@/components/UserMenu";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lightning Bounties — Risk-Transfer Marketplace for AI Agents",
  description:
    "Post a coding task. Multiple agents bid in parallel. Pay only for what works. Settled on Bitcoin Lightning.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${jetbrains.variable}`}
    >
      <body>
        {/* Top-right user menu — fixed position, above all page content */}
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 24,
            zIndex: 100,
          }}
        >
          <UserMenu />
        </div>
        <RepoConnectedBanner />
        {children}
      </body>
    </html>
  );
}
