"""Input value objects describing a water-network state to allocate over.

These are plain frozen dataclasses deliberately decoupled from the SQLAlchemy
models, so the allocation engine can be exercised without a database. An
adapter is responsible for projecting persisted rows onto these types.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum

ZERO = Decimal("0")
ONE = Decimal("1")


class DemandKind(str, Enum):
    """Whether a demand point is a populated zone or a critical facility."""

    ZONE = "zone"
    FACILITY = "facility"


class OperationalState(str, Enum):
    """Availability of an asset, independent of the persistence enum."""

    ONLINE = "online"
    DERATED = "derated"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class SupplySource:
    """A reservoir able to release water into the network."""

    code: str
    name: str
    available_m3_per_day: Decimal
    state: OperationalState = OperationalState.ONLINE

    def usable_supply(self, derate_factor: Decimal) -> Decimal:
        """Supply actually releasable under the current operational state."""
        return _apply_state(self.available_m3_per_day, self.state, derate_factor)


@dataclass(frozen=True)
class TransitNode:
    """A treatment plant: throughput-capped, with a volumetric recovery ratio."""

    code: str
    name: str
    capacity_m3_per_day: Decimal
    recovery_ratio: Decimal = ONE
    state: OperationalState = OperationalState.ONLINE

    def usable_capacity(self, derate_factor: Decimal) -> Decimal:
        return _apply_state(self.capacity_m3_per_day, self.state, derate_factor)


@dataclass(frozen=True)
class DemandPoint:
    """A zone or facility competing for water."""

    code: str
    name: str
    kind: DemandKind
    demand_m3_per_day: Decimal
    minimum_demand_m3_per_day: Decimal = ZERO
    priority_rank: int = 2
    population: int = 0
    reserve_m3: Decimal = ZERO

    def __post_init__(self) -> None:
        if self.demand_m3_per_day < ZERO:
            raise ValueError(f"{self.code}: demand must be non-negative")
        if self.minimum_demand_m3_per_day < ZERO:
            raise ValueError(f"{self.code}: minimum demand must be non-negative")
        if self.minimum_demand_m3_per_day > self.demand_m3_per_day:
            raise ValueError(
                f"{self.code}: minimum demand exceeds demand "
                f"({self.minimum_demand_m3_per_day} > {self.demand_m3_per_day})"
            )
        if self.population < 0:
            raise ValueError(f"{self.code}: population must be non-negative")


@dataclass(frozen=True)
class TankerUnit:
    """A mobile carrier used where pipelines cannot deliver.

    Tankers are part of the network snapshot so that logistics disruptions can
    be modelled, but the pipeline allocation engine does not route over them.
    """

    code: str
    name: str
    capacity_m3: Decimal
    trips_per_day: int = 1
    state: OperationalState = OperationalState.ONLINE

    def __post_init__(self) -> None:
        if self.capacity_m3 <= ZERO:
            raise ValueError(f"{self.code}: capacity must be positive")
        if self.trips_per_day < 1:
            raise ValueError(f"{self.code}: trips_per_day must be at least 1")

    def usable_capacity(self, derate_factor: Decimal) -> Decimal:
        """Daily haulage capacity under the current operational state."""
        rated = self.capacity_m3 * Decimal(self.trips_per_day)
        return _apply_state(rated, self.state, derate_factor)


@dataclass(frozen=True)
class Link:
    """A directed, capacitated pipeline between two network nodes."""

    code: str
    source_code: str
    target_code: str
    capacity_m3_per_day: Decimal
    loss_ratio: Decimal = ZERO
    state: OperationalState = OperationalState.ONLINE

    def __post_init__(self) -> None:
        if self.source_code == self.target_code:
            raise ValueError(f"{self.code}: link cannot be a self-loop")
        if not (ZERO <= self.loss_ratio < ONE):
            raise ValueError(f"{self.code}: loss ratio must be in [0, 1)")

    @property
    def throughput_ratio(self) -> Decimal:
        """Fraction of injected water that survives transit."""
        return ONE - self.loss_ratio

    def usable_capacity(self, derate_factor: Decimal) -> Decimal:
        return _apply_state(self.capacity_m3_per_day, self.state, derate_factor)


@dataclass(frozen=True)
class NetworkState:
    """A complete, self-contained snapshot to allocate over."""

    sources: tuple[SupplySource, ...] = field(default_factory=tuple)
    transits: tuple[TransitNode, ...] = field(default_factory=tuple)
    demands: tuple[DemandPoint, ...] = field(default_factory=tuple)
    links: tuple[Link, ...] = field(default_factory=tuple)
    tankers: tuple[TankerUnit, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        codes: set[str] = set()
        for node in (*self.sources, *self.transits, *self.demands):
            if node.code in codes:
                raise ValueError(f"duplicate node code: {node.code}")
            codes.add(node.code)

        link_codes: set[str] = set()
        for link in self.links:
            if link.code in link_codes:
                raise ValueError(f"duplicate link code: {link.code}")
            link_codes.add(link.code)
            for endpoint in (link.source_code, link.target_code):
                if endpoint not in codes:
                    raise ValueError(
                        f"{link.code}: references unknown node {endpoint!r}"
                    )

        tanker_codes: set[str] = set()
        for tanker in self.tankers:
            if tanker.code in tanker_codes:
                raise ValueError(f"duplicate tanker code: {tanker.code}")
            tanker_codes.add(tanker.code)

    @property
    def total_demand_m3_per_day(self) -> Decimal:
        return sum((d.demand_m3_per_day for d in self.demands), ZERO)


def _apply_state(
    value: Decimal, state: OperationalState, derate_factor: Decimal
) -> Decimal:
    if state is OperationalState.UNAVAILABLE:
        return ZERO
    if state is OperationalState.DERATED:
        return value * derate_factor
    return value
