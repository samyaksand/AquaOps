"""Pydantic request/response schemas for the AquaOps API.

Schemas are the API's boundary contract. They convert to and from the pure
domain value objects and are the only place where presentation concerns —
such as emitting volumes as JSON numbers rather than exact decimals — belong.
"""
