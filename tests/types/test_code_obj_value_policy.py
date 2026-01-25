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
            CodeObjValueRepresentationMode.literal,
        )

    def test_type_policy_applies_when_present(self) -> None:
        policy = CodeObjValuePolicy(
            typePolicies={
                CodeObjType.TextParam: CodeObjTypeValuePolicy(
                    representation=CodeObjValueRepresentationMode.raw
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
            CodeObjValueRepresentationMode.raw,
        )

    def test_override_takes_precedence_over_type_policy(self) -> None:
        policy = CodeObjValuePolicy(
            typePolicies={
                CodeObjType.CodeParam: CodeObjTypeValuePolicy(
                    representation=CodeObjValueRepresentationMode.raw
                )
            },
            codeObjOverrides={
                ID("param-2"): CodeObjValueOverride(
                    representation=CodeObjValueRepresentationMode.json
                )
            },
        )
        resolved = resolve_code_obj_value_policy(
            policy,
            ID("param-2"),
            CodeObjType.CodeParam,
        )
        self.assertEqual(
            resolved.representation,
            CodeObjValueRepresentationMode.json,
        )

    def test_unsupported_representation_raises(self) -> None:
        policy = CodeObjValuePolicy(
            typePolicies={
                CodeObjType.NestedParam: CodeObjTypeValuePolicy(
                    representation=CodeObjValueRepresentationMode.raw
                )
            }
        )
        with self.assertRaises(ValueError):
            resolve_code_obj_value_policy(
                policy,
                ID("param-3"),
                CodeObjType.NestedParam,
            )
