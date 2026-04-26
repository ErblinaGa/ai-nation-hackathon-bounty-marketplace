import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Sidebar } from "@/components/layout/Sidebar";
import type { ReactNode } from "react";

const SETTINGS_NAV = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/keyboard", label: "Keyboard" },
  { href: "/settings/data", label: "Data" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar items={SETTINGS_NAV} title="Settings" />
        <main id="main-content" className="flex-1 px-8 py-8 max-w-2xl">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
