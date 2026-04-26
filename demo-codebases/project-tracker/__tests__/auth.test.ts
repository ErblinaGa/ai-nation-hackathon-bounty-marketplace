import { describe, it, expect, beforeEach } from "vitest";
import { findUser, MOCK_USERS } from "@/lib/auth/session";
import { validateLoginForm } from "@/lib/validation";

describe("findUser", () => {
  it("returns user for known email", () => {
    const user = findUser("alice@example.com", "anypassword");
    expect(user).not.toBeNull();
    expect(user?.email).toBe("alice@example.com");
  });

  it("returns null for unknown email", () => {
    const user = findUser("unknown@example.com", "pass");
    expect(user).toBeNull();
  });

  it("returns user for demo@example.com", () => {
    const user = findUser("demo@example.com", "demo");
    expect(user).not.toBeNull();
    expect(user?.name).toBe("Demo User");
  });

  it("any password works (demo mock)", () => {
    const user1 = findUser("alice@example.com", "wrongpassword");
    const user2 = findUser("alice@example.com", "correct");
    expect(user1).not.toBeNull();
    expect(user2).not.toBeNull();
  });
});

describe("validateLoginForm", () => {
  it("accepts valid input", () => {
    const result = validateLoginForm({ email: "alice@example.com", password: "secret" });
    expect(result.valid).toBe(true);
  });

  it("rejects missing @", () => {
    const result = validateLoginForm({ email: "notanemail", password: "secret" });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBeTruthy();
  });

  it("rejects short password", () => {
    const result = validateLoginForm({ email: "a@b.com", password: "abc" });
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBeTruthy();
  });

  it("rejects non-object", () => {
    const result = validateLoginForm(null);
    expect(result.valid).toBe(false);
  });
});
