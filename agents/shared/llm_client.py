"""
[llm_client] Smart-stub LLM client.
- If ANTHROPIC_API_KEY is set and model starts with "claude-": uses Anthropic SDK.
- If OPENAI_API_KEY is set and model starts with "gpt-": uses OpenAI SDK.
- Otherwise: falls back to hardcoded REFERENCE_SOLUTIONS keyed by bounty title.

Task-type-aware: supports snippet, codebase, and bug_bounty task types.
"""
import os
import logging
import json
from typing import Any

from .tavily_client import get_tavily_client

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Reference solutions for the 3 demo tasks (used when no API key is available).
# These must pass the test_suite assertions in spec section 14.
# ---------------------------------------------------------------------------

REFERENCE_SOLUTIONS: dict[str, str] = {
    "Implement isPalindrome": """\
export function isPalindrome(s: string): boolean {
  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === clean.split('').reverse().join('');
}
""",
    "Implement parseEmails": """\
export function parseEmails(text: string): string[] {
  const regex = /[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/g;
  const matches = text.match(regex) ?? [];
  return [...new Set(matches)];
}
""",
    "Implement fizzBuzz": """\
def fizz_buzz(n: int) -> list[str]:
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
    return result
""",
}

# Stub diff for codebase/bug_bounty tasks when LLM is unavailable.
# The backend sandbox will mark this FAIL, which is acceptable for no-API-key mode.
STUB_DIFF = """\
--- a/stub
+++ b/stub
@@ -0,0 +1,3 @@
+# No LLM available — stub diff submitted.
+# Set ANTHROPIC_API_KEY to enable real fix generation.
+# This bid will FAIL sandbox validation.
"""


def _strip_markdown_fences(text: str) -> str:
    """Strip ```lang ... ``` fences if the LLM wrapped its response in them.
    Claude often does this even when told not to."""
    s = text.strip()
    if not s.startswith("```"):
        return s
    # Drop opening fence (with optional language tag) and closing fence
    lines = s.split("\n")
    if lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].rstrip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip() + "\n"


# ---------------------------------------------------------------------------
# Prompts — one per task type
# ---------------------------------------------------------------------------

SNIPPET_PROMPT = """\
You are a code-writing agent competing in a bounty marketplace.
Write ONLY the implementation code — no markdown fences, no explanations.
The code must export/define exactly what the test suite imports.

Bounty title: {title}
Language: {language}
Description: {description}

Starter code (implement this):
{starter_code}

Test suite (your code must pass all tests):
{test_suite}

Write the complete implementation now:"""

CODEBASE_PROMPT = """\
You are a code-editing agent competing in a bounty marketplace.
You will receive a task description and the relevant files from a codebase.
Produce a valid UNIFIED DIFF that, when applied with `patch -p1`, implements the required changes.

Rules:
- Output ONLY the raw unified diff — no markdown fences, no prose, no explanations.
- Use proper unified diff format: `--- a/path/to/file` and `+++ b/path/to/file` headers.
- Each hunk starts with `@@ -L,S +L,S @@` where L=start line, S=count.
- Lines starting with `-` are removed, `+` are added, ` ` (space) are context.
- If creating a new file, use `--- /dev/null` and `+++ b/path/to/new/file`.

Bounty title: {title}
Language: {language}
Description: {description}
Task: {task_description}
Test command (run after applying diff): {test_command}

Relevant codebase files:
{context_files_block}

Produce the unified diff now:"""

BUG_BOUNTY_PROMPT = """\
You are a bug-fixing agent competing in a bounty marketplace.
You will receive buggy source code and a description of the bug.
Produce a valid UNIFIED DIFF that fixes the bug.

Rules:
- Output ONLY the raw unified diff — no markdown fences, no prose, no explanations.
- Use proper unified diff format: `--- a/path/to/file` and `+++ b/path/to/file` headers.
- Assume the file is at the path shown in the diff headers.
- Lines starting with `-` are removed, `+` are added, ` ` (space) are context.

Bounty title: {title}
Language: {language}
Description: {description}
Bug symptom: {symptom}
{failing_input_block}

Buggy code (fix this):
```
{target_code}
```

Hidden test suite (your fix must pass all tests):
```
{hidden_test_suite}
```

Produce the unified diff now:"""

# Max characters of codebase context to include to avoid huge API bills.
# ~30k tokens * 4 chars/token ≈ 120k chars; use 100k as safe cap.
MAX_CONTEXT_CHARS = 100_000


class LLMClient:
    def __init__(self, model_name: str, temperature: float = 0.7):
        if not model_name:
            raise ValueError("[LLMClient] model_name is required")
        self.model_name = model_name
        self.temperature = temperature
        self._anthropic = None
        self._openai = None
        self._tavily = get_tavily_client()

        if model_name.startswith("claude-") and os.environ.get("ANTHROPIC_API_KEY"):
            try:
                import anthropic
                self._anthropic = anthropic.Anthropic(
                    api_key=os.environ["ANTHROPIC_API_KEY"]
                )
                logger.info(
                    "[LLMClient][init] Using Anthropic client with model %s", model_name
                )
            except ImportError:
                logger.warning(
                    "[LLMClient][init] anthropic package not installed, falling back to stub"
                )
        elif model_name.startswith("gpt-") and os.environ.get("OPENAI_API_KEY"):
            try:
                import openai
                self._openai = openai.AsyncOpenAI(
                    api_key=os.environ["OPENAI_API_KEY"]
                )
                logger.info(
                    "[LLMClient][init] Using OpenAI async client with model %s", model_name
                )
            except ImportError:
                logger.warning(
                    "[LLMClient][init] openai package not installed, falling back to stub"
                )
        else:
            logger.info(
                "[LLMClient][init] No API key for model %s — will use reference solutions",
                model_name,
            )

    async def generate_solution(self, bounty: dict[str, Any]) -> str:
        """[LLMClient][generate_solution] Returns code solution or unified diff for the given bounty.

        Dispatches to task-type-specific generation:
        - snippet: returns implementation code (current behavior)
        - codebase: returns unified diff against context_files
        - bug_bounty: returns unified diff fixing target_code
        """
        task_type = bounty.get("task_type", "snippet")
        if task_type == "codebase":
            return await self._generate_codebase_diff(bounty)
        elif task_type == "bug_bounty":
            return await self._generate_bug_fix(bounty)
        else:
            return await self._generate_snippet(bounty)

    async def _generate_snippet(self, bounty: dict[str, Any]) -> str:
        """[LLMClient][_generate_snippet] Generates implementation code for snippet tasks."""
        title = bounty.get("title", "")
        language = bounty.get("language", "typescript")
        description = bounty.get("description", "")
        starter_code = bounty.get("starter_code") or ""
        test_suite = bounty.get("test_suite") or ""

        # Optional web grounding via Tavily
        grounding_block = ""
        if self._tavily.enabled:
            grounding = await self._tavily.ground(bounty)
            if grounding:
                grounding_block = grounding.as_prompt_block() + "\n\n"

        prompt = grounding_block + SNIPPET_PROMPT.format(
            title=title,
            language=language,
            description=description,
            starter_code=starter_code,
            test_suite=test_suite,
        )

        if self._anthropic is not None:
            raw = await self._call_anthropic(prompt, title)
            return _strip_markdown_fences(raw)
        if self._openai is not None:
            raw = await self._call_openai(prompt, title)
            return _strip_markdown_fences(raw)

        return self._fallback(title)

    async def _generate_codebase_diff(self, bounty: dict[str, Any]) -> str:
        """[LLMClient][_generate_codebase_diff] Generates unified diff for codebase tasks."""
        title = bounty.get("title", "")
        language = bounty.get("language", "typescript")
        description = bounty.get("description", "")

        # Parse task_payload — may be a JSON string or already a dict
        task_payload = bounty.get("task_payload") or {}
        if isinstance(task_payload, str):
            try:
                task_payload = json.loads(task_payload)
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(
                    "[LLMClient][_generate_codebase_diff] Failed to parse task_payload for '%s': %s",
                    title,
                    e,
                )
                task_payload = {}

        task_description = task_payload.get("task_description", description)
        test_command = task_payload.get("test_command", "npm test")
        context_files: list[dict] = task_payload.get("context_files", [])

        # Build context block, capped at MAX_CONTEXT_CHARS
        context_files_block = _build_context_files_block(context_files)

        # Optional web grounding
        grounding_block = ""
        if self._tavily.enabled:
            grounding = await self._tavily.ground(bounty)
            if grounding:
                grounding_block = grounding.as_prompt_block() + "\n\n"

        prompt = grounding_block + CODEBASE_PROMPT.format(
            title=title,
            language=language,
            description=description,
            task_description=task_description,
            test_command=test_command,
            context_files_block=context_files_block,
        )

        if self._anthropic is not None:
            raw = await self._call_anthropic(prompt, title, max_tokens=2048)
            return _strip_markdown_fences(raw)
        if self._openai is not None:
            raw = await self._call_openai(prompt, title, max_tokens=2048)
            return _strip_markdown_fences(raw)

        logger.warning(
            "[LLMClient][_generate_codebase_diff] No LLM available for '%s' — returning stub diff",
            title,
        )
        return STUB_DIFF

    async def _generate_bug_fix(self, bounty: dict[str, Any]) -> str:
        """[LLMClient][_generate_bug_fix] Generates unified diff fixing a bug_bounty task."""
        title = bounty.get("title", "")
        language = bounty.get("language", "python")
        description = bounty.get("description", "")

        # Parse task_payload
        task_payload = bounty.get("task_payload") or {}
        if isinstance(task_payload, str):
            try:
                task_payload = json.loads(task_payload)
            except (json.JSONDecodeError, ValueError) as e:
                logger.error(
                    "[LLMClient][_generate_bug_fix] Failed to parse task_payload for '%s': %s",
                    title,
                    e,
                )
                task_payload = {}

        target_code = task_payload.get("target_code", "")
        symptom = task_payload.get("symptom", description)
        failing_input = task_payload.get("failing_input_example", "")
        hidden_test_suite = task_payload.get("hidden_test_suite", "")

        failing_input_block = ""
        if failing_input:
            failing_input_block = f"Failing input example: {failing_input}"

        # Optional web grounding
        grounding_block = ""
        if self._tavily.enabled:
            grounding = await self._tavily.ground(bounty)
            if grounding:
                grounding_block = grounding.as_prompt_block() + "\n\n"

        prompt = grounding_block + BUG_BOUNTY_PROMPT.format(
            title=title,
            language=language,
            description=description,
            symptom=symptom,
            failing_input_block=failing_input_block,
            target_code=target_code,
            hidden_test_suite=hidden_test_suite,
        )

        if self._anthropic is not None:
            raw = await self._call_anthropic(prompt, title, max_tokens=2048)
            return _strip_markdown_fences(raw)
        if self._openai is not None:
            raw = await self._call_openai(prompt, title, max_tokens=2048)
            return _strip_markdown_fences(raw)

        logger.warning(
            "[LLMClient][_generate_bug_fix] No LLM available for '%s' — returning stub diff",
            title,
        )
        return STUB_DIFF

    async def _call_anthropic(self, prompt: str, title: str, max_tokens: int = 1024) -> str:
        """[LLMClient][_call_anthropic] Calls Anthropic Claude (sync SDK via asyncio.to_thread)."""
        try:
            import asyncio
            response = await asyncio.to_thread(
                self._anthropic.messages.create,
                model=self.model_name,
                max_tokens=max_tokens,
                temperature=self.temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except Exception as e:
            logger.error(
                "[LLMClient][_call_anthropic] Error calling Anthropic for '%s': %s — using fallback",
                title,
                e,
            )
            return self._fallback(title)

    async def _call_openai(self, prompt: str, title: str, max_tokens: int = 1024) -> str:
        """[LLMClient][_call_openai] Calls OpenAI async client."""
        try:
            response = await self._openai.chat.completions.create(
                model=self.model_name,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(
                "[LLMClient][_call_openai] Error calling OpenAI for '%s': %s — using fallback",
                title,
                e,
            )
            return self._fallback(title)

    def _fallback(self, title: str) -> str:
        """[LLMClient][_fallback] Returns hardcoded reference solution or a stub."""
        solution = REFERENCE_SOLUTIONS.get(title)
        if solution:
            logger.info(
                "[LLM stub] using reference solution for '%s'", title
            )
            return solution

        logger.warning(
            "[LLM stub] no reference solution for '%s' — returning empty stub", title
        )
        return "# No reference solution available for this task\n"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_context_files_block(context_files: list[dict]) -> str:
    """Build a truncated context block from context_files list.

    Each file is rendered as:
        ### path/to/file.ts
        ```
        <content>
        ```

    Total output is capped at MAX_CONTEXT_CHARS to avoid huge API costs.
    """
    if not context_files:
        return "(no context files provided)"

    parts: list[str] = []
    total_chars = 0

    for file_entry in context_files:
        path = file_entry.get("path", "(unknown)")
        content = file_entry.get("content", "")
        block = f"### {path}\n```\n{content}\n```\n"
        block_len = len(block)

        if total_chars + block_len > MAX_CONTEXT_CHARS:
            remaining = MAX_CONTEXT_CHARS - total_chars
            if remaining > 200:
                # Truncate this file's content
                truncated_content = content[: remaining - 100]
                block = f"### {path}\n```\n{truncated_content}\n... (truncated)\n```\n"
                parts.append(block)
            logger.info(
                "[LLMClient][_build_context_files_block] Context truncated at %d/%d chars after %d files",
                total_chars,
                MAX_CONTEXT_CHARS,
                len(parts),
            )
            break

        parts.append(block)
        total_chars += block_len

    return "\n".join(parts)
