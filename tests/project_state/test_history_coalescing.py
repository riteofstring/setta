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

    def test_entry_tokens_are_stable_across_undo_redo_and_trimmed_with_history(self):
        history = History({"value": 0}, max_size=3)
        token0 = history.get_current_entry_token()

        history.add_current_copy()
        token1 = history.get_current_entry_token()
        history.add_current_copy()
        token2 = history.get_current_entry_token()

        assert token0 != token1
        assert token1 != token2
        assert len(history._history) == len(history.get_entry_tokens()) == 3

        history.undo()
        assert history.get_current_entry_token() == token1
        history.redo()
        assert history.get_current_entry_token() == token2

        history.add_current_copy()
        token3 = history.get_current_entry_token()
        assert token3 not in {token0, token1, token2}
        assert len(history._history) == len(history.get_entry_tokens()) == 3

    def test_coalesced_copy_keeps_current_entry_token(self):
        history = History({"value": 0})
        history.add_current_copy(coalesce_key="k", coalesce_window_s=1.0)
        initial_token = history.get_current_entry_token()
        history.add_current_copy(coalesce_key="k", coalesce_window_s=1.0)
        assert history.get_current_entry_token() == initial_token

    def test_adjacent_coalesce_ignores_window_when_enabled(self):
        history = History({"value": 0})
        history.add_current_copy(
            coalesce_key="param:1",
            coalesce_window_s=0.05,
            coalesce_adjacent=True,
        )
        assert len(history._history) == 2

        time.sleep(0.1)
        history.add_current_copy(
            coalesce_key="param:1",
            coalesce_window_s=0.05,
            coalesce_adjacent=True,
        )
        assert len(history._history) == 2

        history.add_current_copy(
            coalesce_key="param:2",
            coalesce_window_s=0.05,
            coalesce_adjacent=True,
        )
        assert len(history._history) == 3

        time.sleep(0.1)
        history.add_current_copy(
            coalesce_key="param:1",
            coalesce_window_s=0.05,
            coalesce_adjacent=True,
        )
        assert len(history._history) == 4
