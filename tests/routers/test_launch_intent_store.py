from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from setta.launch_intent_store import (
    WorkspaceLaunchIntentStore,
    WorkspaceLaunchIntentStoreUnavailableError,
)


def _build_store(tmp_path: Path) -> WorkspaceLaunchIntentStore:
    return WorkspaceLaunchIntentStore(storage_path=tmp_path / "launch_intents.json")


def test_launch_intent_store_consumes_tokens_once(tmp_path: Path) -> None:
    store = _build_store(tmp_path)
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


def test_launch_intent_store_prunes_expired_tokens(tmp_path: Path) -> None:
    store = _build_store(tmp_path)
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


def test_launch_intent_store_rejects_session_mismatch(tmp_path: Path) -> None:
    store = _build_store(tmp_path)
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


def test_launch_intent_store_persists_across_store_instances(tmp_path: Path) -> None:
    store_a = _build_store(tmp_path)
    store_b = _build_store(tmp_path)
    store_a.create(
        token="token-1",
        session_id="session-1",
        launch_request_payload={"workspaceRoot": "/tmp/workspace"},
        return_url="http://localhost/home",
        exp=200,
        now=100,
    )

    stored = store_b.consume_once(token="token-1", session_id="session-1", now=110)

    assert stored.launch_request_payload["workspaceRoot"] == "/tmp/workspace"
    assert stored.return_url == "http://localhost/home"


def test_launch_intent_store_cross_instance_consume_succeeds_once(
    tmp_path: Path,
) -> None:
    store_a = _build_store(tmp_path)
    store_b = _build_store(tmp_path)
    store_a.create(
        token="token-1",
        session_id="session-1",
        launch_request_payload={"workspaceRoot": "/tmp/workspace"},
        return_url="http://localhost/home",
        exp=200,
        now=100,
    )

    def consume(store: WorkspaceLaunchIntentStore) -> str:
        try:
            store.consume_once(token="token-1", session_id="session-1", now=110)
            return "ok"
        except ValueError as exc:
            return str(exc)

    with ThreadPoolExecutor(max_workers=2) as executor:
        result_a = executor.submit(consume, store_a).result()
        result_b = executor.submit(consume, store_b).result()

    results = [result_a, result_b]
    assert results.count("ok") == 1
    assert (
        len([result for result in results if "missing or already consumed" in result])
        == 1
    )


def test_launch_intent_store_ignores_stale_lock_file(tmp_path: Path) -> None:
    store = _build_store(tmp_path)
    lock_path = (tmp_path / "launch_intents.json").with_name("launch_intents.json.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path.write_text("stale", encoding="utf-8")

    store.create(
        token="token-1",
        session_id="session-1",
        launch_request_payload={"workspaceRoot": "/tmp/workspace"},
        return_url="http://localhost/home",
        exp=120,
        now=100,
    )

    stored = store.consume_once(token="token-1", session_id="session-1", now=110)
    assert stored.return_url == "http://localhost/home"


def test_launch_intent_store_maps_lock_parent_failures_to_unavailable_error(
    tmp_path: Path,
) -> None:
    lock_parent = tmp_path / "lock-parent-as-file"
    lock_parent.write_text("not-a-directory", encoding="utf-8")
    store = WorkspaceLaunchIntentStore(storage_path=lock_parent / "launch_intents.json")

    # A non-directory lock parent must fail as a typed store-unavailable error.
    with pytest.raises(
        WorkspaceLaunchIntentStoreUnavailableError,
        match="Failed acquiring launch-intent store lock",
    ):
        store.clear()


def test_launch_intent_store_threaded_create_prune_no_runtime_errors(
    tmp_path: Path,
) -> None:
    store = _build_store(tmp_path)

    def create_worker(worker_id: int) -> None:
        for idx in range(120):
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
        for idx in range(240):
            store.prune(now=idx)

    # This stress case used to raise `RuntimeError: dictionary changed size during iteration`
    # when prune iterated a mutable global dict without synchronization.
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(create_worker, worker_id) for worker_id in range(6)]
        futures.extend(executor.submit(prune_worker) for _ in range(2))
        for future in futures:
            future.result()
