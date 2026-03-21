from lsprotocol import types as LSPTypes

from setta.project_state.lsp_response_handlers.signatureHelp import (
    get_pyright_param_proposals,
    wrapper_parse_signature,
)
from setta.types.code_obj_impls import CodeParamCodeObjImpl
from setta.types.generated.settings_state import SettingsState


def test_pyright_proposals_capture_parameter_type_annotation() -> None:
    signature = LSPTypes.SignatureInformation(
        label="fn(name: str = default)",
        parameters=[LSPTypes.ParameterInformation(label="name: str = default")],
    )

    proposals = get_pyright_param_proposals(signature, {})

    assert len(proposals) == 1
    assert proposals[0].name == "name"
    assert proposals[0].typeAnnotation == "str"


def test_wrapper_parse_signature_writes_type_annotation_to_code_param_impl() -> None:
    settings = SettingsState()
    signature = LSPTypes.SignatureInformation(
        label="fn(title: str | None)",
        parameters=[LSPTypes.ParameterInformation(label="title: str | None")],
    )

    _, code_obj_impl_map = wrapper_parse_signature(
        settings,
        signature,
        {},
        get_pyright_param_proposals,
    )

    assert len(code_obj_impl_map) == 1
    impl = next(iter(code_obj_impl_map.values()))
    assert isinstance(impl, CodeParamCodeObjImpl)
    assert impl.typeAnnotation == "str | None"
