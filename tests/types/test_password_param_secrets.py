import pytest

from setta.code_gen.dependency_graph import DependencyGraph
from setta.secrets.password_store import get_password_secret
from setta.project_state.secret_values import strip_password_values
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeObjType,
    PasswordParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dependency_key import create_dep_key
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import change_param_impl, delete_code_obj, set_param_entered_value
from setta.types.helpers_lvl3 import copy_project
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import CallableSectionImpl


@pytest.fixture
def runtime_root(tmp_path, monkeypatch) -> str:
    monkeypatch.setenv("SETTA_RUNTIME_ROOT", str(tmp_path))
    return str(tmp_path)


def build_project_state(
    *,
    param_type: CodeObjType,
    param_value: str = "",
) -> tuple[ProjectStateSingleConfig, ID, ID, ID]:
    section_id = ID("section-1")
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")

    callable_id = ID("callable-1")
    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")

    param_id = ID("param-1")
    param_impl_id = ID("param-impl-1")
    param_variant_id = ID("param-variant-1")

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="TestCallable",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    if param_type is CodeObjType.PasswordParam:
        param_impl = PasswordParamCodeObjImpl(
            id=param_impl_id,
            value=param_value,
        )
    elif param_type is CodeObjType.TextParam:
        param_impl = TextParamCodeObjImpl(
            id=param_impl_id,
            value=param_value,
        )
    else:
        raise ValueError(f"Unsupported param type {param_type}")

    param_variant = Variant(
        id=param_variant_id,
        impl=param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
    )
    param_core = Core(
        id=param_id,
        name="secret",
        variants=[param_variant.id],
        defaultVariant=param_variant.id,
    )

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap={
            callable_id: callable_variant.id,
            param_id: param_variant.id,
        },
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name="CallableSection",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )

    project_config = ProjectConfig(
        id=ID("project-1"),
        name="PasswordProject",
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
    )
    project_state = ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={callable_id: callable_core, param_id: param_core},
        codeObjImpls={callable_impl.id: callable_impl, param_impl.id: param_impl},
        codeObjVariants={
            callable_variant.id: callable_variant,
            param_variant.id: param_variant,
        },
    )
    return project_state, section_id, param_id, param_impl_id


def test_password_param_stores_secret_by_impl_id(runtime_root) -> None:
    project_state, section_id, param_id, param_impl_id = build_project_state(
        param_type=CodeObjType.PasswordParam,
    )

    set_param_entered_value(project_state, section_id, param_id, "hunter2")

    assert get_password_secret(str(param_impl_id)) == "hunter2"
    assert get_password_secret(str(param_id)) == ""
    impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state, section_id, param_id, PasswordParamCodeObjImpl
    )
    assert impl.value == ""


def test_password_secret_clears_on_type_change(runtime_root) -> None:
    project_state, section_id, param_id, param_impl_id = build_project_state(
        param_type=CodeObjType.PasswordParam,
    )
    set_param_entered_value(project_state, section_id, param_id, "move-me")
    settings = SettingsState()

    change_param_impl(
        settings,
        project_state,
        section_id,
        param_id,
        CodeObjType.TextParam.name,
    )

    assert get_password_secret(str(param_impl_id)) == ""
    impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state, section_id, param_id, TextParamCodeObjImpl
    )
    assert impl.value == ""


def test_text_param_value_moves_to_secret_on_password_switch(runtime_root) -> None:
    project_state, section_id, param_id, _ = build_project_state(
        param_type=CodeObjType.TextParam,
        param_value="open-sesame",
    )
    settings = SettingsState()

    change_param_impl(
        settings,
        project_state,
        section_id,
        param_id,
        CodeObjType.PasswordParam.name,
    )

    impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state, section_id, param_id, PasswordParamCodeObjImpl
    )
    assert get_password_secret(str(impl.id)) == "open-sesame"
    assert impl.value == ""


def test_delete_code_obj_clears_secret(runtime_root) -> None:
    project_state, section_id, param_id, param_impl_id = build_project_state(
        param_type=CodeObjType.PasswordParam,
    )
    set_param_entered_value(project_state, section_id, param_id, "cleanup")

    delete_code_obj(project_state, param_id)

    assert get_password_secret(str(param_impl_id)) == ""


def test_dependency_graph_uses_secret_presence(runtime_root) -> None:
    project_state, section_id, param_id, param_impl_id = build_project_state(
        param_type=CodeObjType.PasswordParam,
    )
    graph_without_secret = DependencyGraph(project_state)
    section_key = create_dep_key(sectionId=section_id)
    param_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
    section_node = graph_without_secret.get_node(section_key)
    assert section_node is not None
    assert section_node.deps[param_key] is False

    set_param_entered_value(project_state, section_id, param_id, "available")
    assert get_password_secret(str(param_impl_id)) == "available"
    graph_with_secret = DependencyGraph(project_state)
    section_node_with_secret = graph_with_secret.get_node(section_key)
    assert section_node_with_secret is not None
    assert section_node_with_secret.deps[param_key] is True


def test_strip_password_values_sets_has_secret(runtime_root) -> None:
    project_state, section_id, param_id, _ = build_project_state(
        param_type=CodeObjType.PasswordParam,
    )
    set_param_entered_value(project_state, section_id, param_id, "revealed")

    strip_password_values(project_state)

    impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state, section_id, param_id, PasswordParamCodeObjImpl
    )
    assert impl.hasSecret is True
    assert impl.value == ""


def test_strip_password_values_force_has_secret_false(runtime_root) -> None:
    project_state, section_id, param_id, _ = build_project_state(
        param_type=CodeObjType.PasswordParam,
    )
    set_param_entered_value(project_state, section_id, param_id, "hidden")

    strip_password_values(project_state, force_has_secret=False)

    impl = get_curr_effective_code_obj_impl_with_type_guard(
        project_state, section_id, param_id, PasswordParamCodeObjImpl
    )
    assert impl.hasSecret is False
    assert impl.value == ""


def test_copy_project_clears_password_secrets(runtime_root) -> None:
    project_state, section_id, param_id, _ = build_project_state(
        param_type=CodeObjType.PasswordParam,
    )
    set_param_entered_value(project_state, section_id, param_id, "hunter2")

    copied = copy_project(project_state, "Copy", do_create_new_id=True)

    new_section_id = next(
        key
        for key, section in copied.sections.items()
        if section.name == "CallableSection"
    )
    new_param_id = next(
        key for key, core in copied.codeObjs.items() if core.name == "secret"
    )
    impl = get_curr_effective_code_obj_impl_with_type_guard(
        copied, new_section_id, new_param_id, PasswordParamCodeObjImpl
    )
    assert impl.hasSecret is False
    assert get_password_secret(str(impl.id)) == ""
