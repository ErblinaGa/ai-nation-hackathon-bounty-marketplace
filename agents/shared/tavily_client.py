"""
[tavily_client] Web search grounding for bidder agents.

Called by LLMClient before LLM generation when TAVILY_API_KEY is set.
Returns a synthesized answer + top-k sources that get embedded into the
solution prompt as <web_context>...</web_context>.

Cheap (free dev tier covers thousands of demo queries). Failure is non-fatal:
if Tavily is unreachable, returns None and the LLM proceeds without grounding.
"""
import os
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GroundingResult:
    """Web context attached to a bid for transparency + LLM grounding."""
    query: str
    answer: str
    sources: list[dict]  # [{title, url, content_snippet}]

    def as_prompt_block(self) -> str:
        """Format as a <web_context> block to prepend to the solution prompt."""
        if not self.answer and not self.sources:
            return ""

        lines = ["<web_context>"]
        if self.answer:
            lines.append(f"Synthesized answer: {self.answer}")
        if self.sources:
            lines.append("\nTop sources:")
            for i, src in enumerate(self.sources, 1):
                title = src.get("title", "(untitled)")
                url = src.get("url", "")
                snippet = (src.get("content_snippet") or "")[:300]
                lines.append(f"  [{i}] {title} — {url}")
                if snippet:
                    lines.append(f"      {snippet}")
        lines.append("</web_context>")
        return "\n".join(lines)


class TavilyClient:
    """Smart-stub Tavily wrapper. No-op if TAVILY_API_KEY is unset."""

    def __init__(self) -> None:
        self._client = None
        api_key = os.environ.get("TAVILY_API_KEY")
        if not api_key:
            logger.info("[TavilyClient] TAVILY_API_KEY not set — grounding disabled")
            return
        try:
            from tavily import TavilyClient as _Tavily
            self._client = _Tavily(api_key=api_key)
            logger.info("[TavilyClient] initialized")
        except ImportError:
            logger.warning("[TavilyClient] tavily-python not installed — grounding disabled")

    @property
    def enabled(self) -> bool:
        return self._client is not None

    async def ground(self, bounty: dict) -> Optional[GroundingResult]:
        """Search for context relevant to the bounty. Returns None on any failure."""
        if not self._client:
            return None

        query = self._build_query(bounty)
        try:
            import asyncio
            response = await asyncio.to_thread(
                self._client.search,
                query=query,
                search_depth="basic",
                max_results=3,
                include_answer=True,
            )
        except Exception as e:
            logger.warning("[TavilyClient][ground] search failed for '%s': %s", query, e)
            return None

        sources = [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content_snippet": r.get("content", ""),
            }
            for r in response.get("results", [])
        ]
        result = GroundingResult(
            query=query,
            answer=response.get("answer") or "",
            sources=sources,
        )
        logger.info(
            "[TavilyClient][ground] query='%s' got answer=%s sources=%d",
            query,
            bool(result.answer),
            len(result.sources),
        )
        return result

    @staticmethod
    def _build_query(bounty: dict) -> str:
        """Compose a focused search query from bounty title + language."""
        title = bounty.get("title", "")
        language = bounty.get("language", "")
        # Strip common imperative prefix from titles like "Implement isPalindrome"
        normalized = title.removeprefix("Implement ").strip()
        if language:
            return f"{normalized} {language} implementation best practice"
        return f"{normalized} implementation best practice"


_singleton: Optional[TavilyClient] = None


def get_tavily_client() -> TavilyClient:
    global _singleton
    if _singleton is None:
        _singleton = TavilyClient()
    return _singleton
