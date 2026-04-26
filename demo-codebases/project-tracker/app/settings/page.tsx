import { redirect } from "next/navigation";

// Redirect /settings → /settings/profile
export default function SettingsPage() {
  redirect("/settings/profile");
}
