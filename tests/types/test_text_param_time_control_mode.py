from setta.types.code_obj_impls import (
    DateCalendarWeekStart,
    DateControlMode,
    DateParamCodeObjImpl,
    DateSelectionMode,
    TextParamCodeObjImpl,
    TextParamInputUIType,
    TimeControlMode,
    TimeParamCodeObjImpl,
)


def test_text_param_defaults_to_plain_ui_type():
    impl = TextParamCodeObjImpl()
    assert impl.uiType == TextParamInputUIType.plain


def test_text_param_has_no_date_or_time_control_fields():
    impl = TextParamCodeObjImpl()
    assert not hasattr(impl, "timeControlMode")
    assert not hasattr(impl, "dateControlMode")


def test_date_param_defaults_date_control_fields():
    impl = DateParamCodeObjImpl()
    assert impl.dateControlMode == DateControlMode.input
    assert impl.dateSelectionMode == DateSelectionMode.single
    assert impl.dateCalendarWeekStart == DateCalendarWeekStart.sunday
    assert impl.dateIncludesTime is False


def test_date_param_accepts_calendar_multi_select_config():
    impl = DateParamCodeObjImpl(
        dateControlMode=DateControlMode.calendar,
        dateSelectionMode=DateSelectionMode.multiple,
        dateCalendarWeekStart=DateCalendarWeekStart.monday,
    )
    assert impl.dateControlMode == DateControlMode.calendar
    assert impl.dateSelectionMode == DateSelectionMode.multiple
    assert impl.dateCalendarWeekStart == DateCalendarWeekStart.monday


def test_time_param_defaults_time_control_mode_to_input():
    impl = TimeParamCodeObjImpl()
    assert impl.timeControlMode == TimeControlMode.input


def test_time_param_accepts_display_mode():
    impl = TimeParamCodeObjImpl(timeControlMode=TimeControlMode.display)
    assert impl.timeControlMode == TimeControlMode.display
