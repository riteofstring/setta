from unittest import TestCase

from setta.code_gen.dependency_graph import DependencyGraph
from setta.code_gen.python.code_generator import (
    GEN_CODE_BODY_INDENT,
    GEN_CODE_MULTILINE_CONTINUATION_INDENT,
    PythonCodeGenerator,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl2 import (
    add_kwarg,
    create_top_level_section,
    set_param_entered_value,
)
from setta.types.code_obj_impls import CodeCallableCodeObjImpl, CodeParamCodeObjImpl
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
    get_python_codegen_target_with_type_guard,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import CallableSectionImpl, SectionType


def build_callable_project_state(param_count: int) -> ProjectStateSingleConfig:
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")

    callable_id = ID("callable-1")
    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")

    param_ids = [ID(f"param-{idx}") for idx in range(param_count)]
    param_impl_ids = [ID(f"param-impl-{idx}") for idx in range(param_count)]
    param_variant_ids = [ID(f"param-variant-{idx}") for idx in range(param_count)]

    callable_impl = CodeCallableCodeObjImpl(id=callable_impl_id, children=param_ids)
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="my_callable",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    code_obj_variant_map = {callable_id: callable_variant.id}
    code_objs: dict[ID, Core] = {callable_id: callable_core}
    code_obj_impls = {callable_impl.id: callable_impl}
    code_obj_variants: dict[ID, Variant] = {callable_variant.id: callable_variant}

    for idx, param_id in enumerate(param_ids):
        param_impl = CodeParamCodeObjImpl(
            id=param_impl_ids[idx],
            value=str(idx),
        )
        param_variant = Variant(
            id=param_variant_ids[idx],
            impl=param_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
        )
        param_core = Core(
            id=param_id,
            name=f"param_{idx}",
            variants=[param_variant.id],
            defaultVariant=param_variant.id,
        )
        code_obj_variant_map[param_id] = param_variant.id
        code_objs[param_id] = param_core
        code_obj_impls[param_impl.id] = param_impl
        code_obj_variants[param_variant.id] = param_variant

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap=code_obj_variant_map,
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name="call",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )

    project_config = ProjectConfig(
        name="test-project",
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs=code_objs,
        codeObjImpls=code_obj_impls,
        codeObjVariants=code_obj_variants,
    )
    return project_state


class CodeGeneratorFormattingTests(TestCase):
    def test_dict_section_renders_multiline_values(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
            core_overrides={"name": "config"},
        )

        param_ids = []
        for idx in range(4):
            param_id = add_kwarg(settings, project_state, section_id)
            project_state.codeObjs[param_id].name = f"param_{idx}"
            set_param_entered_value(project_state, section_id, param_id, str(idx))
            param_ids.append(param_id)

        dep_graph = DependencyGraph(project_state)
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        generator = PythonCodeGenerator(
            dep_graph,
            python_target.genCodePrefix,
            python_target.genCodeSuffix,
        )
        generator.generate_code()
        generated_lines = generator.generated_code.splitlines()

        target_index = None
        target_line = ""
        for idx, line in enumerate(generated_lines):
            if "state.config = {" in line:
                target_index = idx
                target_line = line
                break

        self.assertIsNotNone(target_index)
        assert target_index is not None
        self.assertTrue(target_line.startswith("        state.config = {"))

        expected_block_len = target_index + 1 + len(param_ids) + 1
        self.assertGreaterEqual(len(generated_lines), expected_block_len)

        item_lines = generated_lines[target_index + 1 : target_index + 1 + len(param_ids)]
        for idx, line in enumerate(item_lines):
            self.assertTrue(line.startswith("            "))
            self.assertIn(
                f"'param_{idx}': state.config__param_{idx},",
                line,
            )

        closing_line = generated_lines[target_index + 1 + len(param_ids)]
        self.assertEqual(closing_line, "        }")

    def test_callable_section_renders_multiline_args(self) -> None:
        param_count = 4
        project_state = build_callable_project_state(param_count)

        dep_graph = DependencyGraph(project_state)
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        generator = PythonCodeGenerator(
            dep_graph,
            python_target.genCodePrefix,
            python_target.genCodeSuffix,
        )
        generator.generate_code()
        generated_lines = generator.generated_code.splitlines()

        target_index = None
        for idx, line in enumerate(generated_lines):
            if "state.call = my_callable(" in line:
                target_index = idx
                break

        self.assertIsNotNone(target_index)
        assert target_index is not None
        self.assertEqual(
            generated_lines[target_index],
            f"{GEN_CODE_BODY_INDENT}state.call = my_callable(",
        )

        expected_block_len = target_index + 1 + param_count + 1
        self.assertGreaterEqual(len(generated_lines), expected_block_len)

        item_lines = generated_lines[target_index + 1 : target_index + 1 + param_count]
        for idx, line in enumerate(item_lines):
            self.assertEqual(
                line,
                f"{GEN_CODE_MULTILINE_CONTINUATION_INDENT}"
                f"param_{idx}=state.call__param_{idx},",
            )

        closing_line = generated_lines[target_index + 1 + param_count]
        self.assertEqual(closing_line, f"{GEN_CODE_BODY_INDENT})")

    def test_dict_section_escapes_keys_and_sanitizes_var_names(self) -> None:
        settings = SettingsState()
        project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        section_id = create_top_level_section(
            settings,
            project_state,
            SectionType.Dict,
            Position(),
            core_overrides={"name": "config"},
        )

        cases = [
            ("user-id", "user_id"),
            ("123 abc", "_123_abc"),
            ("class", "_class"),
            ('quote"key', "quote_key"),
            ("back\\slash", "back_slash"),
        ]
        for name, _ in cases:
            param_id = add_kwarg(settings, project_state, section_id)
            project_state.codeObjs[param_id].name = name
            set_param_entered_value(project_state, section_id, param_id, "1")

        dep_graph = DependencyGraph(project_state)
        python_target = get_python_codegen_target_with_type_guard(
            project_state.projectConfig
        )
        generator = PythonCodeGenerator(
            dep_graph,
            python_target.genCodePrefix,
            python_target.genCodeSuffix,
        )
        generator.generate_code()
        generated_lines = generator.generated_code.splitlines()

        for raw_name, sanitized in cases:
            expected_key = repr(raw_name)
            expected_full_path = f"config__{sanitized}"
            expected_line = (
                f"{GEN_CODE_MULTILINE_CONTINUATION_INDENT}"
                f"{expected_key}: state.{expected_full_path},"
            )
            self.assertIn(expected_line, generated_lines)
