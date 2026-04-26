// Smoke test: post a bug_bounty task inline (avoids @/ path-alias issues with tsx CLI)
const BUGGY_PARSER = `// Parses an ISO 8601 date string and returns the Date object.
// Returns null on invalid input.
export function parseISODate(s: string): Date | null {
  const match = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:T(\\d{2}):(\\d{2}):(\\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}`;

const HIDDEN_TESTS = `import { parseISODate } from './solution';
describe('parseISODate', () => {
  test('basic ISO date', () => {
    const d = parseISODate('2024-03-15');
    expect(d).not.toBeNull();
    expect(d!.toISOString().slice(0, 10)).toBe('2024-03-15');
  });
  test('returns null on invalid', () => {
    expect(parseISODate('not-a-date')).toBeNull();
  });
  test('UTC consistency for date-only inputs', () => {
    const d = parseISODate('2024-01-01');
    expect(d!.getUTCFullYear()).toBe(2024);
    expect(d!.getUTCMonth()).toBe(0);
    expect(d!.getUTCDate()).toBe(1);
  });
});`;

const body = {
  poster_pubkey: '02demo_poster_pubkey',
  title: 'Fix subtle DST bug in parseISODate',
  description: 'parseISODate returns wrong date for date-only inputs in non-UTC timezones.',
  language: 'typescript',
  task_type: 'bug_bounty',
  task_payload: {
    target_code: BUGGY_PARSER,
    language: 'typescript',
    symptom: 'parseISODate("2024-01-01") returns wrong UTC date in non-UTC timezones.',
    failing_input_example: 'TZ=Asia/Tokyo: parseISODate("2024-01-01").toISOString() = "2023-12-31T15:00:00Z"',
    hidden_test_suite: HIDDEN_TESTS,
  },
  starter_code: '',
  test_suite: '(see task_payload.hidden_test_suite)',
  max_bounty_sats: 20000,
  deadline_minutes: 10,
};

const res = await fetch('http://localhost:3000/api/bounty', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const data = await res.json();
console.log(JSON.stringify(data));
