class UISettingExpectedOldValueMismatchError(ValueError):
    def __init__(
        self,
        *,
        setting_id: str,
        expected_old_value: object,
        observed_old_value: object,
    ) -> None:
        self.setting_id = setting_id
        self.expected_old_value = expected_old_value
        self.observed_old_value = observed_old_value
        super().__init__(
            (
                f"UI setting {setting_id} changed since pre-write validation. "
                "Retry with a fresh read before writing."
            )
        )
