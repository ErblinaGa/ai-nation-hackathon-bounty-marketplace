// Hardcoded demo tasks for the hackathon pitch.
// These are used by the /post page "Use Template" buttons and by reference agents.
import type { Language } from "@/lib/types";

export interface DemoTask {
  id: string;
  title: string;
  description: string;
  language: Language;
  starter_code: string;
  test_suite: string;
  max_bounty_sats: number;
  deadline_minutes: number;
  reference_solution: string;
}

export const DEMO_TASKS: DemoTask[] = [
  {
    id: "demo-isPalindrome",
    title: "Implement isPalindrome",
    description:
      "Function that returns true if the input string is a palindrome, ignoring case and non-alphanumeric characters.",
    language: "typescript",
    starter_code: `export function isPalindrome(s: string): boolean {
  // TODO
  return false;
}`,
    test_suite: `import { isPalindrome } from './solution';

describe('isPalindrome', () => {
  test('basic palindromes', () => {
    expect(isPalindrome('racecar')).toBe(true);
    expect(isPalindrome('hello')).toBe(false);
  });
  test('case insensitive', () => {
    expect(isPalindrome('RaceCar')).toBe(true);
  });
  test('ignores non-alphanumeric', () => {
    expect(isPalindrome("A man, a plan, a canal: Panama")).toBe(true);
  });
  test('empty string', () => {
    expect(isPalindrome('')).toBe(true);
  });
});`,
    max_bounty_sats: 5000,
    deadline_minutes: 5,
    reference_solution: `export function isPalindrome(s: string): boolean {
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === clean.split('').reverse().join('');
}`,
  },

  {
    id: "demo-parseEmails",
    title: "Implement parseEmails",
    description:
      "Extract all valid email addresses from a string. Deduplicate results.",
    language: "typescript",
    starter_code: `export function parseEmails(text: string): string[] {
  return [];
}`,
    test_suite: `import { parseEmails } from './solution';

describe('parseEmails', () => {
  test('finds basic emails', () => {
    expect(parseEmails('Contact: alice@example.com')).toEqual(['alice@example.com']);
  });
  test('finds multiple emails', () => {
    const text = 'Reach me at bob@test.io or carol+filter@sub.domain.co.uk';
    expect(parseEmails(text).sort()).toEqual(['bob@test.io', 'carol+filter@sub.domain.co.uk']);
  });
  test('deduplicates', () => {
    expect(parseEmails('a@b.com a@b.com')).toEqual(['a@b.com']);
  });
  test('ignores invalid', () => {
    expect(parseEmails('not-an-email @nope.com x@.y')).toEqual([]);
  });
});`,
    max_bounty_sats: 8000,
    deadline_minutes: 5,
    reference_solution: `export function parseEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;
  const matches = text.match(emailRegex) ?? [];
  return [...new Set(matches)];
}`,
  },

  {
    id: "demo-fizzBuzz",
    title: "Implement FizzBuzz",
    description:
      "Return a list of strings from 1 to n. Multiples of 3 are 'Fizz', multiples of 5 are 'Buzz', multiples of both are 'FizzBuzz'.",
    language: "python",
    starter_code: `def fizz_buzz(n: int) -> list[str]:
    return []`,
    test_suite: `import pytest
from solution import fizz_buzz

def test_basic():
    assert fizz_buzz(5) == ['1', '2', 'Fizz', '4', 'Buzz']

def test_fizzbuzz_at_15():
    result = fizz_buzz(15)
    assert result[14] == 'FizzBuzz'

def test_zero():
    assert fizz_buzz(0) == []`,
    max_bounty_sats: 3000,
    deadline_minutes: 3,
    reference_solution: `def fizz_buzz(n: int) -> list[str]:
    result = []
    for i in range(1, n + 1):
        if i % 15 == 0:
            result.append('FizzBuzz')
        elif i % 3 == 0:
            result.append('Fizz')
        elif i % 5 == 0:
            result.append('Buzz')
        else:
            result.append(str(i))
    return result`,
  },
];
