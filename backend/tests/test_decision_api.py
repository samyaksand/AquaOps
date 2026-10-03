"""Decision Analysis API: happy path, scenario analysis, and invalid input."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_network_state
from app.main import app

PREFIX = "/api/v1"


@pytest.fixture
async def client(scarce_network):
    app.dependency_overrides[get_network_state] = lambda: scarce_network
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def test_analyze_without_scenario_returns_candidates_and_frontier(client):
    response = await client.post(f"{PREFIX}/decision/analyze", json={})
    assert response.status_code == 200
    body = response.json()

    assert len(body["candidates"]) > 0
    assert len(body["frontier_candidate_ids"]) >= 1
    assert set(body["frontier_candidate_ids"]) <= {
        c["candidate_id"] for c in body["candidates"]
    }


async def test_each_candidate_carries_weights_objectives_and_allocation(client):
    response = await client.post(f"{PREFIX}/decision/analyze", json={})
    candidate = response.json()["candidates"][0]

    assert set(candidate) >= {
        "candidate_id",
        "criticality_weight",
        "population_weight",
        "efficiency_weight",
        "objectives",
        "is_pareto_optimal",
        "allocation",
    }
    assert set(candidate["objectives"]) == {
        "critical_coverage",
        "population_served",
        "unmet_demand_score",
        "logistics_efficiency",
        "equity",
    }
    assert candidate["allocation"]["strategy"] == "balanced"
    assert len(candidate["allocation"]["allocations"]) > 0


async def test_frontier_flag_matches_frontier_id_list(client):
    body = (await client.post(f"{PREFIX}/decision/analyze", json={})).json()
    frontier_ids = set(body["frontier_candidate_ids"])
    for candidate in body["candidates"]:
        assert candidate["is_pareto_optimal"] == (
            candidate["candidate_id"] in frontier_ids
        )


async def test_analyze_with_scenario_differs_from_baseline(client):
    baseline = (await client.post(f"{PREFIX}/decision/analyze", json={})).json()
    scenario_body = {
        "scenario": {
            "name": "drought",
            "changes": [
                {
                    "type": "reduce_reservoir_supply",
                    "target_code": "R1",
                    "fraction": 0.5,
                }
            ],
        }
    }
    scenario_result = (
        await client.post(f"{PREFIX}/decision/analyze", json=scenario_body)
    ).json()

    baseline_objectives = baseline["candidates"][0]["objectives"]
    scenario_objectives = scenario_result["candidates"][0]["objectives"]
    assert baseline_objectives != scenario_objectives


async def test_scenario_does_not_mutate_the_served_network(client):
    """Analyzing a scenario must never change what a plain analyze() call
    (or any other endpoint) sees afterward."""
    scenario_body = {
        "scenario": {
            "name": "wipeout",
            "changes": [
                {
                    "type": "reduce_reservoir_supply",
                    "target_code": "R1",
                    "fraction": 1,
                }
            ],
        }
    }
    await client.post(f"{PREFIX}/decision/analyze", json=scenario_body)

    after = (await client.post(f"{PREFIX}/decision/analyze", json={})).json()
    network = (await client.get(f"{PREFIX}/network")).json()
    assert network["sources"][0]["available_m3_per_day"] == 1000.0
    assert len(after["candidates"]) > 0


async def test_analyze_rejects_an_unknown_scenario_target(client):
    response = await client.post(
        f"{PREFIX}/decision/analyze",
        json={
            "scenario": {
                "name": "bad",
                "changes": [
                    {
                        "type": "reduce_reservoir_supply",
                        "target_code": "GHOST",
                        "fraction": 0.5,
                    }
                ],
            }
        },
    )
    assert response.status_code == 422
    assert "GHOST" in response.json()["detail"]


async def test_analyze_rejects_an_out_of_range_fraction(client):
    response = await client.post(
        f"{PREFIX}/decision/analyze",
        json={
            "scenario": {
                "name": "bad",
                "changes": [
                    {
                        "type": "reduce_reservoir_supply",
                        "target_code": "R1",
                        "fraction": 1.5,
                    }
                ],
            }
        },
    )
    assert response.status_code == 422


async def test_analyze_is_documented(client):
    paths = (await client.get("/openapi.json")).json()["paths"]
    assert f"{PREFIX}/decision/analyze" in paths
