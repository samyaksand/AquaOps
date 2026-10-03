"""WebSocket endpoint."""

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.api.deps import NetworkProvider, get_network_provider
from app.core.logging import get_logger
from app.realtime.handlers import handle_frame
from app.realtime.manager import ConnectionManager, get_connection_manager
from app.schemas.realtime import ConnectedEvent

logger = get_logger(__name__)

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def realtime(
    websocket: WebSocket,
    provider: NetworkProvider = Depends(get_network_provider),
    manager: ConnectionManager = Depends(get_connection_manager),
) -> None:
    """Accept a client and serve typed commands until it disconnects."""
    client_id = await manager.connect(websocket)
    try:
        await manager.send(
            client_id,
            ConnectedEvent(
                client_id=client_id, client_count=manager.client_count
            ),
        )
        while True:
            raw = await websocket.receive_text()
            await handle_frame(raw, client_id, provider, manager)
    except WebSocketDisconnect:
        pass
    except Exception:
        # An unexpected fault must not leave a registered dead connection.
        logger.exception("websocket %s failed", client_id)
    finally:
        await manager.disconnect(client_id)
