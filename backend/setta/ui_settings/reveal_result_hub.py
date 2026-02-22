import asyncio
from typing import Literal

from pydantic import BaseModel

from setta.types.id import ID


class UISettingRevealResultStatus(BaseModel, extra="forbid"):
    settingId: str
    status: Literal["revealed", "failed"]
    errorCode: str | None = None
    errorMessage: str | None = None


class UISettingRevealResultContent(BaseModel, extra="forbid"):
    projectConfigId: ID
    requestId: str
    statuses: list[UISettingRevealResultStatus]


class UISettingRevealResultMessage(BaseModel, extra="forbid"):
    id: str | None = None
    messageType: Literal["UISettingRevealResult"]
    content: UISettingRevealResultContent


class UISettingRevealResultHub:
    def __init__(self) -> None:
        self._waiters_by_request_id: dict[
            str, asyncio.Future[UISettingRevealResultContent]
        ] = {}

    def register_request(self, request_id: str) -> None:
        if request_id in self._waiters_by_request_id:
            raise KeyError(f"Duplicate reveal request id: {request_id}")
        loop = asyncio.get_running_loop()
        self._waiters_by_request_id[request_id] = loop.create_future()

    async def wait_for_result(
        self,
        *,
        request_id: str,
        timeout_seconds: float,
    ) -> UISettingRevealResultContent | None:
        waiter = self._waiters_by_request_id.get(request_id)
        if waiter is None:
            raise KeyError(f"Reveal request id is not registered: {request_id}")
        try:
            return await asyncio.wait_for(waiter, timeout=timeout_seconds)
        except TimeoutError:
            return None
        finally:
            self._waiters_by_request_id.pop(request_id, None)

    def resolve(self, content: UISettingRevealResultContent) -> bool:
        waiter = self._waiters_by_request_id.get(content.requestId)
        if waiter is None or waiter.done():
            return False
        waiter.set_result(content)
        return True
