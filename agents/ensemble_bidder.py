"""
[ensemble_bidder] EnsembleBidder — runs claude-sonnet-4-6 at 3 temperatures in parallel, picks the best diff.

Strategy:
- Bids on codebase + bug_bounty tasks ONLY (snippets are too small for ensemble overhead).
- Bids on ALL such tasks regardless of max_bounty_sats.
- V3 winner-takes-all: always submits with asked_price = max_bounty_sats (full prize).
- bid_type: always 'diff' (codebase/bug_bounty produce unified diffs).
- For each eligible bounty: calls sonnet@temp=0.0, sonnet@temp=0.5, sonnet@temp=1.0 in parallel via asyncio.gather.
- Shape-checks each candidate (valid unified diff headers?).
- Picks best: prefer deterministic (temp=0.0), then balanced (temp=0.5), then exploratory (temp=1.0); falls back to temp=0.0 if all fail.
- Attaches EnsembleMetadata to the bid showing all 3 temperature variants and selection reason.
"""
import asyncio
import logging
import sys
import time
from typing import Any

from dotenv import load_dotenv

load_dotenv()

from agents.shared.marketplace_client import MarketplaceClient
from agents.shared.lightning_client import LightningClient
from agents.shared.llm_client import LLMClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [EnsembleBidder] %(levelname)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

AGENT_NAME = "EnsembleBidder"
POLL_INTERVAL = 10  # seconds

# Ensemble calls — same model, 3 temperature variants for diversity.
# Ordered: deterministic → balanced → exploratory.
ENSEMBLE_CALLS = [
    {"model": "claude-sonnet-4-6", "temperature": 0.0, "label": "deterministic"},
    {"model": "claude-sonnet-4-6", "temperature": 0.5, "label": "balanced"},
    {"model": "claude-sonnet-4-6", "temperature": 1.0, "label": "exploratory"},
]

# Task types this agent bids on.
ELIGIBLE_TASK_TYPES = {"codebase", "bug_bounty"}


def _passes_shape_check(diff: str) -> bool:
    """[EnsembleBidder][_passes_shape_check] Basic sanity check for a unified diff.

    A valid unified diff must:
    1. Be non-empty.
    2. Contain at least one '--- ' header.
    3. Contain at least one '+++ ' header.
    4. Contain at least one '@@ ' hunk header.
    """
    if not diff or not diff.strip():
        return False
    lines = diff.splitlines()
    has_minus = any(l.startswith("--- ") for l in lines)
    has_plus = any(l.startswith("+++ ") for l in lines)
    has_hunk = any(l.startswith("@@ ") for l in lines)
    return has_minus and has_plus and has_hunk


async def _generate_candidate(
    llm: LLMClient, bounty: dict[str, Any]
) -> tuple[str, float]:
    """[EnsembleBidder][_generate_candidate] Calls a single LLM and returns (diff, runtime_ms).

    Returns (stub_diff, runtime_ms) on error — error is logged, not raised.
    """
    start_ms = time.monotonic() * 1000
    try:
        diff = await llm.generate_solution(bounty)
        runtime_ms = time.monotonic() * 1000 - start_ms
        return diff, runtime_ms
    except Exception as e:
        runtime_ms = time.monotonic() * 1000 - start_ms
        logger.error(
            "[EnsembleBidder][_generate_candidate] Model %s failed for bounty '%s': %s",
            llm.model_name,
            bounty.get("title", ""),
            e,
        )
        return "", runtime_ms


def _pick_best(
    candidates: list[tuple[str, float]],
) -> tuple[int, str]:
    """[EnsembleBidder][_pick_best] Picks best candidate index and selection reason.

    Strategy: prefer deterministic (temp=0.0) first, then balanced, then exploratory.
    Falls back to index 0 (deterministic) if all fail shape check.

    Returns:
        (chosen_index, selection_reason)
    """
    for idx in range(len(candidates)):
        diff, _ = candidates[idx]
        if _passes_shape_check(diff):
            label = ENSEMBLE_CALLS[idx]["label"]
            temp = ENSEMBLE_CALLS[idx]["temperature"]
            return idx, f"{label} variant (temp={temp}) passed shape check"

    # All failed shape check — fall back to deterministic
    logger.warning(
        "[EnsembleBidder][_pick_best] No candidates passed shape check — falling back to deterministic output"
    )
    return 0, "all candidates failed shape check — using deterministic (temp=0.0) as fallback"


async def run_ensemble(
    bounty: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    """[EnsembleBidder][run_ensemble] Runs ensemble for one bounty.

    Returns:
        (chosen_diff, ensemble_metadata_dict)
    """
    title = bounty.get("title", "")
    logger.info(
        "[EnsembleBidder][run_ensemble] Running 3-temperature ensemble for bounty '%s'", title
    )

    # Create one LLMClient per temperature variant.
    llms = [
        LLMClient(call["model"], temperature=call["temperature"])
        for call in ENSEMBLE_CALLS
    ]

    # Run all 3 in parallel.
    logger.info(
        "[EnsembleBidder][run_ensemble] Calling sonnet@0.0 + sonnet@0.5 + sonnet@1.0 in parallel..."
    )
    results = await asyncio.gather(
        *[_generate_candidate(llm, bounty) for llm in llms],
        return_exceptions=False,
    )
    candidates: list[tuple[str, float]] = list(results)

    # Shape-check results and log each variant.
    shape_results = [_passes_shape_check(diff) for diff, _ in candidates]
    for i, (call, (diff, runtime_ms), passed) in enumerate(
        zip(ENSEMBLE_CALLS, candidates, shape_results)
    ):
        logger.info(
            "[EnsembleBidder][run_ensemble] %s (temp=%.1f) → shape_check=%s runtime=%.0fms diff_len=%d",
            call["label"],
            call["temperature"],
            passed,
            runtime_ms,
            len(diff),
        )

    # Pick best.
    chosen_idx, selection_reason = _pick_best(candidates)
    chosen_diff, _ = candidates[chosen_idx]
    chosen_call = ENSEMBLE_CALLS[chosen_idx]

    logger.info(
        "[EnsembleBidder][run_ensemble] Winner: %s (temp=%.1f) — reason: %s",
        chosen_call["label"],
        chosen_call["temperature"],
        selection_reason,
    )

    # Build EnsembleMetadata dict. model field encodes temperature so UI can display it.
    ensemble_metadata: dict[str, Any] = {
        "candidates": [
            {
                "model": f"{ENSEMBLE_CALLS[i]['model']}@temp={ENSEMBLE_CALLS[i]['temperature']}",
                "passed_internal_tests": shape_results[i],
                "runtime_ms": round(candidates[i][1]),
                "chosen": i == chosen_idx,
            }
            for i in range(len(ENSEMBLE_CALLS))
        ],
        "selection_reason": selection_reason,
    }

    return chosen_diff, ensemble_metadata


async def main() -> None:
    logger.info(
        "Starting EnsembleBidder (strategy: winner-takes-all full bounty, all codebase+bug_bounty tasks, 3-model ensemble)"
    )

    lightning = LightningClient(AGENT_NAME)
    api = MarketplaceClient()

    logger.info("Pubkey: %s", lightning.pubkey)
    logger.info("Balance: %d sat (stub)", lightning.get_balance())
    logger.info(
        "Ensemble calls: %s",
        ", ".join(f"{c['model']}@temp={c['temperature']}" for c in ENSEMBLE_CALLS),
    )

    already_bid: set[str] = set()

    while True:
        try:
            bounties = await api.list_bounties(status="OPEN")
            logger.info("Polled %d open bounties", len(bounties))

            for bounty in bounties:
                bounty_id = bounty.get("id", "")
                if not bounty_id or bounty_id in already_bid:
                    continue

                task_type = bounty.get("task_type", "snippet")
                if task_type not in ELIGIBLE_TASK_TYPES:
                    logger.info(
                        "Skipping bounty %s (task_type=%s — ensemble only handles codebase/bug_bounty)",
                        bounty_id,
                        task_type,
                    )
                    continue

                try:
                    full = await api.get_bounty(bounty_id)
                    if not full:
                        logger.warning("Could not fetch full bounty %s", bounty_id)
                        continue

                    logger.info(
                        "Bidding on '%s' (id=%s, task_type=%s) with 3-model ensemble",
                        full.get("title", ""),
                        bounty_id,
                        full.get("task_type", ""),
                    )

                    chosen_diff, ensemble_metadata = await run_ensemble(full)
                    # V3 winner-takes-all: always bid the full bounty amount
                    price = full.get("max_bounty_sats", 0)

                    logger.info(
                        "Submitting ensemble bid on '%s' for %d sat full bounty",
                        full.get("title", ""),
                        price,
                    )

                    bid = await api.submit_bid(
                        bounty_id=bounty_id,
                        code=chosen_diff,
                        asked_price=price,
                        bidder_pubkey=lightning.pubkey,
                        bid_type="diff",
                        ensemble_metadata=ensemble_metadata,
                    )

                    if not bid:
                        logger.error("Bid submission failed for bounty %s", bounty_id)
                        continue

                    already_bid.add(bounty_id)
                    logger.info(
                        "Ensemble bid submitted: %s (status: %s)",
                        bid.get("bid_id"),
                        bid.get("status"),
                    )

                    stake_invoice = bid.get("stake_invoice", "")
                    lightning.pay_invoice(stake_invoice)

                except Exception as e:
                    logger.error(
                        "Error processing bounty %s: %s", bounty_id, e, exc_info=True
                    )

        except Exception as e:
            logger.error("Error in polling loop: %s", e)

        await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
