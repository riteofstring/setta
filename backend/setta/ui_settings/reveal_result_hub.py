import asyncio
from dataclasses import dataclass

from setta.types.id import ID
from setta.types.websocket import (
    UISettingRevealResultContent,
    WebsocketMsgUISettingRevealResult,
)
from setta.types.websocket import (
    UISettingRevealResultStatus as _UISettingRevealResultStatus,
)


@dataclass
class _RevealResultWaiter:
    future: asyncio.Future[UISettingRevealResultContent]
    expected_websocket_id: str | None
    expected_project_config_id: ID | None
    expected_setting_ids: frozenset[str] | None


class RevealResultTransportDisconnectedError(RuntimeError):
    def __init__(self, *, request_id: str, websocket_id: str) -> None:
        self.request_id = request_id
        self.websocket_id = websocket_id
        super().__init__(
            "Frontend websocket disconnected while reveal request was pending: "
            f"{websocket_id} (request {request_id})"
        )


class UISettingRevealResultHub:
    def __init__(self) -> None:
        self._waiters_by_request_id: dict[str, _RevealResultWaiter] = {}

    def register_request(
        self,
        request_id: str,
        *,
        expected_websocket_id: str | None = None,
        expected_project_config_id: ID | None = None,
        expected_setting_ids: set[str] | None = None,
    ) -> None:
        if request_id in self._waiters_by_request_id:
            raise KeyError(f"Duplicate reveal request id: {request_id}")
        loop = asyncio.get_running_loop()
        self._waiters_by_request_id[request_id] = _RevealResultWaiter(
            future=loop.create_future(),
            expected_websocket_id=expected_websocket_id,
            expected_project_config_id=expected_project_config_id,
            expected_setting_ids=(
                frozenset(expected_setting_ids)
                if expected_setting_ids is not None
                else None
            ),
        )

    def cancel_request(self, request_id: str) -> bool:
        waiter_record = self._waiters_by_request_id.pop(request_id, None)
        if waiter_record is None:
            return False
        waiter = waiter_record.future
        if waiter.done():
            return False
        waiter.cancel()
        return True

    def cancel_requests_for_websocket_id(self, websocket_id: str) -> int:
        cancelled_count = 0
        for request_id, waiter_record in list(self._waiters_by_request_id.items()):
            if waiter_record.expected_websocket_id != websocket_id:
                continue
            waiter = waiter_record.future
            if waiter.done():
                continue
            waiter.set_exception(
                RevealResultTransportDisconnectedError(
                    request_id=request_id,
                    websocket_id=websocket_id,
                )
            )
            cancelled_count += 1
        return cancelled_count

    async def wait_for_result(
        self,
        *,
        request_id: str,
        timeout_seconds: float,
    ) -> UISettingRevealResultContent | None:
        waiter_record = self._waiters_by_request_id.get(request_id)
        if waiter_record is None:
            raise KeyError(f"Reveal request id is not registered: {request_id}")
        waiter = waiter_record.future
        try:
            return await asyncio.wait_for(waiter, timeout=timeout_seconds)
        except TimeoutError:
            return None
        finally:
            self._waiters_by_request_id.pop(request_id, None)

    def resolve(
        self,
        content: UISettingRevealResultContent,
        *,
        from_websocket_id: str,
    ) -> bool:
        waiter_record = self._waiters_by_request_id.get(content.requestId)
        if waiter_record is None:
            return False
        waiter = waiter_record.future
        if waiter.done():
            return False
        expected_websocket_id = waiter_record.expected_websocket_id
        if (
            expected_websocket_id is not None
            and expected_websocket_id != from_websocket_id
        ):
            return False
        expected_project_config_id = waiter_record.expected_project_config_id
        if (
            expected_project_config_id is not None
            and content.projectConfigId != expected_project_config_id
        ):
            return False
        expected_setting_ids = waiter_record.expected_setting_ids
        if expected_setting_ids is not None:
            actual_setting_ids = {status.settingId for status in content.statuses}
            if len(content.statuses) != len(expected_setting_ids):
                return False
            if actual_setting_ids != expected_setting_ids:
                return False
        waiter.set_result(content)
        return True


UISettingRevealResultMessage = WebsocketMsgUISettingRevealResult
UISettingRevealResultStatus = _UISettingRevealResultStatus
