"""API tests.

The network dependency is overridden with the in-memory fixture network, so
these exercise routing, schemas, and orchestration without a database. One
database-backed smoke test at the end covers the real adapter path.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import get_network_state
from app.domain.allocation import StrategyName, allocate
from app.main import app

D = Decimal
PREFIX = "/api/v1"
ALL_STRATEGIES = [s.value for s in StrategyName]


@pytest.fixture
async def client(scarce_network):
    """A client whose network state is the deterministic fixture network."""
    app.dependency_overrides[get_network_state] = lambda: scarce_network
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _codes(items: list[dict]) -> list[str]:
    return [item["code"] for item in items]


# -- health and discovery -----------------------------------------------------


async def test_health_still_works(client):
    response = await client.get(f"{PREFIX}/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_all_endpoints_are_documented(client):
    paths = (await client.get("/openapi.json")).json()["paths"]
    for path in (
        f"{PREFIX}/network",
        f"{PREFIX}/allocate",
        f"{PREFIX}/scenarios/apply",
        f"{PREFIX}/scenarios/allocate",
    ):
        assert path in paths


# -- GET /network -------------------------------------------------------------


async def test_get_network_returns_the_current_state(client):
    response = await client.get(f"{PREFIX}/network")
    assert response.status_code == 200
    body = response.json()

    assert _codes(body["sources"]) == ["R1"]
    assert _codes(body["transits"]) == ["P1"]
    assert _codes(body["demands"]) == ["Z-BIG", "Z-SMALL", "F-HOSP"]
    assert _codes(body["links"]) == [
        "L-R1-P1",
        "L-P1-BIG",
        "L-P1-SMALL",
        "L-P1-HOSP",
    ]
    assert _codes(body["tankers"]) == ["T-1", "T-2"]


async def test_network_entities_carry_their_domain_values(client):
    body = (await client.get(f"{PREFIX}/network")).json()

    assert body["sources"][0]["available_m3_per_day"] == 1000.0
    assert body["sources"][0]["state"] == "online"
    assert body["transits"][0]["capacity_m3_per_day"] == 10000.0

    big = next(d for d in body["demands"] if d["code"] == "Z-BIG")
    assert big["kind"] == "zone"
    assert big["demand_m3_per_day"] == 500.0
    assert big["population"] == 100_000

    hospital = next(d for d in body["demands"] if d["code"] == "F-HOSP")
    assert hospital["kind"] == "facility"
    assert hospital["priority_rank"] == 0

    lossy = next(item for item in body["links"] if item["code"] == "L-P1-BIG")
    assert lossy["loss_ratio"] == 0.1


# -- POST /allocate -----------------------------------------------------------


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
async def test_allocate_supports_every_strategy(client, strategy):
    response = await client.post(
        f"{PREFIX}/allocate", json={"strategy": strategy}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["strategy"] == strategy
    assert _codes(body["allocations"]) == ["Z-BIG", "Z-SMALL", "F-HOSP"]


async def test_allocate_defaults_to_balanced(client):
    response = await client.post(f"{PREFIX}/allocate", json={})
    assert response.status_code == 200
    assert response.json()["strategy"] == "balanced"


async def test_allocate_matches_the_domain_engine(client, scarce_network):
    """The API must report exactly what the engine computed."""
    body = (
        await client.post(
            f"{PREFIX}/allocate", json={"strategy": "efficiency_first"}
        )
    ).json()
    expected = allocate(scarce_network, StrategyName.EFFICIENCY_FIRST)

    assert body["metrics"]["total_supplied_m3_per_day"] == pytest.approx(
        float(expected.total_supplied_m3_per_day)
    )
    assert body["metrics"]["population_served"] == expected.population_served
    for item in body["allocations"]:
        assert item["supplied_m3_per_day"] == pytest.approx(
            float(expected.by_code(item["code"]).supplied_m3_per_day)
        )


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
async def test_allocate_reports_a_full_metric_set(client, strategy):
    metrics = (
        await client.post(f"{PREFIX}/allocate", json={"strategy": strategy})
    ).json()["metrics"]
    for key in (
        "total_supplied_m3_per_day",
        "total_unmet_m3_per_day",
        "population_served",
        "critical_facility_coverage",
        "delivery_efficiency",
        "demand_coverage_ratio",
    ):
        assert key in metrics
    assert 0 <= metrics["demand_coverage_ratio"] <= 1
    assert 0 <= metrics["critical_facility_coverage"] <= 1
    assert 0 < metrics["delivery_efficiency"] <= 1


async def test_allocate_includes_route_detail(client):
    body = (await client.post(f"{PREFIX}/allocate", json={})).json()
    served = next(
        item for item in body["allocations"] if item["supplied_m3_per_day"] > 0
    )
    assert served["routes"]
    route = served["routes"][0]
    assert route["source_code"] == "R1"
    assert route["node_codes"][0] == "R1"
    assert route["delivered_m3_per_day"] > 0


async def test_allocate_rejects_an_unknown_strategy(client):
    response = await client.post(
        f"{PREFIX}/allocate", json={"strategy": "whatever_first"}
    )
    assert response.status_code == 422


async def test_strategies_differ_through_the_api(client):
    profiles = set()
    for strategy in ALL_STRATEGIES:
        body = (
            await client.post(
                f"{PREFIX}/allocate", json={"strategy": strategy}
            )
        ).json()
        profiles.add(
            tuple(
                (item["code"], item["supplied_m3_per_day"])
                for item in body["allocations"]
            )
        )
    assert len(profiles) > 1


# -- POST /scenarios/apply ----------------------------------------------------


async def test_apply_scenario_returns_the_resulting_network(client):
    response = await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "drought",
            "changes": [
                {
                    "type": "reduce_reservoir_supply",
                    "target_code": "R1",
                    "fraction": 0.4,
                }
            ],
        },
    )
    assert response.status_code == 200
    assert response.json()["sources"][0]["available_m3_per_day"] == 600.0


async def test_apply_scenario_leaves_the_stored_network_untouched(client):
    await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "drought",
            "changes": [
                {
                    "type": "reduce_reservoir_supply",
                    "target_code": "R1",
                    "fraction": 0.9,
                }
            ],
        },
    )
    after = (await client.get(f"{PREFIX}/network")).json()
    assert after["sources"][0]["available_m3_per_day"] == 1000.0


async def test_apply_scenario_supports_every_change_type(client):
    response = await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "everything",
            "description": "One of each change type",
            "changes": [
                {
                    "type": "reduce_reservoir_supply",
                    "target_code": "R1",
                    "fraction": 0.5,
                },
                {
                    "type": "reduce_treatment_capacity",
                    "target_code": "P1",
                    "fraction": 0.5,
                },
                {
                    "type": "reduce_pipeline_capacity",
                    "target_code": "L-P1-BIG",
                    "fraction": 0.5,
                },
                {
                    "type": "set_pipeline_unavailable",
                    "target_code": "L-P1-SMALL",
                },
                {
                    "type": "change_zone_demand",
                    "target_code": "Z-BIG",
                    "factor": 1.5,
                },
                {
                    "type": "change_facility_demand",
                    "target_code": "F-HOSP",
                    "factor": 0.5,
                },
                {"type": "set_tanker_unavailable", "target_code": "T-1"},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["sources"][0]["available_m3_per_day"] == 500.0
    assert body["transits"][0]["capacity_m3_per_day"] == 5000.0
    links = {item["code"]: item for item in body["links"]}
    assert links["L-P1-BIG"]["capacity_m3_per_day"] == 1000.0
    assert links["L-P1-SMALL"]["state"] == "unavailable"
    demands = {item["code"]: item for item in body["demands"]}
    assert demands["Z-BIG"]["demand_m3_per_day"] == 750.0
    assert demands["F-HOSP"]["demand_m3_per_day"] == 150.0
    tankers = {item["code"]: item for item in body["tankers"]}
    assert tankers["T-1"]["state"] == "unavailable"
    assert tankers["T-2"]["state"] == "online"


async def test_apply_scenario_with_no_changes_is_a_faithful_copy(client):
    baseline = (await client.get(f"{PREFIX}/network")).json()
    response = await client.post(
        f"{PREFIX}/scenarios/apply", json={"name": "noop", "changes": []}
    )
    assert response.status_code == 200
    assert response.json() == baseline


async def test_apply_scenario_rejects_an_unknown_target(client):
    response = await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "bad",
            "changes": [
                {
                    "type": "reduce_reservoir_supply",
                    "target_code": "GHOST",
                    "fraction": 0.5,
                }
            ],
        },
    )
    assert response.status_code == 422
    assert "GHOST" in response.json()["detail"]


async def test_apply_scenario_rejects_a_wrong_entity_kind(client):
    response = await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "bad",
            "changes": [
                {
                    "type": "change_zone_demand",
                    "target_code": "F-HOSP",
                    "factor": 1.5,
                }
            ],
        },
    )
    assert response.status_code == 422
    assert "not a zone" in response.json()["detail"]


async def test_apply_scenario_rejects_an_unknown_change_type(client):
    response = await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "bad",
            "changes": [{"type": "detonate", "target_code": "R1"}],
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("fraction", [-0.1, 1.5])
async def test_apply_scenario_rejects_an_out_of_range_fraction(
    client, fraction
):
    response = await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "bad",
            "changes": [
                {
                    "type": "reduce_reservoir_supply",
                    "target_code": "R1",
                    "fraction": fraction,
                }
            ],
        },
    )
    assert response.status_code == 422


async def test_apply_scenario_rejects_a_negative_demand_factor(client):
    response = await client.post(
        f"{PREFIX}/scenarios/apply",
        json={
            "name": "bad",
            "changes": [
                {
                    "type": "change_zone_demand",
                    "target_code": "Z-BIG",
                    "factor": -1,
                }
            ],
        },
    )
    assert response.status_code == 422


async def test_apply_scenario_requires_a_name(client):
    response = await client.post(
        f"{PREFIX}/scenarios/apply", json={"name": "", "changes": []}
    )
    assert response.status_code == 422


# -- POST /scenarios/allocate -------------------------------------------------


async def test_scenario_allocate_returns_scenario_network_and_allocation(
    client,
):
    response = await client.post(
        f"{PREFIX}/scenarios/allocate",
        json={
            "scenario": {
                "name": "hospital-main-failure",
                "description": "Hospital feed fails",
                "changes": [
                    {
                        "type": "set_pipeline_unavailable",
                        "target_code": "L-P1-HOSP",
                    }
                ],
            },
            "strategy": "critical_infrastructure_first",
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["scenario"]["name"] == "hospital-main-failure"
    assert body["scenario"]["description"] == "Hospital feed fails"
    assert len(body["scenario"]["changes"]) == 1

    links = {item["code"]: item for item in body["network"]["links"]}
    assert links["L-P1-HOSP"]["state"] == "unavailable"

    assert body["allocation"]["strategy"] == "critical_infrastructure_first"
    hospital = next(
        item
        for item in body["allocation"]["allocations"]
        if item["code"] == "F-HOSP"
    )
    assert hospital["supplied_m3_per_day"] == 0.0
    assert body["allocation"]["metrics"]["critical_facility_coverage"] == 0.0


async def test_scenario_allocate_changes_the_outcome(client):
    baseline = (
        await client.post(f"{PREFIX}/allocate", json={"strategy": "balanced"})
    ).json()
    disrupted = (
        await client.post(
            f"{PREFIX}/scenarios/allocate",
            json={
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
            },
        )
    ).json()["allocation"]

    assert (
        disrupted["metrics"]["total_supplied_m3_per_day"]
        < baseline["metrics"]["total_supplied_m3_per_day"]
    )
    assert (
        disrupted["metrics"]["total_unmet_m3_per_day"]
        > baseline["metrics"]["total_unmet_m3_per_day"]
    )


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
async def test_scenario_allocate_supports_every_strategy(client, strategy):
    response = await client.post(
        f"{PREFIX}/scenarios/allocate",
        json={
            "scenario": {
                "name": "surge",
                "changes": [
                    {
                        "type": "change_zone_demand",
                        "target_code": "Z-BIG",
                        "factor": 1.3,
                    }
                ],
            },
            "strategy": strategy,
        },
    )
    assert response.status_code == 200
    assert response.json()["allocation"]["strategy"] == strategy


async def test_scenario_allocate_rejects_an_invalid_scenario(client):
    response = await client.post(
        f"{PREFIX}/scenarios/allocate",
        json={
            "scenario": {
                "name": "bad",
                "changes": [
                    {
                        "type": "set_tanker_unavailable",
                        "target_code": "GHOST",
                    }
                ],
            },
            "strategy": "balanced",
        },
    )
    assert response.status_code == 422
    assert "GHOST" in response.json()["detail"]


async def test_scenario_allocate_requires_a_scenario(client):
    response = await client.post(
        f"{PREFIX}/scenarios/allocate", json={"strategy": "balanced"}
    )
    assert response.status_code == 422


async def test_scenario_allocate_leaves_the_stored_network_untouched(client):
    await client.post(
        f"{PREFIX}/scenarios/allocate",
        json={
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
            "strategy": "balanced",
        },
    )
    after = (await client.get(f"{PREFIX}/network")).json()
    assert after["sources"][0]["available_m3_per_day"] == 1000.0


# -- database-backed smoke test ----------------------------------------------


async def test_endpoints_work_against_the_seeded_database():
    """Exercises the real DB adapter, skipped when PostgreSQL is unavailable."""
    from app.db.session import engine

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as c:
            network = await c.get(f"{PREFIX}/network")
            if network.status_code != 200:
                pytest.skip("local PostgreSQL unavailable")

            body = network.json()
            assert len(body["sources"]) == 3
            assert len(body["demands"]) == 8
            assert len(body["links"]) == 11
            assert len(body["tankers"]) == 3

            allocation = await c.post(
                f"{PREFIX}/allocate",
                json={"strategy": "critical_infrastructure_first"},
            )
            assert allocation.status_code == 200
            assert allocation.json()["metrics"][
                "total_supplied_m3_per_day"
            ] > 0

            scenario = await c.post(
                f"{PREFIX}/scenarios/allocate",
                json={
                    "scenario": {
                        "name": "east-basin-drought",
                        "changes": [
                            {
                                "type": "reduce_reservoir_supply",
                                "target_code": "RES-EAST",
                                "fraction": 0.8,
                            }
                        ],
                    },
                    "strategy": "balanced",
                },
            )
            assert scenario.status_code == 200
            assert scenario.json()["allocation"]["metrics"][
                "total_supplied_m3_per_day"
            ] > 0
    except (SQLAlchemyError, OSError) as exc:
        pytest.skip(f"local PostgreSQL unavailable: {exc}")
    finally:
        await engine.dispose()
