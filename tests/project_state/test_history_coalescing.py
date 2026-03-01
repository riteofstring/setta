import time

from setta.project_state.history import History


class TestHistoryCoalescing:
    def test_coalesces_within_window_and_tracks_keys(self):
        history = History({"value": 0})
        assert len(history._history) == 1

        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=0.2)
        assert len(history._history) == 2

        time.sleep(0.05)
        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=0.2)
        assert len(history._history) == 2

        time.sleep(0.05)
        history.add_current_copy(coalesce_key="param:2", coalesce_window_s=0.2)
        assert len(history._history) == 3

        time.sleep(0.25)
        history.add_current_copy(coalesce_key="param:2", coalesce_window_s=0.2)
        assert len(history._history) == 4

    def test_coalesce_resets_after_undo(self):
        history = History({"value": 0})
        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=1.0)
        history.undo()
        assert history.can_redo()

        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=1.0)
        assert not history.can_redo()

    def test_add_current_copy_supports_custom_copy_function(self):
        history = History({"value": 1})
        copy_calls = 0

        def custom_copy(state: dict[str, int]) -> dict[str, int]:
            nonlocal copy_calls
            copy_calls += 1
            return {
                "value": state["value"],
                "copied": 1,
            }

        history.add_current_copy(copy_func=custom_copy)
        assert copy_calls == 1
        assert history.get_current() == {"value": 1, "copied": 1}
