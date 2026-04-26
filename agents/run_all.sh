#!/usr/bin/env bash
set -euo pipefail

# Must be run from the lightning-bounties/ project root (or the agents/ dir is found relative to cwd).
# Usage: bash agents/run_all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Detect runtime: prefer uv, fall back to python3
if command -v uv &>/dev/null; then
    RUNNER="uv run python"
else
    RUNNER="python3"
fi

echo "Using runner: $RUNNER"
echo ""

# Load .env if present (agents also load it via python-dotenv, but this helps the shell)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
    set +a
    echo "Loaded .env"
fi

pids=()

cleanup() {
    echo ""
    echo "Stopping all agents..."
    for pid in "${pids[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait
    echo "All agents stopped."
}

trap cleanup SIGINT SIGTERM

echo "Starting FastBidder..."
$RUNNER -m agents.fast_bidder &
pids+=($!)

echo "Starting QualityBidder..."
$RUNNER -m agents.quality_bidder &
pids+=($!)

echo "Starting BalancedBidder..."
$RUNNER -m agents.balanced_bidder &
pids+=($!)

echo ""
echo "All 3 agents running. Press Ctrl+C to stop."
echo "  FastBidder    PID: ${pids[0]}"
echo "  QualityBidder PID: ${pids[1]}"
echo "  BalancedBidder PID: ${pids[2]}"
echo ""

# Wait for all background jobs
wait
