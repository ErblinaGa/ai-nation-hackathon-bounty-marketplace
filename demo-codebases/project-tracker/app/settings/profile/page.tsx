"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import type { User } from "@/lib/types";

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    const session = getSession();
    if (session) {
      setUser(session.user);
      setName(session.user.name);
    }
  }, []);

  function handleSave() {
    showToast("Profile saved (mock — no persistence)", "success");
  }

  const field = "w-full px-3 py-2 border border-[--border] bg-transparent text-sm text-[--text] focus:outline-none focus:border-[--accent]";
  const label = "block text-xs font-mono uppercase tracking-widest text-[--text-muted] mb-1";

  return (
    <div>
      <h1 className="font-display font-bold text-2xl text-[--text] mb-6">Profile</h1>
      {user && (
        <div className="space-y-4 max-w-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 border-2 border-[--accent] flex items-center justify-center font-display font-bold text-lg text-[--accent]">
              {user.avatarInitials}
            </div>
            <div>
              <p className="font-medium text-[--text]">{user.name}</p>
              <p className="text-xs font-mono text-[--text-muted]">{user.email}</p>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="profile-name">Display name</label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="profile-email">Email</label>
            <input
              id="profile-email"
              value={user.email}
              disabled
              className={`${field} opacity-50 cursor-not-allowed`}
            />
            <p className="mt-1 text-xs text-[--text-muted]">Email cannot be changed in demo</p>
          </div>
          <Button variant="primary" size="md" onClick={handleSave} aria-label="Save profile">
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
