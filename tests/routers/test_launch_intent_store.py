from concurrent.futures import ThreadPoolExecutor

import pytest

from setta.launch_intent_store import WorkspaceLaunchIntentStore


def test_launch_intent_store_consumes_tokens_once() -> None:
    store = WorkspaceLaunchIntentStore()
    store.create(
        token="token-1",
        session_id="session-1",
        launch_request_payload={"workspaceRoot": "/tmp/workspace"},
        return_url="http://localhost/home",
        exp=120,
        now=100,
    )

    stored = store.consume_once(token="token-1", session_id="session-1", now=110)
    assert stored.launch_request_payload["workspaceRoot"] == "/tmp/workspace"
    assert stored.return_url == "http://localhost/home"

    with pytest.raises(ValueError, match="missing or already consumed"):
        store.consume_once(token="token-1", session_id="session-1", now=110)


def test_launch_intent_store_prunes_expired_tokens() -> None:
    store = WorkspaceLaunchIntentStore()
    store.create(
        token="expired",
        session_id="session-1",
        launch_request_payload={"workspaceRoot": "/tmp/workspace"},
        return_url="http://localhost/home",
        exp=99,
        now=90,
    )

    store.prune(now=100)

    with pytest.raises(ValueError, match="missing or already consumed"):
        store.consume_once(token="expired", session_id="session-1", now=100)


def test_launch_intent_store_rejects_session_mismatch() -> None:
    store = WorkspaceLaunchIntentStore()
    store.create(
        token="token-1",
        session_id="session-1",
        launch_request_payload={"workspaceRoot": "/tmp/workspace"},
        return_url="http://localhost/home",
        exp=200,
        now=100,
    )

    with pytest.raises(ValueError, match="bound to a different session"):
        store.consume_once(token="token-1", session_id="session-2", now=110)


def test_launch_intent_store_threaded_create_prune_no_runtime_errors() -> None:
    store = WorkspaceLaunchIntentStore()

    def create_worker(worker_id: int) -> None:
        for idx in range(400):
            now = idx
            store.create(
                token=f"{worker_id}-{idx}",
                session_id="session-1",
                launch_request_payload={"workspaceRoot": "/tmp/workspace"},
                return_url="http://localhost/home",
                exp=now + 20,
                now=now,
            )

    def prune_worker() -> None:
        for idx in range(800):
            store.prune(now=idx)

    # This stress case used to raise `RuntimeError: dictionary changed size during iteration`
    # when prune iterated a mutable global dict without synchronization.
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [
            executor.submit(create_worker, worker_id) for worker_id in range(6)
        ]
        futures.extend(executor.submit(prune_worker) for _ in range(2))
        for future in futures:
            future.result()
