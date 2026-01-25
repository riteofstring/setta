import unittest

from setta.types.code_obj_impls import CodeObjType
from setta.types.id import ID
from setta.types.project_config import (
    CodeObjTypeValuePolicy,
    CodeObjValueOverride,
    CodeObjValuePolicy,
    CodeObjValueRepresentationMode,
    resolve_code_obj_value_policy,
)


class CodeObjValuePolicyTests(unittest.TestCase):
    def test_default_policy_resolves_literal(self) -> None:
        policy = CodeObjValuePolicy()
        resolved = resolve_code_obj_value_policy(
            policy,
            ID("param-1"),
            CodeObjType.TextParam,
        )
        self.assertEqual(
            resolved.representation,
            CodeObjValueRepresentationMode.string,
        )

    def test_type_policy_applies_when_present(self) -> None:
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
        self.assertEqual(
            resolved.representation,
            CodeObjValueRepresentationMode.string,
        )

    def test_override_takes_precedence_over_type_policy(self) -> None:
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
        self.assertEqual(
            resolved.representation,
            CodeObjValueRepresentationMode.json_parsed,
        )

    def test_unsupported_representation_raises(self) -> None:
        policy = CodeObjValuePolicy(
            typePolicies={
                CodeObjType.NestedParam: CodeObjTypeValuePolicy(
                    representation=CodeObjValueRepresentationMode.string
                )
            }
        )
        with self.assertRaises(ValueError):
            resolve_code_obj_value_policy(
                policy,
                ID("param-3"),
                CodeObjType.NestedParam,
            )

    def test_default_dropzone_representation_is_file_path(self) -> None:
        policy = CodeObjValuePolicy()
        resolved = resolve_code_obj_value_policy(
            policy,
            ID("param-dropzone"),
            CodeObjType.DropzoneParam,
        )
        self.assertEqual(
            resolved.representation,
            CodeObjValueRepresentationMode.file_path,
        )

    def test_code_param_json_representation_raises(self) -> None:
        policy = CodeObjValuePolicy(
            typePolicies={
                CodeObjType.CodeParam: CodeObjTypeValuePolicy(
                    representation=CodeObjValueRepresentationMode.json_parsed
                )
            }
        )
        with self.assertRaises(ValueError):
            resolve_code_obj_value_policy(
                policy,
                ID("param-code"),
                CodeObjType.CodeParam,
            )

    def test_text_param_expression_representation_raises(self) -> None:
        policy = CodeObjValuePolicy(
            typePolicies={
                CodeObjType.TextParam: CodeObjTypeValuePolicy(
                    representation=CodeObjValueRepresentationMode.expression
                )
            }
        )
        with self.assertRaises(ValueError):
            resolve_code_obj_value_policy(
                policy,
                ID("param-text"),
                CodeObjType.TextParam,
            )

    def test_dropzone_file_read_representation_allowed(self) -> None:
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
        self.assertEqual(
            resolved.representation,
            CodeObjValueRepresentationMode.file_read,
        )
