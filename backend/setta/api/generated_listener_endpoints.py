from typing import Awaitable, Callable, NotRequired, TypedDict

from setta.types.id import ID


class ListenerTypeCheckRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]


class RouterEndpointAPI:
    def __init__(self, caller: Callable[[str, object], Awaitable[object]]) -> None:
        self._caller = caller

    async def type_check(self, payload: ListenerTypeCheckRequestPayload) -> None:
        return await self._caller("route_type_check", payload)
