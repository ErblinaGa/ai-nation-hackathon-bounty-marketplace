"""Debug what the agent actually sees when generating a codebase diff."""
import asyncio, sys, os
sys.path.insert(0, '.')
os.environ.setdefault('API_BASE', 'http://localhost:3000/api')

from dotenv import load_dotenv
load_dotenv()

from agents.shared.marketplace_client import MarketplaceClient
from agents.shared.llm_client import _build_context_files_block, CODEBASE_PROMPT
import json

async def main():
    bounty_id = sys.argv[1]
    api = MarketplaceClient()
    full = await api.get_bounty(bounty_id)
    print(f"--- bounty {bounty_id} ---")
    print(f"title: {full.get('title')}")
    print(f"task_type: {full.get('task_type')}")
    payload = full.get('task_payload')
    print(f"task_payload type: {type(payload).__name__}")
    if isinstance(payload, str):
        payload = json.loads(payload)
    cf = payload.get('context_files', [])
    print(f"context_files: {len(cf)}")
    for f in cf[:5]:
        print(f"  - {f['path']} ({len(f['content'])} chars)")
    print()
    block = _build_context_files_block(cf)
    print(f"context_files_block length: {len(block)}")
    print("--- first 800 chars of block ---")
    print(block[:800])

asyncio.run(main())
