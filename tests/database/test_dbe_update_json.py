import threading
import time

from setta.database.db_objs import DBE


def test_update_json_holds_file_lock_across_update_fn(tmp_path) -> None:
    dbe = DBE(tmp_path)
    target = dbe.path / "atomic.json"

    entered_a = threading.Event()
    proceed_a = threading.Event()
    entered_b = threading.Event()

    def updater_a(payload):
        entered_a.set()
        ok = proceed_a.wait(timeout=5)
        assert ok, "Timed out waiting to proceed updater A"
        current = payload if isinstance(payload, dict) else {}
        updated = dict(current)
        updated["a"] = 1
        return updated

    def updater_b(payload):
        entered_b.set()
        current = payload if isinstance(payload, dict) else {}
        updated = dict(current)
        updated["b"] = 2
        return updated

    thread_a = threading.Thread(target=lambda: dbe.update_json(target, updater_a))
    thread_a.start()
    assert entered_a.wait(timeout=2), "Expected updater A to start"

    thread_b = threading.Thread(target=lambda: dbe.update_json(target, updater_b))
    thread_b.start()

    # updater_b should be blocked on the file lock while updater_a is waiting.
    time.sleep(0.1)
    assert not entered_b.is_set(), "Expected updater B to block on the file lock"

    proceed_a.set()
    thread_a.join(timeout=5)
    thread_b.join(timeout=5)
    assert not thread_a.is_alive()
    assert not thread_b.is_alive()

    payload = dbe.read_json(target)
    assert payload["a"] == 1
    assert payload["b"] == 2

