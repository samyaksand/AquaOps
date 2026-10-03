"""WebSocket tests: lifecycle, commands, broadcasting, validation, errors.

The network provider is overridden with the in-memory fixture network so these
exercise protocol behaviour without a database.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_network_provider
from app.domain.allocation import StrategyName, allocate
from app.main import app
from app.realtime.manager import ConnectionManager, get_connection_manager

WS = "/api/v1/ws"
ALL_STRATEGIES = [s.value for s in StrategyName]


@pytest.fixture
def client(scarce_network):
    """A TestClient whose WebSocket network is the fixture network.

    A fresh ConnectionManager per test keeps client ids and counts
    independent between tests.
    """

    async def provider():
        return scarce_network

    manager = ConnectionManager()
    app.dependency_overrides[get_network_provider] = lambda: provider
    app.dependency_overrides[get_connection_manager] = lambda: manager
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _connect(ws):
    """Consume the handshake frame and return it."""
    return ws.receive_json()


# -- lifecycle ----------------------------------------------------------------


def test_connect_receives_a_handshake(client):
    with client.websocket_connect(WS) as ws:
        frame = _connect(ws)
        assert frame["type"] == "connected"
        assert frame["client_id"] == "client-1"
        assert frame["client_count"] == 1


def test_multiple_clients_get_distinct_ids(client):
    with client.websocket_connect(WS) as first:
        a = _connect(first)
        with client.websocket_connect(WS) as second:
            b = _connect(second)
            assert a["client_id"] != b["client_id"]
            assert b["client_count"] == 2


def test_disconnect_deregisters_the_client(client):
    manager = app.dependency_overrides[get_connection_manager]()
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        assert manager.client_count == 1
    assert manager.client_count == 0


def test_clients_can_reconnect(client):
    manager = app.dependency_overrides[get_connection_manager]()
    for _ in range(3):
        with client.websocket_connect(WS) as ws:
            _connect(ws)
            assert manager.client_count == 1
    assert manager.client_count == 0


def test_ping_is_answered(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


# -- commands -----------------------------------------------------------------


def test_get_network_returns_the_current_state(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "get_network"})
        frame = ws.receive_json()

    assert frame["type"] == "network"
    network = frame["network"]
    assert [s["code"] for s in network["sources"]] == ["R1"]
    assert [d["code"] for d in network["demands"]] == [
        "Z-BIG",
        "Z-SMALL",
        "F-HOSP",
    ]
    assert [t["code"] for t in network["tankers"]] == ["T-1", "T-2"]


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_allocate_supports_every_strategy(client, strategy):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "allocate", "strategy": strategy})
        frame = ws.receive_json()

    assert frame["type"] == "allocation"
    assert frame["allocation"]["strategy"] == strategy


def test_allocate_defaults_to_balanced(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "allocate"})
        assert ws.receive_json()["allocation"]["strategy"] == "balanced"


def test_allocate_matches_the_domain_engine(client, scarce_network):
    """The socket must report exactly what the engine computed."""
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "allocate", "strategy": "efficiency_first"})
        frame = ws.receive_json()

    expected = allocate(scarce_network, StrategyName.EFFICIENCY_FIRST)
    metrics = frame["allocation"]["metrics"]
    assert metrics["total_supplied_m3_per_day"] == pytest.approx(
        float(expected.total_supplied_m3_per_day)
    )
    assert metrics["population_served"] == expected.population_served


def test_apply_scenario_returns_the_resulting_network(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json(
            {
                "type": "apply_scenario",
                "scenario": {
                    "name": "drought",
                    "changes": [
                        {
                            "type": "reduce_reservoir_supply",
                            "target_code": "R1",
                            "fraction": 0.4,
                        }
                    ],
                },
            }
        )
        frame = ws.receive_json()

    assert frame["type"] == "scenario_applied"
    assert frame["scenario"]["name"] == "drought"
    assert frame["network"]["sources"][0]["available_m3_per_day"] == 600.0


def test_scenario_allocate_returns_scenario_network_and_allocation(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json(
            {
                "type": "scenario_allocate",
                "scenario": {
                    "name": "hospital-main-failure",
                    "changes": [
                        {
                            "type": "set_pipeline_unavailable",
                            "target_code": "L-P1-HOSP",
                        }
                    ],
                },
                "strategy": "critical_infrastructure_first",
            }
        )
        frame = ws.receive_json()

    assert frame["type"] == "scenario_allocation"
    links = {item["code"]: item for item in frame["network"]["links"]}
    assert links["L-P1-HOSP"]["state"] == "unavailable"
    assert frame["allocation"]["metrics"]["critical_facility_coverage"] == 0.0


def test_scenario_does_not_mutate_the_served_network(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json(
            {
                "type": "apply_scenario",
                "scenario": {
                    "name": "wipeout",
                    "changes": [
                        {
                            "type": "reduce_reservoir_supply",
                            "target_code": "R1",
                            "fraction": 1,
                        }
                    ],
                },
            }
        )
        ws.receive_json()
        ws.send_json({"type": "get_network"})
        frame = ws.receive_json()

    assert frame["network"]["sources"][0]["available_m3_per_day"] == 1000.0


# -- broadcasting -------------------------------------------------------------


def test_allocation_reaches_every_client(client):
    with client.websocket_connect(WS) as first:
        _connect(first)
        with client.websocket_connect(WS) as second:
            _connect(second)
            first.send_json({"type": "allocate", "strategy": "balanced"})

            for ws in (first, second):
                frame = ws.receive_json()
                assert frame["type"] == "allocation"
                assert frame["allocation"]["strategy"] == "balanced"


def test_scenario_allocation_reaches_every_client(client):
    with client.websocket_connect(WS) as first:
        _connect(first)
        with client.websocket_connect(WS) as second:
            _connect(second)
            second.send_json(
                {
                    "type": "scenario_allocate",
                    "scenario": {
                        "name": "drought",
                        "changes": [
                            {
                                "type": "reduce_reservoir_supply",
                                "target_code": "R1",
                                "fraction": 0.5,
                            }
                        ],
                    },
                    "strategy": "balanced",
                }
            )

            for ws in (first, second):
                assert ws.receive_json()["type"] == "scenario_allocation"


def test_scenario_applied_reaches_every_client(client):
    with client.websocket_connect(WS) as first:
        _connect(first)
        with client.websocket_connect(WS) as second:
            _connect(second)
            first.send_json(
                {
                    "type": "apply_scenario",
                    "scenario": {
                        "name": "break",
                        "changes": [
                            {
                                "type": "set_pipeline_unavailable",
                                "target_code": "L-P1-BIG",
                            }
                        ],
                    },
                }
            )

            for ws in (first, second):
                assert ws.receive_json()["type"] == "scenario_applied"


def test_private_replies_are_not_broadcast(client):
    """Pong and get_network answer only the sender."""
    with client.websocket_connect(WS) as first:
        _connect(first)
        with client.websocket_connect(WS) as second:
            _connect(second)

            first.send_json({"type": "ping"})
            assert first.receive_json()["type"] == "pong"

            # If pong had been broadcast, this would read it instead.
            second.send_json({"type": "get_network"})
            assert second.receive_json()["type"] == "network"


def test_errors_are_not_broadcast(client):
    with client.websocket_connect(WS) as first:
        _connect(first)
        with client.websocket_connect(WS) as second:
            _connect(second)

            first.send_json({"type": "nonsense"})
            assert first.receive_json()["type"] == "error"

            second.send_json({"type": "ping"})
            assert second.receive_json()["type"] == "pong"


# -- validation and errors ----------------------------------------------------


def test_malformed_json_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_text("{not json")
        frame = ws.receive_json()

    assert frame["type"] == "error"
    assert frame["code"] == "invalid_json"


def test_non_object_frame_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_text("[1, 2, 3]")
        frame = ws.receive_json()

    assert frame["type"] == "error"
    assert frame["code"] == "invalid_message"


def test_unknown_command_type_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "detonate"})
        frame = ws.receive_json()

    assert frame["type"] == "error"
    assert frame["code"] == "invalid_message"


def test_missing_type_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"strategy": "balanced"})
        assert ws.receive_json()["code"] == "invalid_message"


def test_unknown_strategy_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "allocate", "strategy": "whatever_first"})
        assert ws.receive_json()["code"] == "invalid_message"


def test_unknown_scenario_target_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json(
            {
                "type": "apply_scenario",
                "scenario": {
                    "name": "bad",
                    "changes": [
                        {
                            "type": "reduce_reservoir_supply",
                            "target_code": "GHOST",
                            "fraction": 0.5,
                        }
                    ],
                },
            }
        )
        frame = ws.receive_json()

    assert frame["type"] == "error"
    assert frame["code"] == "scenario_error"
    assert "GHOST" in frame["detail"]


def test_wrong_entity_kind_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json(
            {
                "type": "apply_scenario",
                "scenario": {
                    "name": "bad",
                    "changes": [
                        {
                            "type": "change_zone_demand",
                            "target_code": "F-HOSP",
                            "factor": 1.5,
                        }
                    ],
                },
            }
        )
        frame = ws.receive_json()

    assert frame["code"] == "scenario_error"
    assert "not a zone" in frame["detail"]


def test_out_of_range_fraction_is_rejected(client):
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json(
            {
                "type": "apply_scenario",
                "scenario": {
                    "name": "bad",
                    "changes": [
                        {
                            "type": "reduce_reservoir_supply",
                            "target_code": "R1",
                            "fraction": 1.5,
                        }
                    ],
                },
            }
        )
        assert ws.receive_json()["code"] == "invalid_message"


def test_connection_survives_a_rejected_command(client):
    """A bad frame must not tear down the connection."""
    with client.websocket_connect(WS) as ws:
        _connect(ws)
        ws.send_json({"type": "detonate"})
        assert ws.receive_json()["type"] == "error"

        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"

        ws.send_json({"type": "allocate", "strategy": "balanced"})
        assert ws.receive_json()["type"] == "allocation"


# -- connection manager unit tests -------------------------------------------


async def test_manager_drops_a_client_that_fails_to_send():
    """A send failure deregisters the client rather than raising."""
    from app.schemas.realtime import PongEvent

    class BrokenSocket:
        async def accept(self):
            return None

        async def send_json(self, payload):
            raise RuntimeError("peer gone")

    manager = ConnectionManager()
    client_id = await manager.connect(BrokenSocket())
    assert manager.client_count == 1

    assert await manager.send(client_id, PongEvent()) is False
    assert manager.client_count == 0


async def test_broadcast_skips_a_broken_client_and_reaches_the_rest():
    from app.schemas.realtime import PongEvent

    class Recorder:
        def __init__(self, fail: bool) -> None:
            self.fail = fail
            self.sent: list[dict] = []

        async def accept(self):
            return None

        async def send_json(self, payload):
            if self.fail:
                raise RuntimeError("peer gone")
            self.sent.append(payload)

    manager = ConnectionManager()
    broken = Recorder(fail=True)
    healthy = Recorder(fail=False)
    await manager.connect(broken)
    good_id = await manager.connect(healthy)

    delivered = await manager.broadcast(PongEvent())

    assert delivered == 1
    assert manager.client_count == 1
    assert manager.client_ids == (good_id,)
    assert healthy.sent == [{"type": "pong"}]


async def test_sending_to_an_unknown_client_is_a_no_op():
    from app.schemas.realtime import PongEvent

    manager = ConnectionManager()
    assert await manager.send("client-404", PongEvent()) is False


async def test_disconnect_is_idempotent():
    class Socket:
        async def accept(self):
            return None

    manager = ConnectionManager()
    client_id = await manager.connect(Socket())
    await manager.disconnect(client_id)
    await manager.disconnect(client_id)
    assert manager.client_count == 0
