from setta.types.generated.settings_state import SettingsState
from setta.types.settings_state import (
    MetaControlSizeMode,
    MetaControlSizingPolicyByType,
    MetaControlSizingPolicyTypeEntry,
    SectionSizingPolicy,
)


def test_meta_control_sizing_policy_overrides() -> None:
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

    assert entry.minHeight == 120
    assert entry.minWidth == 300
    assert entry.sizeModeHeight == MetaControlSizeMode.auto_only
    assert entry.sizeModeWidth == MetaControlSizeMode.any
