import json

import requests
import pytest
from setta import __version__
from setta.runtime_compat import RuntimeCompatibilityError, verify_running_backend_compatibility
from setta.sdk_contracts.constants import (
    SETTA_SDK_CONTRACT_VERSION as LIGHTWEIGHT_SETTA_SDK_CONTRACT_VERSION,
)
from setta.sdk_contracts.generated import SETTA_SDK_CONTRACT_VERSION


def _response(payload: dict[str, object]) -> requests.Response:
    response = requests.Response()
    response.status_code = 200
    response.url = "http://127.0.0.1:8000/api/sdkRuntimeHandshake"
    response._content = json.dumps(payload).encode()
    return response


def test_verify_running_backend_compatibility_accepts_matching_versions(
    monkeypatch,
) -> None:
    session = requests.Session()
    observed_headers: list[dict[str, str] | None] = []

    def get(url: str, headers: dict[str, str] | None = None) -> requests.Response:
        assert url == "http://127.0.0.1:8000/api/sdkRuntimeHandshake"
        observed_headers.append(headers)
        return _response(
            {
                "sdkVersion": __version__,
                "coreVersion": "dev",
                "sdkContractVersion": SETTA_SDK_CONTRACT_VERSION,
            }
        )

    monkeypatch.setattr(session, "get", get)

    handshake = verify_running_backend_compatibility(
        session,
        base_url="http://127.0.0.1:8000",
        auth_headers={"Cookie": "setta-auth=value"},
    )

    assert handshake.sdkVersion == __version__
    assert observed_headers == [{"Cookie": "setta-auth=value"}]


def test_verify_running_backend_compatibility_rejects_sdk_version_mismatch(
    monkeypatch,
) -> None:
    session = requests.Session()

    def get(url: str, headers: dict[str, str] | None = None) -> requests.Response:
        del headers
        assert url == "http://127.0.0.1:8000/api/sdkRuntimeHandshake"
        return _response(
            {
                "sdkVersion": "9.9.9",
                "coreVersion": "dev",
                "sdkContractVersion": SETTA_SDK_CONTRACT_VERSION,
            }
        )

    monkeypatch.setattr(session, "get", get)

    with pytest.raises(RuntimeCompatibilityError, match="version mismatch"):
        verify_running_backend_compatibility(
            session,
            base_url="http://127.0.0.1:8000",
        )


def test_verify_running_backend_compatibility_rejects_contract_mismatch(
    monkeypatch,
) -> None:
    session = requests.Session()

    def get(url: str, headers: dict[str, str] | None = None) -> requests.Response:
        del headers
        assert url == "http://127.0.0.1:8000/api/sdkRuntimeHandshake"
        return _response(
            {
                "sdkVersion": __version__,
                "coreVersion": "dev",
                "sdkContractVersion": SETTA_SDK_CONTRACT_VERSION + 1,
            }
        )

    monkeypatch.setattr(session, "get", get)

    with pytest.raises(RuntimeCompatibilityError, match="contract mismatch"):
        verify_running_backend_compatibility(
            session,
            base_url="http://127.0.0.1:8000",
        )


def test_lightweight_sdk_contract_version_matches_generated_owner() -> None:
    assert LIGHTWEIGHT_SETTA_SDK_CONTRACT_VERSION == SETTA_SDK_CONTRACT_VERSION
