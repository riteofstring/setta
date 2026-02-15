from setta.types.code_obj_impls import (
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
