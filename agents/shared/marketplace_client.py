"""
[marketplace_client] Async HTTP client for the Lightning Bounty Marketplace REST API.
"""
import os
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

API_BASE = os.environ.get("API_BASE", "http://localhost:3000/api")


class MarketplaceClient:
    def __init__(self, base_url: str = API_BASE):
        self._base = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=30.0)

    async def list_bounties(
        self, language: str | None = None, status: str = "OPEN"
    ) -> list[dict[str, Any]]:
        """[MarketplaceClient][list_bounties] Returns list of bounties."""
        params: dict[str, str] = {"status": status}
        if language:
            params["language"] = language

        try:
            resp = await self._client.get(f"{self._base}/bounties", params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("bounties", [])
        except httpx.HTTPStatusError as e:
            logger.error(
                "[MarketplaceClient][list_bounties] HTTP error %s: %s",
                e.response.status_code,
                e.response.text,
            )
            return []
        except Exception as e:
            logger.error("[MarketplaceClient][list_bounties] Unexpected error: %s", e)
            return []

    async def get_bounty(self, bounty_id: str) -> dict[str, Any] | None:
        """[MarketplaceClient][get_bounty] Returns full bounty detail."""
        if not bounty_id:
            logger.error("[MarketplaceClient][get_bounty] bounty_id is required")
            return None

        try:
            resp = await self._client.get(f"{self._base}/bounty/{bounty_id}")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "[MarketplaceClient][get_bounty] HTTP error %s for bounty %s: %s",
                e.response.status_code,
                bounty_id,
                e.response.text,
            )
            return None
        except Exception as e:
            logger.error(
                "[MarketplaceClient][get_bounty] Unexpected error for bounty %s: %s",
                bounty_id,
                e,
            )
            return None

    async def submit_bid(
        self,
        bounty_id: str,
        code: str,
        asked_price: int,
        bidder_pubkey: str,
        bid_type: str = "code",
        ensemble_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """[MarketplaceClient][submit_bid] Submits a bid. Returns bid_id and stake_invoice.

        Args:
            bounty_id: The bounty to bid on.
            code: Raw code (snippet), unified diff (codebase/bug_bounty), or proof JSON.
            asked_price: Bid price in satoshis.
            bidder_pubkey: Bidder's Lightning pubkey.
            bid_type: "code" | "diff" | "proof". Defaults to "code" (backward compat).
            ensemble_metadata: Optional EnsembleMetadata dict for ensemble bids.
        """
        if not all([bounty_id, code, asked_price > 0, bidder_pubkey]):
            logger.error("[MarketplaceClient][submit_bid] Invalid input parameters")
            return None

        payload: dict[str, Any] = {
            "bidder_pubkey": bidder_pubkey,
            "bid_type": bid_type,
            "code": code,
            "asked_price_sats": asked_price,
        }

        if ensemble_metadata is not None:
            payload["ensemble_metadata"] = ensemble_metadata

        try:
            resp = await self._client.post(
                f"{self._base}/bounty/{bounty_id}/bid", json=payload
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "[MarketplaceClient][submit_bid] HTTP error %s for bounty %s: %s",
                e.response.status_code,
                bounty_id,
                e.response.text,
            )
            return None
        except Exception as e:
            logger.error(
                "[MarketplaceClient][submit_bid] Unexpected error for bounty %s: %s",
                bounty_id,
                e,
            )
            return None

    async def check_bid_status(self, bid_id: str) -> dict[str, Any] | None:
        """[MarketplaceClient][check_bid_status] Polls bid status."""
        if not bid_id:
            logger.error("[MarketplaceClient][check_bid_status] bid_id is required")
            return None

        try:
            resp = await self._client.get(f"{self._base}/bid/{bid_id}")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "[MarketplaceClient][check_bid_status] HTTP error %s for bid %s: %s",
                e.response.status_code,
                bid_id,
                e.response.text,
            )
            return None
        except Exception as e:
            logger.error(
                "[MarketplaceClient][check_bid_status] Unexpected error for bid %s: %s",
                bid_id,
                e,
            )
            return None

    async def get_stats(self, pubkey: str) -> dict[str, Any] | None:
        """[MarketplaceClient][get_stats] Returns public settlement stats for a pubkey."""
        if not pubkey:
            logger.error("[MarketplaceClient][get_stats] pubkey is required")
            return None

        try:
            resp = await self._client.get(f"{self._base}/stats/{pubkey}")
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(
                "[MarketplaceClient][get_stats] HTTP error %s for pubkey %s: %s",
                e.response.status_code,
                pubkey,
                e.response.text,
            )
            return None
        except Exception as e:
            logger.error(
                "[MarketplaceClient][get_stats] Unexpected error for pubkey %s: %s",
                pubkey,
                e,
            )
            return None

    async def aclose(self) -> None:
        await self._client.aclose()
