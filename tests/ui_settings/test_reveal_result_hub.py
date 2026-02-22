from typing import Literal

import pytest

from setta.types.id import ID
from setta.types.websocket import (
    UISettingRevealResultContent,
    UISettingRevealResultStatus,
)
from setta.ui_settings.reveal_result_hub import UISettingRevealResultHub


def _build_reveal_result_content(
    *,
    request_id: str,
    status: Literal["revealed", "failed"],
) -> UISettingRevealResultContent:
    return UISettingRevealResultContent(
        projectConfigId=ID("project-1"),
        requestId=request_id,
        statuses=[
            UISettingRevealResultStatus(
                settingId="core.watch_code.enabled",
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

    # Non-target websocket acknowledgements must not resolve the request.
    ignored = hub.resolve(
        _build_reveal_result_content(
            request_id="request-1",
            status="failed",
        ),
        from_websocket_id="frontend-b",
    )
    assert ignored is False

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
