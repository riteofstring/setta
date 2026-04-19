import requests

from setta import __version__
from setta.runtime_compat import RuntimeCompatibilityError
from setta.sdk_contract_version import SETTA_SDK_CONTRACT_VERSION
from setta.sdk_contracts.generated import (
    RunningBackendVersionHandshake,
)
from setta.types.generated.go_shared_types import Route


def verify_running_backend_compatibility(
    session: requests.Session,
    *,
    base_url: str,
    auth_headers: dict[str, str] | None = None,
) -> RunningBackendVersionHandshake:
    response = session.get(
        f"{base_url}{Route.API_PREFIX.value}{Route.SDK_RUNTIME_HANDSHAKE.value}",
        headers=auth_headers,
    )
    response.raise_for_status()
    handshake = RunningBackendVersionHandshake(**response.json())
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
