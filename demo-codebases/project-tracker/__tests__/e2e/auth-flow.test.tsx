import { describe, it, expect, beforeEach } from "vitest";
import { findUser, MOCK_USERS } from "@/lib/auth/session";
import { validateLoginForm } from "@/lib/validation";
import { isPublicPath } from "@/lib/auth/middleware";

describe("auth flow integration", () => {
  it("recognizes public paths", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    expect(isPublicPath("/api/auth/logout")).toBe(true);
  });

  it("does not treat app paths as public", () => {
    expect(isPublicPath("/projects")).toBe(false);
    expect(isPublicPath("/stats")).toBe(false);
    expect(isPublicPath("/settings/profile")).toBe(false);
    expect(isPublicPath("/api/tasks")).toBe(false);
  });

  it("full login flow: validate → find user → success", () => {
    const form = { email: "demo@example.com", password: "demo123" };
    const validation = validateLoginForm(form);
    expect(validation.valid).toBe(true);

    const user = findUser(form.email, form.password);
    expect(user).not.toBeNull();
    expect(user?.id).toBe("user-3");
    expect(user?.avatarInitials).toBe("DU");
  });

  it("full login flow: wrong email → null user", () => {
    const form = { email: "nobody@example.com", password: "pass" };
    const validation = validateLoginForm(form);
    expect(validation.valid).toBe(true); // form is valid

    const user = findUser(form.email, form.password);
    expect(user).toBeNull(); // but user doesn't exist
  });

  it("MOCK_USERS has expected accounts", () => {
    const emails = MOCK_USERS.map((u) => u.email);
    expect(emails).toContain("alice@example.com");
    expect(emails).toContain("bob@example.com");
    expect(emails).toContain("demo@example.com");
  });
});
