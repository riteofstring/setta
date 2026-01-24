import time
import unittest

from setta.project_state.history import History


class HistoryCoalescingTests(unittest.TestCase):
    def test_coalesces_within_window_and_tracks_keys(self):
        history = History({"value": 0})
        self.assertEqual(len(history._history), 1)

        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=0.05)
        self.assertEqual(len(history._history), 2)

        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=0.05)
        self.assertEqual(len(history._history), 2)

        history.add_current_copy(coalesce_key="param:2", coalesce_window_s=0.05)
        self.assertEqual(len(history._history), 3)

        time.sleep(0.15)
        history.add_current_copy(coalesce_key="param:2", coalesce_window_s=0.05)
        self.assertEqual(len(history._history), 4)

    def test_coalesce_resets_after_undo(self):
        history = History({"value": 0})
        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=1.0)
        history.undo()
        self.assertTrue(history.can_redo())

        history.add_current_copy(coalesce_key="param:1", coalesce_window_s=1.0)
        self.assertFalse(history.can_redo())


if __name__ == "__main__":
    unittest.main()
