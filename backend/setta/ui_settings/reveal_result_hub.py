import asyncio
from dataclasses import dataclass

from setta.types.websocket import (
    UISettingRevealResultContent,
    UISettingRevealResultStatus as _UISettingRevealResultStatus,
    WebsocketMsgUISettingRevealResult,
)


@dataclass
class _RevealResultWaiter:
    future: asyncio.Future[UISettingRevealResultContent]
    expected_websocket_id: str | None


class UISettingRevealResultHub:
    def __init__(self) -> None:
        self._waiters_by_request_id: dict[str, _RevealResultWaiter] = {}

    def register_request(
        self, request_id: str, *, expected_websocket_id: str | None = None
    ) -> None:
        if request_id in self._waiters_by_request_id:
            raise KeyError(f"Duplicate reveal request id: {request_id}")
        loop = asyncio.get_running_loop()
        self._waiters_by_request_id[request_id] = _RevealResultWaiter(
            future=loop.create_future(),
            expected_websocket_id=expected_websocket_id,
        )

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
        waiter.set_result(content)
        return True


UISettingRevealResultMessage = WebsocketMsgUISettingRevealResult
UISettingRevealResultStatus = _UISettingRevealResultStatus
