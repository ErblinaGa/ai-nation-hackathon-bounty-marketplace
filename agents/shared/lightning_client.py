"""
[lightning_client] STUB Lightning client — no real wallet needed.
Generates a deterministic fake pubkey from the agent name.
All payment operations are no-ops that log clearly.
"""
import hashlib
import logging

logger = logging.getLogger(__name__)


class LightningClient:
    def __init__(self, name: str):
        if not name:
            raise ValueError("[LightningClient] name is required")
        self.name = name
        # Deterministic pubkey: "02" prefix (compressed pubkey marker) + first 64 chars of sha256(name)
        # Total 66 hex chars = 33 bytes, matching compressed Lightning pubkey format.
        digest = hashlib.sha256(name.encode()).hexdigest()[:64]
        self.pubkey = f"02{digest}"
        logger.info(
            "[LightningClient][init] Stub client for '%s' — pubkey: %s",
            name,
            self.pubkey,
        )

    def pay_invoice(self, bolt11: str) -> None:
        """[LightningClient][pay_invoice] STUB — no-op. Backend auto-accepts after 2s."""
        if not bolt11:
            logger.warning("[LightningClient][pay_invoice] Empty bolt11 invoice, skipping")
            return
        logger.info(
            "[LightningClient][pay_invoice] STUB pay for '%s': %s...",
            self.name,
            bolt11[:40],
        )
        # Backend's stub auto-pays the invoice — nothing needed here.

    def get_balance(self) -> int:
        """[LightningClient][get_balance] STUB — always returns 5000 sat."""
        return 5000
