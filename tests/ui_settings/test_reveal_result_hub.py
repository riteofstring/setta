from typing import Literal

import pytest

from setta.types.id import ID
from setta.types.websocket import (
    UISettingRevealResultContent,
    UISettingRevealResultStatus,
)
from setta.ui_settings.reveal_result_hub import (
    RevealResultContractMismatchError,
    RevealResultTransportDisconnectedError,
    UISettingRevealResultHub,
)


def _build_reveal_result_content(
    *,
    request_id: str,
    status: Literal["revealed", "failed"],
    project_config_id: ID = ID("project-1"),
    setting_id: str = "core.watch_code.enabled",
) -> UISettingRevealResultContent:
    return UISettingRevealResultContent(
        projectConfigId=project_config_id,
        requestId=request_id,
        statuses=[
            UISettingRevealResultStatus(
                settingId=setting_id,
                status=status,
                errorCode=None,
                errorMessage=None,
            )
        ],
    )


@pytest.mark.asyncio
async def test_reveal_result_hub_requires_expected_websocket_id() -> None:
    hub = UISettingRevealResultHub()
    hub.register_request("request-1", expected_websocket_id="frontend-a")

    resolved = hub.resolve(
        _build_reveal_result_content(
            request_id="request-1",
            status="revealed",
        ),
        from_websocket_id="frontend-a",
    )
    assert resolved is True

    result = await hub.wait_for_result(request_id="request-1", timeout_seconds=0.2)
    assert result is not None
    assert result.statuses[0].status == "revealed"


@pytest.mark.asyncio
async def test_reveal_result_hub_fails_fast_on_websocket_mismatch() -> None:
    hub = UISettingRevealResultHub()
    hub.register_request("request-1b", expected_websocket_id="frontend-a")

    resolved_mismatch = hub.resolve(
        _build_reveal_result_content(
            request_id="request-1b",
            status="failed",
        ),
        from_websocket_id="frontend-b",
    )
    assert resolved_mismatch is True
    with pytest.raises(RevealResultContractMismatchError, match="websocket mismatch"):
        await hub.wait_for_result(request_id="request-1b", timeout_seconds=0.2)


@pytest.mark.asyncio
async def test_reveal_result_hub_accepts_any_websocket_without_target_binding() -> None:
    hub = UISettingRevealResultHub()
    hub.register_request("request-2")

    # Unbound requests still accept the first valid acknowledgement.
    resolved = hub.resolve(
        _build_reveal_result_content(
            request_id="request-2",
            status="revealed",
        ),
        from_websocket_id="frontend-any",
    )
    assert resolved is True

    result = await hub.wait_for_result(request_id="request-2", timeout_seconds=0.2)
    assert result is not None
    assert result.requestId == "request-2"


@pytest.mark.asyncio
async def test_reveal_result_hub_cancel_request_drops_waiter() -> None:
    hub = UISettingRevealResultHub()
    hub.register_request("request-3", expected_websocket_id="frontend-a")

    cancelled = hub.cancel_request("request-3")
    assert cancelled is True
    assert hub.cancel_request("request-3") is False

    resolved = hub.resolve(
        _build_reveal_result_content(
            request_id="request-3",
            status="revealed",
        ),
        from_websocket_id="frontend-a",
    )
    assert resolved is False

    with pytest.raises(KeyError):
        await hub.wait_for_result(request_id="request-3", timeout_seconds=0.2)


@pytest.mark.asyncio
async def test_reveal_result_hub_cancel_requests_for_websocket_id_fails_waiter_immediately() -> (
    None
):
    hub = UISettingRevealResultHub()
    hub.register_request(
        "request-3b",
        expected_websocket_id="frontend-a",
    )

    cancelled_count = hub.cancel_requests_for_websocket_id("frontend-a")
    assert cancelled_count == 1

    with pytest.raises(
        RevealResultTransportDisconnectedError,
        match="frontend-a",
    ):
        await hub.wait_for_result(request_id="request-3b", timeout_seconds=0.2)


@pytest.mark.asyncio
async def test_reveal_result_hub_requires_expected_project_config_id() -> None:
    hub = UISettingRevealResultHub()
    hub.register_request(
        "request-4",
        expected_project_config_id=ID("project-expected"),
    )

    resolved_mismatch = hub.resolve(
        _build_reveal_result_content(
            request_id="request-4",
            status="revealed",
            project_config_id=ID("project-other"),
        ),
        from_websocket_id="frontend-a",
    )
    assert resolved_mismatch is True

    with pytest.raises(RevealResultContractMismatchError, match="project mismatch"):
        await hub.wait_for_result(request_id="request-4", timeout_seconds=0.2)


@pytest.mark.asyncio
async def test_reveal_result_hub_requires_exact_expected_setting_ids() -> None:
    hub = UISettingRevealResultHub()
    hub.register_request(
        "request-5",
        expected_setting_ids={"setting-a"},
    )

    resolved_mismatch = hub.resolve(
        _build_reveal_result_content(
            request_id="request-5",
            status="revealed",
            setting_id="setting-b",
        ),
        from_websocket_id="frontend-a",
    )
    assert resolved_mismatch is True

    with pytest.raises(RevealResultContractMismatchError, match="setting id mismatch"):
        await hub.wait_for_result(request_id="request-5", timeout_seconds=0.2)
