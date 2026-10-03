"""Pure domain logic for AquaOps.

Modules under this package must not import FastAPI, SQLAlchemy, Kafka, Redis,
or any other infrastructure concern. They operate on plain value objects so the
domain stays independently testable.
"""
