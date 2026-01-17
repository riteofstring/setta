from dataclasses import dataclass

from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.generated.dependency_values import BaseDependencyValueUnion


@dataclass(frozen=True, slots=True)
class LocalDependencyUpdate:
    dependency_key: BaseDependencyKeyUnion
    value: BaseDependencyValueUnion


def build_local_router_endpoint_updates(
    *,
    _endpoint_name: str,
    _payload: dict[str, object],
) -> list[LocalDependencyUpdate]:
    return []
