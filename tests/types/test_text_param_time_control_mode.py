from setta.types.code_obj_impls import (
    DateCalendarWeekStart,
    DateControlMode,
    DateSelectionMode,
    TextParamCodeObjImpl,
    TextParamInputUIType,
    TimeControlMode,
)


def test_text_param_defaults_time_control_mode_to_display():
    impl = TextParamCodeObjImpl()
    assert impl.timeControlMode == TimeControlMode.display


def test_text_param_accepts_input_mode_for_time_ui():
    impl = TextParamCodeObjImpl(
        uiType=TextParamInputUIType.time,
        timeControlMode=TimeControlMode.input,
    )
    assert impl.timeControlMode == TimeControlMode.input


def test_text_param_defaults_date_control_fields():
    impl = TextParamCodeObjImpl(uiType=TextParamInputUIType.date)
    assert impl.dateControlMode == DateControlMode.input
    assert impl.dateSelectionMode == DateSelectionMode.single
    assert impl.dateCalendarWeekStart == DateCalendarWeekStart.sunday


def test_text_param_accepts_calendar_multi_select_config():
    impl = TextParamCodeObjImpl(
        uiType=TextParamInputUIType.date,
        dateControlMode=DateControlMode.calendar,
        dateSelectionMode=DateSelectionMode.multiple,
        dateCalendarWeekStart=DateCalendarWeekStart.monday,
    )
    assert impl.dateControlMode == DateControlMode.calendar
    assert impl.dateSelectionMode == DateSelectionMode.multiple
    assert impl.dateCalendarWeekStart == DateCalendarWeekStart.monday
