"""Redis: current-state cache and pub/sub fanout.

PostgreSQL remains the persistent source of truth for the network itself.
Redis holds short-lived, derived state — the most recent allocation and
scenario outcomes — and the pub/sub channel realtime events travel over
between processes. Nothing here is ever the only copy of anything that
matters; losing Redis loses a cache and a fanout path, not data.
"""

from app.cache.redis_client import get_redis
from app.cache.state_cache import StateCache, get_state_cache

__all__ = ["StateCache", "get_redis", "get_state_cache"]
