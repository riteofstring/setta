import json

import pytest

from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeObjType,
    CodeParamCodeObjImpl,
    DropdownParamCodeObjImpl,
    DropzoneMode,
    DropzoneParamCodeObjImpl,
    NestedParamCodeObjImpl,
)
from setta.types.dropzone import parse_dropzone_value
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    add_children_of_callable,
    add_kwarg,
    apply_top_level_section_layout_snapshot,
    change_param_impl,
    compute_smart_top_level_section_position,
    create_top_level_section,
    delete_selected_params,
    delete_sections,
    get_curr_top_level_param_ids,
    get_first_markdown_heading,
    indent_params,
    move_params_to_parent,
    move_params_within_parent,
    set_chat_section_chat_id,
    set_chat_section_settings,
    set_param_entered_value,
    set_prompt_section_format,
    set_prompt_section_inputs,
    set_prompt_section_template,
    set_section_param_filter,
    set_text_block_heading_as_section_name,
    set_text_block_text,
    unindent_params,
    update_param_impl_config,
)
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseSectionWithParamsImplArgsWithCallable,
)
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
    ViewportBounds,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.id import ID
from setta.types.prompt import PromptFormat
from setta.types.section_impls import (
    BaseDictSectionImpl,
    CallableSectionImpl,
    ChatSectionImpl,
    MetaControlSectionImpl,
    PromptSectionImpl,
    SectionSize,
    SectionType,
    TextBlockFormat,
    TextBlockSectionImpl,
)


def build_callable_project_state(
    param_value: str,
) -> tuple[ProjectStateSingleConfig, ID, ID]:
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

    param_impl = CodeParamCodeObjImpl(
        id=param_impl_id,
        value=param_value,
    )
    param_variant = Variant(
        id=param_variant_id,
        impl=param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
    )
    param_core = Core(
        id=param_id,
        name="param",
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
        name="CallableProject",
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
    return project_state, section_id, param_id


class TestAddKwarg:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_add_kwarg_initializes_dict_section_top_level_param(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )

        add_kwarg(self.settings, self.project_state, section_id)

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            BaseDictSectionImpl,
        )
        assert section_impl.topLevelParamId is not None

        top_level_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            section_impl.topLevelParamId,
            NestedParamCodeObjImpl,
        )
        assert isinstance(top_level_impl, NestedParamCodeObjImpl)
        assert len(top_level_impl.children) == 1

        kwarg_id = top_level_impl.children[0]
        kwarg_core = self.project_state.codeObjs[kwarg_id]
        kwarg_variant_id = kwarg_core.defaultVariant
        assert kwarg_variant_id is not None

        kwarg_impl_id = self.project_state.codeObjVariants[kwarg_variant_id].impl
        kwarg_impl = self.project_state.codeObjImpls[kwarg_impl_id]
        assert isinstance(kwarg_impl, CodeParamCodeObjImpl)

        top_level_param_ids = get_curr_top_level_param_ids(
            self.project_state, section_id
        )
        assert top_level_param_ids == [kwarg_id]


class TestDeleteSections:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_delete_sections_cleans_section_variant_map(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        assert section_id in self.project_state.projectConfig.sectionVariantMap

        delete_sections(self.project_state, [section_id])

        assert section_id not in self.project_state.sections
        assert (
            section_id not in self.project_state.projectConfig.sectionVariantMap
        )
        self.project_state.validate_code_file_bindings()


class TestChatSectionChatId:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_set_chat_section_chat_id_updates_impl(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(),
        )
        chat_id = ID("chat-1")

        set_chat_section_chat_id(self.project_state, section_id, chat_id)

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            ChatSectionImpl,
        )
        assert section_impl.chatId == chat_id

    def test_set_chat_section_settings_updates_agent_profile(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Chat,
            Position(),
        )
        agent_profile_id = ID("agent-1")
        engine_config_id = ID("engine-1")

        set_chat_section_settings(
            self.project_state,
            section_id,
            managed=True,
            engineConfigId=engine_config_id,
            agentProfileId=agent_profile_id,
            thinking=True,
        )

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            ChatSectionImpl,
        )
        assert section_impl.managed
        assert section_impl.engineConfigId == engine_config_id
        assert section_impl.agentProfileId == agent_profile_id
        assert section_impl.thinking


class TestPromptSection:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_prompt_section_renders_inputs(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Prompt,
            Position(),
        )

        set_prompt_section_template(
            self.project_state,
            section_id,
            "Hello {{ name }}",
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            PromptSectionImpl,
        )
        assert impl.renderedText == ""
        assert impl.missingVariables == ["name"]
        assert impl.renderError == "Missing variables: name"

        set_prompt_section_inputs(
            self.project_state,
            section_id,
            {"name": "Ada"},
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            PromptSectionImpl,
        )
        assert impl.renderedText == "Hello Ada"
        assert impl.missingVariables == []
        assert impl.renderError is None

    def test_prompt_section_reports_syntax_errors(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Prompt,
            Position(),
        )

        set_prompt_section_template(
            self.project_state,
            section_id,
            "Hello {{ name ",
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            PromptSectionImpl,
        )
        assert impl.renderedText == ""
        assert impl.missingVariables == []
        assert impl.renderError is not None

    def test_prompt_section_format_updates_rendering(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Prompt,
            Position(),
        )

        set_prompt_section_template(
            self.project_state,
            section_id,
            "Hello {{ name }}",
        )
        set_prompt_section_inputs(
            self.project_state,
            section_id,
            {"name": "Ada"},
        )
        set_prompt_section_format(
            self.project_state,
            section_id,
            PromptFormat.Jinja,
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            PromptSectionImpl,
        )
        assert impl.renderedText == "Hello Ada"
        assert impl.missingVariables == []
        assert impl.renderError is None


class TestChangeParamImpl:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_change_param_impl_preserves_kwarg_editability(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )

        add_kwarg(self.settings, self.project_state, section_id)

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            BaseDictSectionImpl,
        )
        assert section_impl.topLevelParamId is not None

        top_level_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            section_impl.topLevelParamId,
            NestedParamCodeObjImpl,
        )
        assert len(top_level_impl.children) == 1
        kwarg_id = top_level_impl.children[0]

        kwarg_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            kwarg_id,
            CodeParamCodeObjImpl,
        )
        assert kwarg_impl.coreNameEditable
        old_core_name_type = kwarg_impl.coreNameType
        old_passing_style = kwarg_impl.passingStyle

        change_param_impl(
            self.settings,
            self.project_state,
            section_id,
            kwarg_id,
            CodeObjType.DropdownParam.name,
        )

        updated_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            kwarg_id,
            DropdownParamCodeObjImpl,
        )
        assert updated_impl.coreNameEditable
        assert updated_impl.coreNameType == old_core_name_type
        assert updated_impl.passingStyle == old_passing_style

class TestAddChildrenOfCallable:
    def test_refetch_preserves_existing_param_value(self) -> None:
        project_state, section_id, param_id = build_callable_project_state(
            "original"
        )
        section_impl = get_curr_effective_section_impl_with_type_guard(
            project_state, section_id, CallableSectionImpl
        )
        callable_id = section_impl.callable
        assert callable_id is not None

        new_param = Core(id=ID("param-new"), name="param")
        new_param_impl = CodeParamCodeObjImpl(
            id=ID("param-new-impl"),
            value="new-default",
        )

        add_children_of_callable(
            project_state,
            section_id,
            callable_id,
            [new_param],
            {new_param.id: new_param_impl},
        )

        callable_impl = get_curr_effective_code_obj_impl_with_type_guard(
            project_state,
            section_id,
            callable_id,
            CodeCallableCodeObjImpl,
        )
        assert callable_impl.children == [param_id]
        assert new_param.id not in project_state.codeObjs

        param_impl = get_curr_effective_code_obj_impl_with_type_guard(
            project_state,
            section_id,
            param_id,
            CodeParamCodeObjImpl,
        )
        assert param_impl.value == "original"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("# Title", "Title"),
        ("## Tasks", "Tasks"),
        ("   ### Notes", "Notes"),
        ("###### Deep", "Deep"),
        ("####### Too deep", None),
        ("#   ", None),
        ("    # Not a heading", None),
        ("Plain text\n# Heading\nMore", "Heading"),
    ],
)
def test_get_first_markdown_heading_matches_heading_rules(
    text: str,
    expected: str | None,
) -> None:
    assert get_first_markdown_heading(text) == expected


class TestDropzoneParamValue:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        self.section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.MetaControl,
            Position(),
            control_code_obj_type=CodeObjType.DropzoneParam,
        )
        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            self.section_id,
            MetaControlSectionImpl,
        )
        self.param_id = section_impl.metaControlParamId
        assert self.param_id is not None
        param_core = self.project_state.codeObjs[self.param_id]
        variant_id = param_core.defaultVariant
        assert variant_id is not None
        impl_id = self.project_state.codeObjVariants[variant_id].impl
        self.dropzone_impl = self.project_state.codeObjImpls[impl_id]
        assert isinstance(self.dropzone_impl, DropzoneParamCodeObjImpl)

    def test_set_param_entered_value_truncates_dropzone_attachments(self) -> None:
        self.dropzone_impl.mode = DropzoneMode.STATEFUL
        self.dropzone_impl.maxAttachments = 1
        payload = {
            "version": 1,
            "attachments": [
                {
                    "kind": "text",
                    "id": "text:first",
                    "name": "Dropped text",
                    "text": "first",
                },
                {
                    "kind": "text",
                    "id": "text:second",
                    "name": "Dropped text",
                    "text": "second",
                },
            ],
        }
        set_param_entered_value(
            self.project_state,
            self.section_id,
            self.param_id,
            json.dumps(payload),
        )
        updated_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_id,
            DropzoneParamCodeObjImpl,
        )
        parsed = parse_dropzone_value(updated_impl.value)
        assert parsed is not None
        assert len(parsed.attachments) == 1
        assert parsed.attachments[0].id == "text:first"

    def test_set_param_entered_value_clears_stateless_dropzone(self) -> None:
        self.dropzone_impl.mode = DropzoneMode.STATELESS
        payload = {
            "version": 1,
            "attachments": [
                {
                    "kind": "text",
                    "id": "text:payload",
                    "name": "Dropped text",
                    "text": "payload",
                }
            ],
        }
        set_param_entered_value(
            self.project_state,
            self.section_id,
            self.param_id,
            json.dumps(payload),
        )
        updated_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_id,
            DropzoneParamCodeObjImpl,
        )
        assert updated_impl.value == ""

    def test_update_param_impl_config_clears_stateless_dropzone_value(self) -> None:
        self.dropzone_impl.mode = DropzoneMode.STATEFUL
        payload = {
            "version": 1,
            "attachments": [
                {
                    "kind": "text",
                    "id": "text:payload",
                    "name": "Dropped text",
                    "text": "payload",
                }
            ],
        }
        set_param_entered_value(
            self.project_state,
            self.section_id,
            self.param_id,
            json.dumps(payload),
        )

        update_param_impl_config(
            self.project_state,
            self.section_id,
            self.param_id,
            {"mode": DropzoneMode.STATELESS},
        )

        updated_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_id,
            DropzoneParamCodeObjImpl,
        )
        assert updated_impl.value == ""

    def test_update_param_impl_config_truncates_dropzone_attachments(self) -> None:
        self.dropzone_impl.mode = DropzoneMode.STATEFUL
        payload = {
            "version": 1,
            "attachments": [
                {
                    "kind": "text",
                    "id": "text:first",
                    "name": "Dropped text",
                    "text": "first",
                },
                {
                    "kind": "text",
                    "id": "text:second",
                    "name": "Dropped text",
                    "text": "second",
                },
            ],
        }
        set_param_entered_value(
            self.project_state,
            self.section_id,
            self.param_id,
            json.dumps(payload),
        )

        update_param_impl_config(
            self.project_state,
            self.section_id,
            self.param_id,
            {"maxAttachments": 1},
        )

        updated_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_id,
            DropzoneParamCodeObjImpl,
        )
        parsed = parse_dropzone_value(updated_impl.value)
        assert parsed is not None
        assert len(parsed.attachments) == 1
        assert parsed.attachments[0].id == "text:first"


class TestDeleteSelectedParams:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_delete_selected_params_removes_children_and_selection(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        param_one = add_kwarg(self.settings, self.project_state, section_id)
        param_two = add_kwarg(self.settings, self.project_state, section_id)

        set_curr_effective_section_impl_value(
            self.project_state,
            section_id,
            BaseSectionWithParamsImplArgsWithCallable(
                pinnedParams=[param_one, param_two],
                selectedParams=[param_one],
            ),
        )

        delete_selected_params(
            self.settings, self.project_state, section_id, [param_one]
        )

        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            BaseDictSectionImpl,
        )
        assert param_one not in section_impl.pinnedParams
        assert param_one not in section_impl.selectedParams
        assert param_two in section_impl.pinnedParams

        top_level_param_id = section_impl.topLevelParamId
        assert top_level_param_id is not None
        top_level_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            top_level_param_id,
            NestedParamCodeObjImpl,
        )
        assert param_one not in top_level_impl.children
        assert param_two in top_level_impl.children


class TestParamMove:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )
        self.section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )
        self.param_ids = [
            add_kwarg(self.settings, self.project_state, self.section_id)
            for _ in range(3)
        ]
        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            self.section_id,
            BaseDictSectionImpl,
        )
        self.root_id = section_impl.topLevelParamId
        assert self.root_id is not None

    def _get_root_impl(self) -> NestedParamCodeObjImpl:
        return get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.root_id,
            NestedParamCodeObjImpl,
        )

    def test_move_params_within_parent_reorders(self) -> None:
        move_params_within_parent(
            self.project_state,
            self.section_id,
            [self.param_ids[0]],
            new_index=2,
        )

        root_impl = self._get_root_impl()
        assert root_impl.children == [
            self.param_ids[1],
            self.param_ids[2],
            self.param_ids[0],
        ]

    def test_param_filter_whitespace_allows_reorder(self) -> None:
        set_section_param_filter(self.project_state, self.section_id, "   ")

        move_params_within_parent(
            self.project_state,
            self.section_id,
            [self.param_ids[0]],
            new_index=2,
        )

        root_impl = self._get_root_impl()
        assert root_impl.children == [
            self.param_ids[1],
            self.param_ids[2],
            self.param_ids[0],
        ]

    def test_indent_converts_previous_sibling(self) -> None:
        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )

        root_impl = self._get_root_impl()
        assert root_impl.children == [self.param_ids[0], self.param_ids[2]]

        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_ids[0],
            NestedParamCodeObjImpl,
        )
        assert parent_impl.children == [self.param_ids[1]]

    def test_indent_non_contiguous_groups(self) -> None:
        extra_param = add_kwarg(self.settings, self.project_state, self.section_id)
        param_ids = [*self.param_ids, extra_param]

        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [param_ids[1], param_ids[3]],
        )

        root_impl = self._get_root_impl()
        assert root_impl.children == [param_ids[0], param_ids[2]]

        first_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[0],
            NestedParamCodeObjImpl,
        )
        assert first_parent_impl.children == [param_ids[1]]

        second_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[2],
            NestedParamCodeObjImpl,
        )
        assert second_parent_impl.children == [param_ids[3]]

    def test_unindent_converts_empty_nested(self) -> None:
        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )
        unindent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )

        root_impl = self._get_root_impl()
        assert root_impl.children == [
            self.param_ids[0],
            self.param_ids[1],
            self.param_ids[2],
        ]

        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_ids[0],
            CodeParamCodeObjImpl,
        )
        assert parent_impl.value == "{}"

    def test_unindent_multi_parent_selection(self) -> None:
        extra_param = add_kwarg(self.settings, self.project_state, self.section_id)
        param_ids = [*self.param_ids, extra_param]

        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [param_ids[1], param_ids[3]],
        )
        unindent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [param_ids[1], param_ids[3]],
        )

        root_impl = self._get_root_impl()
        assert root_impl.children == param_ids

        first_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[0],
            CodeParamCodeObjImpl,
        )
        assert first_parent_impl.value == "{}"

        second_parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            param_ids[2],
            CodeParamCodeObjImpl,
        )
        assert second_parent_impl.value == "{}"

    def test_move_params_to_parent_reparents(self) -> None:
        indent_params(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[1]],
        )

        move_params_to_parent(
            self.settings,
            self.project_state,
            self.section_id,
            [self.param_ids[2]],
            self.param_ids[0],
            new_index=1,
        )

        root_impl = self._get_root_impl()
        assert root_impl.children == [self.param_ids[0]]

        parent_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            self.section_id,
            self.param_ids[0],
            NestedParamCodeObjImpl,
        )
        assert parent_impl.children == [self.param_ids[1], self.param_ids[2]]


class TestSmartLayout:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_smart_layout_places_inside_viewport(self) -> None:
        viewport_bounds = ViewportBounds(x=0, y=0, w=300, h=240)
        overrides = {"size": SectionSize(width=100, height=80)}

        position, pan_to = compute_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            overrides,
            None,
            viewport_bounds,
        )

        assert position.x == pytest.approx(24.0)
        assert position.y == pytest.approx(24.0)
        assert pan_to is None

    def test_smart_layout_positions_right_and_pans_when_viewport_too_narrow(
        self,
    ) -> None:
        viewport_bounds = ViewportBounds(x=0, y=0, w=100, h=240)
        overrides = {"size": SectionSize(width=160, height=100)}

        position, pan_to = compute_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            overrides,
            None,
            viewport_bounds,
        )

        assert position.x == pytest.approx(124.0)
        assert position.y == pytest.approx(24.0)
        assert pan_to is not None
        assert pan_to.x == pytest.approx(position.x + 80.0)
        assert pan_to.y == pytest.approx(position.y + 50.0)
    def test_smart_layout_uses_layout_snapshot_for_collisions(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        existing_layout = self.project_state.projectConfig.topLevelSections[section_id]
        existing_layout.w = 200
        existing_layout.h = 200
        viewport_bounds = ViewportBounds(x=0, y=0, w=148, h=148)
        overrides = {"size": SectionSize(width=100, height=100)}
        layout_snapshot = {
            section_id: TopLevelSectionLayout(x=300, y=0, w=200, h=200)
        }
        apply_top_level_section_layout_snapshot(self.project_state, layout_snapshot)

        position, pan_to = compute_smart_top_level_section_position(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            overrides,
            None,
            viewport_bounds,
        )

        assert position.x == pytest.approx(24.0)
        assert position.y == pytest.approx(24.0)
        assert pan_to is None


class TestTextBlockHeadingAsName:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_invalid_heading_does_not_block_text_update(self) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            Position(),
        )
        self.project_state.validate_parent_section_map()
        original_name = self.project_state.sections[section_id].name
        set_text_block_heading_as_section_name(
            self.project_state,
            section_id,
            True,
        )
        text = "# Intro @ 2026\n\nBody content."
        set_text_block_text(self.project_state, section_id, text)
        section_impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            TextBlockSectionImpl,
        )
        assert section_impl.text == text
        assert self.project_state.sections[section_id].name == original_name


class TestTextBlockDefaults:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.settings = SettingsState()
        self.project_state = ProjectStateSingleConfig(
            projectConfig=ProjectConfig(name="test-project")
        )

    def test_markdown_respects_heading_as_section_name_default_false(self) -> None:
        self.settings.textBlockSectionDefault.headingAsSectionName = False
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            Position(),
            {"format": TextBlockFormat.Markdown},
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            TextBlockSectionImpl,
        )
        assert not impl.headingAsSectionName

    def test_markdown_respects_heading_as_section_name_default_true(self) -> None:
        self.settings.textBlockSectionDefault.headingAsSectionName = True
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.TextBlock,
            Position(),
            {"format": TextBlockFormat.Markdown},
        )
        impl = get_curr_effective_section_impl_with_type_guard(
            self.project_state,
            section_id,
            TextBlockSectionImpl,
        )
        assert impl.headingAsSectionName

