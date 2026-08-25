"""Sinyal kuralı kayıt defteri (registry)."""
from typing import Dict, Type

from .base import BaseSignalRule

SIGNAL_RULE_REGISTRY: Dict[str, Type[BaseSignalRule]] = {}


def register_signal_rule(cls):
    SIGNAL_RULE_REGISTRY[cls.name] = cls
    return cls


def get_signal_rule(name: str) -> Type[BaseSignalRule]:
    if name not in SIGNAL_RULE_REGISTRY:
        raise KeyError(f"Sinyal kuralı kayıtlı değil: {name}")
    return SIGNAL_RULE_REGISTRY[name]


def available_signal_rules() -> list:
    return sorted(SIGNAL_RULE_REGISTRY.keys())