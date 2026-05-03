from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from setta import __version__
from setta.sdk_contracts.constants import SETTA_SDK_CONTRACT_VERSION

_SDK_RUNTIME_HANDSHAKE_PATH = "/api/sdkRuntimeHandshake"


class _RequestsSessionLike(Protocol):
    def get(self, url: str, **kwargs: Any) -> Any: ...


@dataclass(slots=True)
class RunningBackendVersionHandshake:
    sdkVersion: str
    coreVersion: str
    sdkContractVersion: int

    @classmethod
    def from_payload(
        cls,
        payload: Mapping[str, Any],
    ) -> "RunningBackendVersionHandshake":
        return cls(
            sdkVersion=str(payload["sdkVersion"]),
            coreVersion=str(payload["coreVersion"]),
            sdkContractVersion=int(payload["sdkContractVersion"]),
        )


class RuntimeCompatibilityError(RuntimeError):
    pass


def verify_running_backend_compatibility(
    session: _RequestsSessionLike,
    *,
    base_url: str,
    auth_headers: dict[str, str] | None = None,
) -> RunningBackendVersionHandshake:
    response = session.get(
        f"{base_url}{_SDK_RUNTIME_HANDSHAKE_PATH}",
        headers=auth_headers,
    )
    response.raise_for_status()
    handshake = RunningBackendVersionHandshake.from_payload(response.json())
    expected_sdk_version = __version__.strip()
    if handshake.sdkVersion != expected_sdk_version:
        raise RuntimeCompatibilityError(
            "Setta SDK/backend version mismatch: "
            f"python={expected_sdk_version} backend={handshake.sdkVersion} "
            f"(core={handshake.coreVersion})"
        )
    if handshake.sdkContractVersion != SETTA_SDK_CONTRACT_VERSION:
        raise RuntimeCompatibilityError(
            "Setta SDK contract mismatch: "
            f"python={SETTA_SDK_CONTRACT_VERSION} "
            f"backend={handshake.sdkContractVersion} "
            f"(backend sdk={handshake.sdkVersion} core={handshake.coreVersion})"
        )
    return handshake
