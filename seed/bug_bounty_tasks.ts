// Seed tasks for the "bug bounty" tier (Path C) of the 3-tier marketplace.
// Bidder receives buggy source + a hidden test suite description and submits a
// unified diff that fixes the bug. The full hidden test suite is what the
// sandbox actually runs.
import type { BugBountyPayload, Language, TaskType } from "@/lib/types";

export interface BugBountySeedTask {
  id: string;
  title: string;
  description: string;
  language: Language;
  task_type: TaskType;
  max_bounty_sats: number;
  deadline_minutes: number;
  payload: () => BugBountyPayload;
  // Verified fallback diff. Used if the LLM produces invalid output during the
  // demo so the EnsembleBidder can always show a passing solution.
  reference_solution: string;
}

const BUGGY_PARSER = `// Parses an ISO 8601 date string and returns the Date object.
// Returns null on invalid input.
export function parseISODate(s: string): Date | null {
  const match = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2}):(\\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  // BUG: constructs a local-timezone date instead of UTC.
  // For inputs without explicit time, this gives wrong day for non-UTC timezones.
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}
`;

// Hidden test suite — the bidder sees the symptom but not these tests until the
// sandbox runs their diff. Verified to:
//   - FAIL all 3 against the unfixed BUGGY_PARSER under TZ=Asia/Tokyo
//   - PASS all 3 against the reference_solution under any TZ
const HIDDEN_TESTS = `import { describe, test, expect } from 'vitest';
import { parseISODate } from './solution';

describe('parseISODate', () => {
  test('basic ISO date round-trips through UTC', () => {
    const d = parseISODate('2024-03-15');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  test('returns null on invalid month', () => {
    expect(parseISODate('not-a-date')).toBeNull();
    expect(parseISODate('2024-13-01')).toBeNull();
  });

  test('UTC consistency for date-only inputs', () => {
    const d = parseISODate('2024-01-01');
    expect(d!.getUTCFullYear()).toBe(2024);
    expect(d!.getUTCMonth()).toBe(0);
    expect(d!.getUTCDate()).toBe(1);
  });
});
`;

// Verified working fix:
//   - tightens the regex so 2024-13-01 (month 13) is rejected
//   - wraps the Date constructor in Date.UTC() so date-only inputs are anchored
//     to UTC midnight (otherwise they live at local midnight, which round-trips
//     to a different UTC date in any non-UTC timezone)
const PARSE_ISO_DATE_REFERENCE_DIFF = `--- a/solution.ts
+++ b/solution.ts
@@ -1,17 +1,15 @@
 // Parses an ISO 8601 date string and returns the Date object.
 // Returns null on invalid input.
 export function parseISODate(s: string): Date | null {
-  const match = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2}):(\\d{2}))?$/);
+  const match = s.match(/^(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])(?:T([01]\\d|2[0-3]):([0-5]\\d):([0-5]\\d))?$/);
   if (!match) return null;
   const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
-  // BUG: constructs a local-timezone date instead of UTC.
-  // For inputs without explicit time, this gives wrong day for negative-offset timezones.
-  return new Date(
+  return new Date(Date.UTC(
     parseInt(year),
     parseInt(month) - 1,
     parseInt(day),
     parseInt(hour),
     parseInt(minute),
     parseInt(second)
-  );
+  ));
 }
`;

export const BUG_BOUNTY_TASKS: BugBountySeedTask[] = [
  {
    id: "bug-iso-date",
    title: "Fix subtle timezone bug in parseISODate",
    description:
      "parseISODate() returns a Date that, when its UTC components are read, gives the wrong day for date-only inputs in any non-UTC timezone. The hidden test suite asserts UTC consistency. It also rejects clearly invalid inputs like '2024-13-01' which the current regex accidentally accepts. Submit a unified diff against solution.ts.",
    language: "typescript",
    task_type: "bug_bounty",
    max_bounty_sats: 20_000,
    deadline_minutes: 8,
    payload: (): BugBountyPayload => ({
      target_code: BUGGY_PARSER,
      language: "typescript",
      symptom:
        "parseISODate(\"2024-01-01\") returns a Date whose UTC components do not match the input. In TZ=Asia/Tokyo, getUTCFullYear() returns 2023 instead of 2024 because the constructor builds a local-midnight date that rolls back across the date line in UTC.",
      failing_input_example:
        "parseISODate(\"2024-01-01\") in TZ=Asia/Tokyo => Date(2023-12-31T15:00:00Z), so getUTCDate() === 31 not 1. Also: parseISODate(\"2024-13-01\") returns a Date instead of null because the regex permits month 13.",
      hidden_test_suite: HIDDEN_TESTS,
    }),
    reference_solution: PARSE_ISO_DATE_REFERENCE_DIFF,
  },
];
