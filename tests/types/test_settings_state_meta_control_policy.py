from unittest import TestCase

from setta.types.generated.settings_state import SettingsState
from setta.types.settings_state import (
    MetaControlSizeMode,
    MetaControlSizingPolicyByType,
    MetaControlSizingPolicyTypeEntry,
    SectionSizingPolicy,
)


class SettingsStateMetaControlPolicyTests(TestCase):
    def test_meta_control_sizing_policy_overrides(self) -> None:
        policy = SectionSizingPolicy(
            metaControlByType=MetaControlSizingPolicyByType(
                DropzoneParam=MetaControlSizingPolicyTypeEntry(
                    minHeight=120,
                    minWidth=300,
                    sizeModeHeight=MetaControlSizeMode.auto_only,
                    sizeModeWidth=MetaControlSizeMode.any,
                )
            )
        )

        settings = SettingsState(sectionSizingPolicy=policy)
        entry = settings.sectionSizingPolicy.metaControlByType.DropzoneParam

        self.assertEqual(120, entry.minHeight)
        self.assertEqual(300, entry.minWidth)
        self.assertEqual(MetaControlSizeMode.auto_only, entry.sizeModeHeight)
        self.assertEqual(MetaControlSizeMode.any, entry.sizeModeWidth)
