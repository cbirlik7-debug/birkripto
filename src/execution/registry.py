"""Execution broker kayıt defteri (registry)."""
from typing import Dict, Type

from .base import BaseBroker


BROKER_REGISTRY: Dict[str, Type[BaseBroker]] = {}


def register_broker(name: str):
    def deco(cls):
        BROKER_REGISTRY[name] = cls
        return cls
    return deco


def get_broker(name: str) -> Type[BaseBroker]:
    if name not in BROKER_REGISTRY:
        raise KeyError(f"Broker kayıtlı değil: {name} (paper|live)")
    return BROKER_REGISTRY[name]


def available_brokers() -> list:
    return sorted(BROKER_REGISTRY.keys())