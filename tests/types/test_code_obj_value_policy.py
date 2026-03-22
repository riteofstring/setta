import pytest

from setta.types.generated.go_shared_types import CodeObjType
from setta.types.id import ID
from setta.types.project_config import (
    CodeObjTypeValuePolicy,
    CodeObjValueOverride,
    CodeObjValuePolicy,
    CodeObjValueRepresentationMode,
    resolve_code_obj_value_policy,
)


def test_default_policy_resolves_literal() -> None:
    policy = CodeObjValuePolicy()
    resolved = resolve_code_obj_value_policy(
        policy,
        ID("param-1"),
        CodeObjType.TextParam,
    )
    assert resolved.representation == CodeObjValueRepresentationMode.string


def test_type_policy_applies_when_present() -> None:
    policy = CodeObjValuePolicy(
        typePolicies={
            CodeObjType.TextParam: CodeObjTypeValuePolicy(
                representation=CodeObjValueRepresentationMode.string
            )
        }
    )
    resolved = resolve_code_obj_value_policy(
        policy,
        ID("param-1"),
        CodeObjType.TextParam,
    )
    assert resolved.representation == CodeObjValueRepresentationMode.string


def test_override_takes_precedence_over_type_policy() -> None:
    policy = CodeObjValuePolicy(
        typePolicies={
            CodeObjType.SliderParam: CodeObjTypeValuePolicy(
                representation=CodeObjValueRepresentationMode.string
            )
        },
        codeObjOverrides={
            ID("param-2"): CodeObjValueOverride(
                representation=CodeObjValueRepresentationMode.json_parsed
            )
        },
    )
    resolved = resolve_code_obj_value_policy(
        policy,
        ID("param-2"),
        CodeObjType.SliderParam,
    )
    assert resolved.representation == CodeObjValueRepresentationMode.json_parsed


def test_unsupported_representation_raises() -> None:
    policy = CodeObjValuePolicy(
        typePolicies={
            CodeObjType.NestedParam: CodeObjTypeValuePolicy(
                representation=CodeObjValueRepresentationMode.string
            )
        }
    )
    with pytest.raises(ValueError):
        resolve_code_obj_value_policy(
            policy,
            ID("param-3"),
            CodeObjType.NestedParam,
        )


def test_default_dropzone_representation_is_file_path() -> None:
    policy = CodeObjValuePolicy()
    resolved = resolve_code_obj_value_policy(
        policy,
        ID("param-dropzone"),
        CodeObjType.DropzoneParam,
    )
    assert resolved.representation == CodeObjValueRepresentationMode.file_path


def test_code_param_json_representation_raises() -> None:
    policy = CodeObjValuePolicy(
        typePolicies={
            CodeObjType.CodeParam: CodeObjTypeValuePolicy(
                representation=CodeObjValueRepresentationMode.json_parsed
            )
        }
    )
    with pytest.raises(ValueError):
        resolve_code_obj_value_policy(
            policy,
            ID("param-code"),
            CodeObjType.CodeParam,
        )


def test_text_param_expression_representation_raises() -> None:
    policy = CodeObjValuePolicy(
        typePolicies={
            CodeObjType.TextParam: CodeObjTypeValuePolicy(
                representation=CodeObjValueRepresentationMode.expression
            )
        }
    )
    with pytest.raises(ValueError):
        resolve_code_obj_value_policy(
            policy,
            ID("param-text"),
            CodeObjType.TextParam,
        )


def test_dropzone_file_read_representation_allowed() -> None:
    policy = CodeObjValuePolicy(
        typePolicies={
            CodeObjType.DropzoneParam: CodeObjTypeValuePolicy(
                representation=CodeObjValueRepresentationMode.file_read
            )
        }
    )
    resolved = resolve_code_obj_value_policy(
        policy,
        ID("param-dropzone"),
        CodeObjType.DropzoneParam,
    )
    assert resolved.representation == CodeObjValueRepresentationMode.file_read
