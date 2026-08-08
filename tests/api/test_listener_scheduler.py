import asyncio

import pytest

from setta.api.scheduling import ListenerCallbackScheduler


@pytest.mark.asyncio
async def test_debounce_merges_pending_payloads() -> None:
    scheduler = ListenerCallbackScheduler()
    invocations: list[dict[str, int]] = []
    event = asyncio.Event()

    async def executor(payload: dict[str, int], events: list[object]):
        invocations.append(dict(payload))
        event.set()

    scheduler.register_callback(
        "cb",
        executor=executor,
        debounce_ms=50,
        throttle_ms=None,
    )

    scheduler.submit("cb", changed={"a": 1})
    await asyncio.sleep(0.02)
    assert not event.is_set()

    scheduler.submit("cb", changed={"b": 2})
    await asyncio.sleep(0.02)
    assert not event.is_set()

    await asyncio.wait_for(event.wait(), timeout=0.25)

    assert invocations == [{"a": 1, "b": 2}]


@pytest.mark.asyncio
async def test_throttle_delays_followup_invocation() -> None:
    scheduler = ListenerCallbackScheduler()
    call_times: list[float] = []
    payloads: list[dict[str, int]] = []
    first_event = asyncio.Event()
    second_event = asyncio.Event()

    loop = asyncio.get_running_loop()

    async def executor(payload: dict[str, int], events: list[object]):
        call_times.append(loop.time())
        payloads.append(dict(payload))
        if len(call_times) == 1:
            first_event.set()
        else:
            second_event.set()

    scheduler.register_callback(
        "cb",
        executor=executor,
        debounce_ms=None,
        throttle_ms=50,
    )

    scheduler.submit("cb", changed={"value": 1})
    await asyncio.wait_for(first_event.wait(), timeout=0.2)

    scheduler.submit("cb", changed={"value": 2})
    await asyncio.sleep(0.02)
    assert not second_event.is_set()

    await asyncio.wait_for(second_event.wait(), timeout=0.3)

    assert payloads[0] == {"value": 1}
    assert payloads[1] == {"value": 2}
    assert call_times[1] - call_times[0] >= 0.05
