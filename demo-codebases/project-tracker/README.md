# Project Tracker

Demo codebase for the Lightning Bounties Marketplace pitch.

A project + task management SaaS app built with Next.js 14, React 18, TypeScript, and Tailwind CSS. All data lives in localStorage — no backend required.

## Quick start

```bash
npm install
npm run dev       # http://localhost:3001
npm test -- --run # run all tests once
npm run build     # production build
```

Login with `demo@example.com` and any password.

## Known gaps (open bounties)

1. **Empty state illustration** — `ProjectList` shows text-only empty state, no illustration
2. **Bulk task actions** — no multi-select / bulk status change
3. **CSV import** — export works, import does not exist
4. **Drag-and-drop reordering** — tasks have no manual sort order
5. **Pomodoro timer** — no timer widget on task detail
6. **IndexedDB storage** — localStorage only, no large-data fallback
7. **Spanish translation incomplete** — `es.json` has ~60% coverage

## Stack

- Next.js 14 (App Router)
- React 18
- TypeScript strict
- Tailwind CSS (Bauhaus aesthetic: hard borders, orange accent, Space Grotesk + DM Mono)
- localStorage for persistence (no backend)
- Vitest + Testing Library for tests
- Mock cookie-based auth (any password works for demo accounts)
