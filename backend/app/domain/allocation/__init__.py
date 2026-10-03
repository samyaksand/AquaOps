"""Water allocation domain: network state in, computed allocation out."""

from app.domain.allocation.engine import (
    AllocationEngine,
    EngineConfig,
    allocate,
    compare_strategies,
)
from app.domain.allocation.results import (
    AllocationResult,
    DemandAllocation,
    RouteFlow,
)
from app.domain.allocation.state import (
    DemandKind,
    DemandPoint,
    Link,
    NetworkState,
    OperationalState,
    SupplySource,
    TransitNode,
)
from app.domain.allocation.strategies import (
    AllocationStrategy,
    Balanced,
    CriticalInfrastructureFirst,
    DemandContext,
    EfficiencyFirst,
    PopulationFirst,
    StrategyName,
    default_strategies,
    get_strategy,
)

__all__ = [
    "AllocationEngine",
    "AllocationResult",
    "AllocationStrategy",
    "Balanced",
    "CriticalInfrastructureFirst",
    "DemandAllocation",
    "DemandContext",
    "DemandKind",
    "DemandPoint",
    "EfficiencyFirst",
    "EngineConfig",
    "Link",
    "NetworkState",
    "OperationalState",
    "PopulationFirst",
    "RouteFlow",
    "StrategyName",
    "SupplySource",
    "TransitNode",
    "allocate",
    "compare_strategies",
    "default_strategies",
    "get_strategy",
]
