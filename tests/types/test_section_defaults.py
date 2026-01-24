import unittest

from setta.types.section_impls import (
    ChartSectionImpl,
    ChatSectionImpl,
    DrawSectionImpl,
)
from setta.types.settings_state import SectionSizingPolicy


class SectionDefaultSizingTests(unittest.TestCase):
    def test_default_section_sizes_meet_policy_minimums(self) -> None:
        policy = SectionSizingPolicy()
        cases = [
            ("Chart", ChartSectionImpl(), policy.byType.Chart),
            ("Draw", DrawSectionImpl(), policy.byType.Draw),
            ("Chat", ChatSectionImpl(), policy.byType.Chat),
        ]

        for name, impl, policy_entry in cases:
            with self.subTest(section=name):
                self.assertIsInstance(impl.size.width, (int, float))
                self.assertIsInstance(impl.size.height, (int, float))
                self.assertGreaterEqual(impl.size.width, policy_entry.minWidth)
                self.assertGreaterEqual(impl.size.height, policy_entry.minHeight)


if __name__ == "__main__":
    unittest.main()
