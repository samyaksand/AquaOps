"""Domain enumerations shared across AquaOps models."""

import enum


class AssetStatus(str, enum.Enum):
    """Operational status of a physical water-network asset."""

    OPERATIONAL = "operational"
    DEGRADED = "degraded"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


class WaterQuality(str, enum.Enum):
    """Treatment level of water at a given point in the network."""

    RAW = "raw"
    TREATED = "treated"
    POTABLE = "potable"


class ZoneType(str, enum.Enum):
    """Primary land use of a demand zone."""

    RESIDENTIAL = "residential"
    COMMERCIAL = "commercial"
    INDUSTRIAL = "industrial"
    MIXED = "mixed"
    AGRICULTURAL = "agricultural"


class FacilityType(str, enum.Enum):
    """Category of a critical facility served by the network."""

    HOSPITAL = "hospital"
    FIRE_STATION = "fire_station"
    SCHOOL = "school"
    SHELTER = "shelter"
    WATER_TREATMENT = "water_treatment"
    POWER_PLANT = "power_plant"
    GOVERNMENT = "government"


class PriorityLevel(str, enum.Enum):
    """Allocation priority tier, ordered from most to least critical."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class NodeType(str, enum.Enum):
    """Kind of network node a pipeline endpoint refers to."""

    RESERVOIR = "reservoir"
    TREATMENT_PLANT = "treatment_plant"
    DEMAND_ZONE = "demand_zone"
    CRITICAL_FACILITY = "critical_facility"


class TankerStatus(str, enum.Enum):
    """Dispatch state of a water tanker."""

    IDLE = "idle"
    LOADING = "loading"
    EN_ROUTE = "en_route"
    UNLOADING = "unloading"
    MAINTENANCE = "maintenance"
