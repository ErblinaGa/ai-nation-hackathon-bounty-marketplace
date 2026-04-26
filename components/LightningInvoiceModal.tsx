"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type PaymentState = "waiting" | "paid" | "error";

interface LightningInvoiceModalProps {
  invoice: string;
  paymentHash: string;
  amountSats: number;
  onPaid: () => void;
  onCancel: () => void;
  /** Optional: async function that returns true when payment is confirmed */
  checkPayment?: () => Promise<boolean>;
}

export default function LightningInvoiceModal({
  invoice,
  paymentHash,
  amountSats,
  onPaid,
  onCancel,
  checkPayment,
}: LightningInvoiceModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState>("waiting");
  const paidRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate QR code on mount
  useEffect(() => {
    QRCode.toDataURL(invoice.toUpperCase(), {
      width: 240,
      margin: 2,
      color: { dark: "#1A1A1A", light: "#FAFAF8" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [invoice]);

  // Poll for payment confirmation
  const pollPayment = useCallback(async () => {
    if (paidRef.current) return;
    try {
      const confirmed = checkPayment ? await checkPayment() : false;
      if (confirmed && !paidRef.current) {
        paidRef.current = true;
        setPaymentState("paid");
        if (intervalRef.current) clearInterval(intervalRef.current);
        // Show success briefly then call onPaid
        setTimeout(onPaid, 1400);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [checkPayment, onPaid]);

  useEffect(() => {
    // Stub mode: auto-pay after 2s if no checkPayment provided
    if (!checkPayment) {
      const stubTimer = setTimeout(() => {
        if (paidRef.current) return;
        paidRef.current = true;
        setPaymentState("paid");
        setTimeout(onPaid, 1400);
      }, 2000);
      return () => clearTimeout(stubTimer);
    }

    // Real polling every 1500ms
    intervalRef.current = setInterval(pollPayment, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkPayment, onPaid, pollPayment]);

  // Keyboard: Escape closes
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  function handleCopy() {
    navigator.clipboard.writeText(invoice).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const truncatedInvoice =
    invoice.length > 40 ? `${invoice.slice(0, 20)}…${invoice.slice(-20)}` : invoice;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Lightning payment invoice"
    >
      {/* Backdrop — solid, no blur */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(26, 26, 26, 0.85)" }}
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 bg-bg border border-border w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="text-xs font-mono text-muted tracking-widest uppercase mb-0.5">
              Lightning Invoice
            </div>
            <div className="font-display font-bold text-lg tracking-tight text-fg">
              Pay{" "}
              <span className="font-mono text-accent">
                {amountSats.toLocaleString()}
              </span>{" "}
              sats
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 text-muted hover:text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Close modal"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.22 3.22a.75.75 0 0 1 1.06 0L8 6.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L9.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L8 9.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L6.94 8 3.22 4.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        {/* QR Code section */}
        <div className="flex flex-col items-center px-6 py-8">
          {qrDataUrl ? (
            <div className="border border-border p-3 bg-bg mb-6">
              <img
                src={qrDataUrl}
                alt="Lightning invoice QR code"
                width={240}
                height={240}
                loading="eager"
              />
            </div>
          ) : (
            <div className="w-60 h-60 border border-border bg-fg/5 flex items-center justify-center mb-6">
              <span className="text-xs font-mono text-muted">Generating QR…</span>
            </div>
          )}

          {/* Status indicator */}
          <div className="flex items-center gap-2.5 mb-6">
            {paymentState === "waiting" && (
              <>
                <span
                  className="w-2 h-2 rounded-full bg-accent animate-pulse-amber"
                  aria-hidden="true"
                />
                <span className="text-sm font-mono text-muted">Awaiting payment…</span>
              </>
            )}
            {paymentState === "paid" && (
              <>
                <span className="w-2 h-2 rounded-full bg-success" aria-hidden="true" />
                <span className="text-sm font-mono text-success font-semibold">
                  Payment received
                </span>
              </>
            )}
            {paymentState === "error" && (
              <>
                <span className="w-2 h-2 rounded-full bg-danger" aria-hidden="true" />
                <span className="text-sm font-mono text-danger">Payment failed</span>
              </>
            )}
          </div>

          {/* Invoice string */}
          <div className="w-full border border-border bg-fg/[0.02] px-3 py-2.5 flex items-center justify-between gap-2">
            <span
              className="font-mono text-xs text-muted flex-1 truncate"
              title={invoice}
              aria-label="Lightning invoice string"
            >
              {truncatedInvoice}
            </span>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 text-xs font-mono text-muted hover:text-fg transition-colors px-2 py-1 border border-border hover:border-fg/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Copy invoice to clipboard"
            >
              {copied ? "COPIED" : "COPY"}
            </button>
          </div>

          {/* Payment hash */}
          <div className="mt-3 w-full">
            <div className="text-[10px] font-mono text-muted tracking-widest uppercase mb-1">
              Payment Hash
            </div>
            <div
              className="font-mono text-xs text-muted/60 truncate"
              title={paymentHash}
              aria-label={`Payment hash: ${paymentHash}`}
            >
              {paymentHash}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-4 border-t border-border pt-4 flex justify-end">
          <button
            onClick={onCancel}
            className="text-xs font-mono text-muted hover:text-fg transition-colors px-4 py-2 border border-border hover:border-fg/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="Cancel and close"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
