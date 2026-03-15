import json
import logging

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
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.dropzone import parse_dropzone_value
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl_with_type_guard,
    get_curr_effective_section_impl_with_type_guard,
)
from setta.types.helpers_lvl2 import (
    add_children_of_callable,
    add_kwarg,
    change_param_impl,
    get_curr_top_level_param_ids,
    get_first_markdown_heading,
    set_chat_section_chat_id,
    set_param_entered_value,
    update_param_impl_config,
)
from setta.types.id import ID
from setta.types.project_config import (
    Position,
    ProjectConfig,
    TopLevelSectionLayout,
)
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseDictSectionImpl,
    CallableSectionImpl,
    ChatSectionImpl,
    MetaControlSectionImpl,
    SectionType,
    TextBlockFormat,
    TextBlockSectionImpl,
)
from tests.helpers.project_state_sections import create_top_level_section


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

    def test_add_kwarg_does_not_emit_info_logs(self, caplog) -> None:
        section_id = create_top_level_section(
            self.settings,
            self.project_state,
            SectionType.Dict,
            Position(),
        )

        with caplog.at_level(logging.INFO, logger="setta.types.helpers_lvl2"):
            add_kwarg(self.settings, self.project_state, section_id)

        info_records = [
            record
            for record in caplog.records
            if record.name == "setta.types.helpers_lvl2"
            and record.levelno == logging.INFO
        ]
        assert info_records == []

    def test_add_kwarg_updates_shown_param_ids(self) -> None:
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
        kwarg_id = top_level_impl.children[0]

        self.project_state.validate_shown_param_ids()

        variant_id = self.project_state.projectConfig.sectionVariantMap[section_id]
        shown = self.project_state.shownParamIds[variant_id]
        assert shown.pinned.topLevelParamIds == []
        assert shown.unpinned.topLevelParamIds == [kwarg_id]
        assert shown.unpinned.requiredParamIdsToPaths[kwarg_id] == (kwarg_id,)


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
        update_param_impl_config(
            self.project_state,
            section_id,
            kwarg_id,
            {"typeAnnotation": "str"},
        )
        kwarg_impl = get_curr_effective_code_obj_impl_with_type_guard(
            self.project_state,
            section_id,
            kwarg_id,
            CodeParamCodeObjImpl,
        )
        old_core_name_type = kwarg_impl.coreNameType
        old_passing_style = kwarg_impl.passingStyle
        old_type_annotation = kwarg_impl.typeAnnotation

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
        assert updated_impl.typeAnnotation == old_type_annotation


class TestAddChildrenOfCallable:
    def test_refetch_preserves_existing_param_value(self) -> None:
        project_state, section_id, param_id = build_callable_project_state("original")
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
