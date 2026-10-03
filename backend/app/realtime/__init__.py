"""Real-time transport layer: WebSocket connection tracking and dispatch.

This layer owns protocol concerns only. All computation is delegated to the
application services, which in turn call the pure domain engines.
"""

from app.realtime.manager import ConnectionManager, get_connection_manager

__all__ = ["ConnectionManager", "get_connection_manager"]
