"""
[fast_bidder] FastBidder — bids on all bounties under 10000 sat.
V3 winner-takes-all: always submits with asked_price = max_bounty_sats (full prize).
Strategy is purely "should I bid on this task?" — no percentage logic.
Uses claude-haiku-4-5 (falls back to reference solutions if no ANTHROPIC_API_KEY).

Handles all 3 task types:
- snippet: submits code (bid_type='code')
- codebase: submits unified diff (bid_type='diff')
- bug_bounty: submits unified diff (bid_type='diff')
"""
import asyncio
import logging
import sys

from dotenv import load_dotenv

load_dotenv()

from agents.shared.marketplace_client import MarketplaceClient
from agents.shared.lightning_client import LightningClient
from agents.shared.llm_client import LLMClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [FastBidder] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

AGENT_NAME = "FastBidder"
MAX_BOUNTY_THRESHOLD = 10_000  # only bid if max_bounty < this
POLL_INTERVAL = 10  # seconds


def _should_bid(bounty: dict) -> bool:
    return bounty.get("max_bounty_sats", 0) < MAX_BOUNTY_THRESHOLD


def _bid_type_for(task_type: str) -> str:
    """Returns the appropriate bid_type for a given task_type."""
    if task_type in ("codebase", "bug_bounty"):
        return "diff"
    return "code"


async def main() -> None:
    logger.info("Starting FastBidder (strategy: winner-takes-all full bounty, max < %d sat)", MAX_BOUNTY_THRESHOLD)

    lightning = LightningClient(AGENT_NAME)
    api = MarketplaceClient()
    llm = LLMClient("claude-haiku-4-5", temperature=0.3)

    logger.info("Pubkey: %s", lightning.pubkey)
    logger.info("Balance: %d sat (stub)", lightning.get_balance())

    already_bid: set[str] = set()

    while True:
        try:
            bounties = await api.list_bounties(status="OPEN")
            logger.info("Polled %d open bounties", len(bounties))

            for bounty in bounties:
                bounty_id = bounty.get("id", "")
                if not bounty_id or bounty_id in already_bid:
                    continue

                if not _should_bid(bounty):
                    logger.info(
                        "Skipping bounty %s (max %d sat >= threshold)",
                        bounty_id,
                        bounty.get("max_bounty_sats", 0),
                    )
                    continue

                try:
                    full = await api.get_bounty(bounty_id)
                    if not full:
                        logger.warning("Could not fetch full bounty %s", bounty_id)
                        continue

                    task_type = full.get("task_type", "snippet")
                    logger.info(
                        "Processing bounty '%s' (id=%s, task_type=%s)",
                        full.get("title", ""),
                        bounty_id,
                        task_type,
                    )

                    solution = await llm.generate_solution(full)
                    # V3 winner-takes-all: always bid the full bounty amount
                    price = full.get("max_bounty_sats", 0)
                    bid_type = _bid_type_for(task_type)

                    logger.info(
                        "Submitting bid on '%s' (id=%s) for %d sat full bounty (bid_type=%s)",
                        full.get("title", ""),
                        bounty_id,
                        price,
                        bid_type,
                    )

                    bid = await api.submit_bid(
                        bounty_id=bounty_id,
                        code=solution,
                        asked_price=price,
                        bidder_pubkey=lightning.pubkey,
                        bid_type=bid_type,
                    )

                    if not bid:
                        logger.error("Bid submission failed for bounty %s", bounty_id)
                        continue

                    already_bid.add(bounty_id)
                    logger.info("Bid submitted: %s (status: %s)", bid.get("bid_id"), bid.get("status"))

                    stake_invoice = bid.get("stake_invoice", "")
                    lightning.pay_invoice(stake_invoice)

                except Exception as e:
                    logger.error("Error processing bounty %s: %s", bounty_id, e)

        except Exception as e:
            logger.error("Error in polling loop: %s", e)

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
