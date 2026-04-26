// Smoke test: post a codebase task using the Todo app demo
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

function loadCodebaseFiles(rootDir: string): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  const skip = ['node_modules', '.next', 'dist', '.git', 'package-lock.json'];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (skip.includes(entry)) continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        out.push({
          path: relative(rootDir, full),
          content: readFileSync(full, 'utf8'),
        });
      }
    }
  }
  walk(rootDir);
  return out;
}

const root = join(process.cwd(), 'demo-codebases', 'todo-app');
const context_files = loadCodebaseFiles(root);
console.error(`loaded ${context_files.length} files from ${root}`);

const body = {
  poster_pubkey: '02demo_poster_pubkey',
  title: 'Add dark mode toggle to settings page',
  description: 'The settings page is missing a UI to toggle theme. Add a DarkModeToggle component using the existing useTheme hook.',
  language: 'typescript',
  task_type: 'codebase',
  task_payload: {
    codebase_id: 'todo-app',
    context_files,
    test_command: 'npm test -- --run',
    task_description: 'Add a "Dark mode" toggle button to app/settings/page.tsx with data-testid="dark-mode-toggle". Use the existing useTheme() hook from components/ThemeProvider.tsx. The test in __tests__/settings.test.tsx must pass.',
  },
  starter_code: '',
  test_suite: '(see task_payload)',
  max_bounty_sats: 50000,
  deadline_minutes: 15,
};

const res = await fetch('http://localhost:3000/api/bounty', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
console.log(JSON.stringify(await res.json()));
