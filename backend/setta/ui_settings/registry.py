import inspect
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

from setta.agentic.store import (
    list_prompt_templates,
    load_agent_profiles,
    load_external_agent_configs,
)
from setta.app.spec_store import default_app_spec_path
from setta.mcp.ui_settings_context import resolve_project_manager_from_ctx
from setta.project_state.project_manager_types import (
    GetAppDefinitionRequest,
    SetShowParamDisplayNamesRequest,
    SetWatchCodeEnabledRequest,
    SetWatchCodeInputsRequest,
)
from setta.types.app_definition import AppDefinition
from setta.types.chat_messages import JSONValue
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenLanguage,
    WatchCodeFolder,
    project_config_has_codegen_language,
)
from setta.ui_settings.errors import UISettingExpectedOldValueMismatchError
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingHighlight,
    UISettingLocation,
    UISettingMutationResult,
    UISettingRevealActivationStep,
    UISettingRuntimeEntry,
    UISettingValueSchema,
)

if TYPE_CHECKING:
    from mcp.server.fastmcp.server import Context

UISettingSourceFilter = Literal["core", "plugin", "all"]
_REQUIRED_CORE_REVEAL_ACTIVATION_STEP_BY_SETTING_ID: dict[str, tuple[str, str]] = {
    "core.project_ai_settings.llm_api_keys": (
        "project_ai_settings_accordion_item",
        "project-ai-settings-llm-api-keys",
    ),
    "core.project_ai_settings.agent_profiles": (
        "project_ai_settings_accordion_item",
        "project-ai-settings-agent-profiles",
    ),
    "core.project_ai_settings.prompt_templates": (
        "project_ai_settings_accordion_item",
        "project-ai-settings-prompt-templates",
    ),
    "core.project_ai_settings.external_agents": (
        "project_ai_settings_accordion_item",
        "project-ai-settings-external-agents",
    ),
    "core.run_instructions.python_codegen_enabled": (
        "run_instructions_accordion_item",
        "run-instructions-codegen-targets",
    ),
}


class UISettingValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(slots=True)
class UISettingRegistry:
    entriesById: dict[str, UISettingRuntimeEntry]

    def get(self, setting_id: str) -> UISettingRuntimeEntry | None:
        return self.entriesById.get(setting_id)

    def list_entries(
        self, *, source_filter: UISettingSourceFilter
    ) -> list[UISettingEntry]:
        if source_filter == "all":
            return [entry.metadata for entry in self.entriesById.values()]
        return [
            entry.metadata
            for entry in self.entriesById.values()
            if entry.metadata.source == source_filter
        ]

    def search(
        self,
        *,
        query: str,
        limit: int,
        source_filter: UISettingSourceFilter,
    ) -> list[UISettingEntry]:
        normalized_query = query.strip().lower()
        if normalized_query == "":
            raise ValueError("query must not be empty")

        tokens = [token for token in normalized_query.split() if token]
        limit_value = limit if limit > 0 else len(self.entriesById)

        scored: list[tuple[int, UISettingEntry]] = []
        for entry in self.list_entries(source_filter=source_filter):
            score = _score_setting_entry(entry, normalized_query, tokens)
            if score <= 0:
                continue
            scored.append((score, entry))

        scored.sort(key=lambda item: (-item[0], item[1].settingId))
        return [entry for _, entry in scored[:limit_value]]


def build_ui_settings_registry(
    *,
    ctx: "Context",
    project_config_id: ID,  # noqa: ARG001 - legacy Python registry is core-only
) -> UISettingRegistry:
    entries_by_id: dict[str, UISettingRuntimeEntry] = {}
    for entry in _build_core_entries():
        setting_id = entry.metadata.settingId
        if setting_id in entries_by_id:
            raise ValueError(f"Duplicate core UI setting id: {setting_id}")
        entries_by_id[setting_id] = entry
    for entry in entries_by_id.values():
        _validate_runtime_entry_write_signature(entry)
    return UISettingRegistry(entriesById=entries_by_id)


def _validate_runtime_entry_write_signature(entry: UISettingRuntimeEntry) -> None:
    if entry.metadata.mutability == "readOnly":
        if entry.writeValue is None:
            return
        raise ValueError(
            f"Read-only UI setting {entry.metadata.settingId} must not define writeValue."
        )
    if entry.writeValue is None:
        raise ValueError(
            f"Writable UI setting {entry.metadata.settingId} is missing writeValue."
        )
    try:
        signature = inspect.signature(entry.writeValue)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"Writable UI setting {entry.metadata.settingId} has invalid writeValue."
        ) from exc
    if "expected_old_value" in signature.parameters:
        return
    raise ValueError(
        (
            f"Writable UI setting {entry.metadata.settingId} writeValue must accept "
            "expected_old_value."
        )
    )


def validate_ui_setting_value(
    schema: UISettingValueSchema,
    value: JSONValue,
) -> JSONValue:
    return _validate_ui_setting_value_at_path(
        schema=schema,
        value=value,
        json_path="$",
    )


def _validate_ui_setting_value_at_path(
    *,
    schema: UISettingValueSchema,
    value: JSONValue,
    json_path: str,
) -> JSONValue:
    expected_type = schema.type
    normalized: JSONValue
    if expected_type == "boolean":
        if not isinstance(value, bool):
            raise UISettingValidationError(
                "invalid_value_type",
                f"Expected a boolean value at {json_path}.",
            )
        normalized = value
    elif expected_type == "string":
        if not isinstance(value, str):
            raise UISettingValidationError(
                "invalid_value_type",
                f"Expected a string value at {json_path}.",
            )
        if schema.minLength is not None and len(value) < schema.minLength:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                (
                    f"String value at {json_path} must be at least "
                    f"{schema.minLength} characters."
                ),
            )
        if schema.maxLength is not None and len(value) > schema.maxLength:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                (
                    f"String value at {json_path} must be at most "
                    f"{schema.maxLength} characters."
                ),
            )
        normalized = value
    elif expected_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise UISettingValidationError(
                "invalid_value_type",
                f"Expected a numeric value at {json_path}.",
            )
        normalized_float = float(value)
        if schema.minimum is not None and normalized_float < schema.minimum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                (
                    f"Value at {json_path} must be greater than or equal to "
                    f"{schema.minimum}."
                ),
            )
        if schema.maximum is not None and normalized_float > schema.maximum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                (
                    f"Value at {json_path} must be less than or equal to "
                    f"{schema.maximum}."
                ),
            )
        normalized = normalized_float
    elif expected_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise UISettingValidationError(
                "invalid_value_type",
                f"Expected an integer value at {json_path}.",
            )
        normalized_int = int(value)
        if schema.minimum is not None and normalized_int < schema.minimum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                (
                    f"Value at {json_path} must be greater than or equal to "
                    f"{schema.minimum}."
                ),
            )
        if schema.maximum is not None and normalized_int > schema.maximum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                (
                    f"Value at {json_path} must be less than or equal to "
                    f"{schema.maximum}."
                ),
            )
        normalized = normalized_int
    elif expected_type == "array":
        if not isinstance(value, list):
            raise UISettingValidationError(
                "invalid_value_type",
                f"Expected an array value at {json_path}.",
            )
        normalized_items: list[JSONValue] = []
        if schema.items is None:
            normalized_items = list(value)
        else:
            for index, item in enumerate(value):
                normalized_items.append(
                    _validate_ui_setting_value_at_path(
                        schema=schema.items,
                        value=item,
                        json_path=f"{json_path}[{index}]",
                    )
                )
        normalized = normalized_items
    elif expected_type == "object":
        if not isinstance(value, dict):
            raise UISettingValidationError(
                "invalid_value_type",
                f"Expected an object value at {json_path}.",
            )
        normalized_object: dict[str, JSONValue] = {}
        for key, object_value in value.items():
            if not isinstance(key, str):
                raise UISettingValidationError(
                    "invalid_value_type",
                    f"Expected object keys to be strings at {json_path}.",
                )
            normalized_object[key] = object_value
        required_properties = schema.requiredProperties or []
        for required_property in required_properties:
            if required_property in normalized_object:
                continue
            raise UISettingValidationError(
                "invalid_value_type",
                (
                    f"Object value at {json_path} is missing required property "
                    f"{required_property}."
                ),
            )
        properties = schema.properties or {}
        for property_name, property_schema in properties.items():
            if property_name not in normalized_object:
                continue
            normalized_object[property_name] = _validate_ui_setting_value_at_path(
                schema=property_schema,
                value=normalized_object[property_name],
                json_path=f"{json_path}.{property_name}",
            )
        if schema.additionalProperties is False:
            unsupported_properties = sorted(
                property_name
                for property_name in normalized_object
                if property_name not in properties
            )
            if unsupported_properties:
                unsupported_text = ", ".join(unsupported_properties)
                raise UISettingValidationError(
                    "invalid_value_type",
                    (
                        f"Object value at {json_path} contains unsupported "
                        f"properties: {unsupported_text}."
                    ),
                )
        normalized = normalized_object
    else:
        raise UISettingValidationError(
            "invalid_value_type",
            f"Unsupported value schema type: {expected_type}",
        )

    if schema.enumValues is not None and normalized not in schema.enumValues:
        raise UISettingValidationError(
            "invalid_value_range_or_enum",
            f"Value at {json_path} is not in the allowed enum set.",
        )
    return normalized


def _score_setting_entry(
    entry: UISettingEntry,
    normalized_query: str,
    tokens: list[str],
) -> int:
    score = 0
    setting_id = entry.settingId.lower()
    title = entry.title.lower()
    description = entry.description.lower()
    synonyms = [syn.lower() for syn in entry.synonyms]

    if normalized_query == setting_id:
        score += 180
    if normalized_query in title:
        score += 120
    if normalized_query in description:
        score += 30
    for synonym in synonyms:
        if normalized_query == synonym:
            score += 90
        elif normalized_query in synonym:
            score += 35

    for token in tokens:
        if token in setting_id:
            score += 40
        if token in title:
            score += 28
        if token in description:
            score += 14
        for synonym in synonyms:
            if token in synonym:
                score += 18
    return score


_WATCH_CODE_FOLDER_ITEM_VALUE_SCHEMA = UISettingValueSchema(
    type="object",
    properties={
        "path": UISettingValueSchema(type="string"),
        "recursive": UISettingValueSchema(type="boolean"),
    },
    requiredProperties=["path"],
    additionalProperties=False,
)
_WATCH_CODE_FOLDERS_VALUE_SCHEMA = UISettingValueSchema(
    type="array",
    items=_WATCH_CODE_FOLDER_ITEM_VALUE_SCHEMA,
)
_WATCH_CODE_FILES_VALUE_SCHEMA = UISettingValueSchema(
    type="array",
    items=UISettingValueSchema(type="string"),
)


def _build_core_entries() -> list[UISettingRuntimeEntry]:
    entries = [
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.watch_code.enabled",
                title="Watch Code Enabled",
                synonyms=["watch code", "watch mode", "watch toggle"],
                description="Enable or disable watch code mode for the project.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="Overview",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.watch_code.enabled",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(type="boolean"),
            ),
            readValue=_read_watch_code_enabled,
            writeValue=_write_watch_code_enabled,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.watch_code.folders",
                title="Watch Code Folders",
                synonyms=["watch folders", "watch code folders"],
                description="List of folders watched by watch code mode.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="Overview",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.watch_code.folders",
                ),
                source="core",
                mutability="writable",
                valueSchema=_WATCH_CODE_FOLDERS_VALUE_SCHEMA,
            ),
            readValue=_read_watch_code_folders,
            writeValue=_write_watch_code_folders,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.watch_code.files",
                title="Watch Code Files",
                synonyms=["watch files", "watch code files"],
                description="List of explicit files watched by watch code mode.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="Overview",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.watch_code.files",
                ),
                source="core",
                mutability="writable",
                valueSchema=_WATCH_CODE_FILES_VALUE_SCHEMA,
            ),
            readValue=_read_watch_code_files,
            writeValue=_write_watch_code_files,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.project.name",
                title="Project Name",
                synonyms=["project title", "config name"],
                description="Name of the active project configuration.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="Overview",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.project.name",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(type="string", minLength=1),
            ),
            readValue=_read_project_name,
            writeValue=_write_project_name,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.project_ai_settings.llm_api_keys",
                title="Project AI LLM API Keys",
                synonyms=[
                    "project ai settings llm keys",
                    "project ai llm api keys",
                    "llm api keys",
                ],
                description="Count of configured API keys used by Project AI settings.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="ProjectAISettings",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.project_ai_settings.llm_api_keys",
                ),
                source="core",
                mutability="readOnly",
                valueSchema=UISettingValueSchema(type="integer", minimum=0),
                revealActivationSteps=[
                    UISettingRevealActivationStep(
                        type="project_ai_settings_accordion_item",
                        itemValue="project-ai-settings-llm-api-keys",
                    )
                ],
            ),
            readValue=_read_project_ai_llm_api_keys_count,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.project_ai_settings.agent_profiles",
                title="Project AI Agent Profiles",
                synonyms=[
                    "project ai agent profiles",
                    "agent profiles",
                    "project ai profiles",
                ],
                description="Count of agent profiles available to Project AI settings.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="ProjectAISettings",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.project_ai_settings.agent_profiles",
                ),
                source="core",
                mutability="readOnly",
                valueSchema=UISettingValueSchema(type="integer", minimum=0),
                revealActivationSteps=[
                    UISettingRevealActivationStep(
                        type="project_ai_settings_accordion_item",
                        itemValue="project-ai-settings-agent-profiles",
                    )
                ],
            ),
            readValue=_read_project_ai_agent_profiles_count,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.project_ai_settings.prompt_templates",
                title="Project AI Prompt Templates",
                synonyms=[
                    "project ai prompt templates",
                    "prompt templates",
                    "project ai prompts",
                ],
                description="Count of prompt templates available to Project AI settings.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="ProjectAISettings",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.project_ai_settings.prompt_templates",
                ),
                source="core",
                mutability="readOnly",
                valueSchema=UISettingValueSchema(type="integer", minimum=0),
                revealActivationSteps=[
                    UISettingRevealActivationStep(
                        type="project_ai_settings_accordion_item",
                        itemValue="project-ai-settings-prompt-templates",
                    )
                ],
            ),
            readValue=_read_project_ai_prompt_templates_count,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.project_ai_settings.external_agents",
                title="Project AI External Agents",
                synonyms=[
                    "project ai external agents",
                    "external agent configs",
                    "external agents",
                ],
                description="Count of external agent configs available to Project AI settings.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="ProjectAISettings",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.project_ai_settings.external_agents",
                ),
                source="core",
                mutability="readOnly",
                valueSchema=UISettingValueSchema(type="integer", minimum=0),
                revealActivationSteps=[
                    UISettingRevealActivationStep(
                        type="project_ai_settings_accordion_item",
                        itemValue="project-ai-settings-external-agents",
                    )
                ],
            ),
            readValue=_read_project_ai_external_agents_count,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.run_instructions.python_codegen_enabled",
                title="Python Codegen Enabled",
                synonyms=[
                    "python codegen",
                    "codegen toggle",
                    "run instructions python",
                ],
                description="Enable or disable the Python codegen target for this project.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="RunInstructions",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.run_instructions.python_codegen_enabled",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(type="boolean"),
                revealActivationSteps=[
                    UISettingRevealActivationStep(
                        type="run_instructions_accordion_item",
                        itemValue="run-instructions-codegen-targets",
                    )
                ],
            ),
            readValue=_read_python_codegen_enabled,
            writeValue=_write_python_codegen_enabled,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.project.show_param_display_names",
                title="Show Param Display Names",
                synonyms=["display names", "parameter display names", "param names"],
                description="Toggle display names for parameters in the right pane.",
                location=UISettingLocation(
                    side="right",
                    uiEditorTabName="QuickInfoConfig",
                    requiresSectionSelection=True,
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.project.show_param_display_names",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(type="boolean"),
            ),
            readValue=_read_show_param_display_names,
            writeValue=_write_show_param_display_names,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.app.catalog_id",
                title="App Catalog ID",
                synonyms=["app catalog", "catalog id"],
                description="Catalog id for the app definition.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="App",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.app.catalog_id",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(type="string", minLength=1),
            ),
            readValue=_read_app_catalog_id,
            writeValue=_write_app_catalog_id,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.app.spec_version",
                title="App Spec Version",
                synonyms=["app version", "spec version"],
                description="Version marker for the app definition schema payload.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="App",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.app.spec_version",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(type="string", minLength=1),
            ),
            readValue=_read_app_spec_version,
            writeValue=_write_app_spec_version,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.app.spec_path",
                title="App Spec Path",
                synonyms=["app path", "spec path"],
                description="Filesystem path where app spec JSON is saved.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="App",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.app.spec_path",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(type="string", minLength=1),
            ),
            readValue=_read_app_spec_path,
            writeValue=_write_app_spec_path,
        ),
        UISettingRuntimeEntry(
            metadata=UISettingEntry(
                settingId="core.app.theme_mode",
                title="App Theme Mode",
                synonyms=["theme mode", "app theme", "light mode", "dark mode"],
                description="Theme mode for the app definition.",
                location=UISettingLocation(
                    side="left",
                    overviewTabKey="App",
                ),
                highlight=UISettingHighlight(
                    strategy="dom_anchor",
                    anchorId="core.app.theme_mode",
                ),
                source="core",
                mutability="writable",
                valueSchema=UISettingValueSchema(
                    type="string",
                    enumValues=["auto", "dark", "light"],
                ),
            ),
            readValue=_read_app_theme_mode,
            writeValue=_write_app_theme_mode,
        ),
    ]
    _validate_core_reveal_activation_steps(entries)
    return entries


def _validate_core_reveal_activation_steps(
    entries: list[UISettingRuntimeEntry],
) -> None:
    entries_by_setting_id = {
        entry.metadata.settingId: entry
        for entry in entries
        if entry.metadata.source == "core"
    }
    for setting_id, (
        expected_step_type,
        expected_item_value,
    ) in _REQUIRED_CORE_REVEAL_ACTIVATION_STEP_BY_SETTING_ID.items():
        if setting_id not in entries_by_setting_id:
            raise ValueError(f"Missing core UI setting metadata for {setting_id}.")
        entry = entries_by_setting_id[setting_id]
        has_expected_step = any(
            step.type == expected_step_type and step.itemValue == expected_item_value
            for step in entry.metadata.revealActivationSteps
        )
        if has_expected_step:
            continue
        raise ValueError(
            (
                "Missing required revealActivationSteps metadata for "
                f"{setting_id}: expected ({expected_step_type}, {expected_item_value})."
            )
        )


def _get_project_manager(ctx: "Context", project_config_id: ID):
    return resolve_project_manager_from_ctx(
        ctx=ctx,
        project_config_id=project_config_id,
    )


def _read_watch_code_enabled(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return project_state.projectConfig.watchCodeEnabled


async def _write_watch_code_enabled(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if not isinstance(value, bool):
        raise UISettingValidationError(
            "invalid_value_type", "Expected a boolean value."
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_watch_code_enabled(
            SetWatchCodeEnabledRequest(
                projectConfigId=project_config_id,
                enabled=value,
            ),
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, bool) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


def _watch_code_folders_to_json(
    folders: list[WatchCodeFolder],
) -> list[dict[str, JSONValue]]:
    return [
        {
            "path": folder.path,
            "recursive": folder.recursive,
        }
        for folder in folders
    ]


def _read_watch_code_folders(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return _watch_code_folders_to_json(project_state.projectConfig.watchCodeFolders)


def _read_watch_code_files(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return list(project_state.projectConfig.watchCodeFiles)


async def _write_watch_code_folders(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    normalized_value = validate_ui_setting_value(
        _WATCH_CODE_FOLDERS_VALUE_SCHEMA, value
    )
    if not isinstance(normalized_value, list):
        raise UISettingValidationError("invalid_value_type", "Expected an array value.")
    try:
        folders = [WatchCodeFolder.model_validate(entry) for entry in normalized_value]
    except Exception as exc:
        raise UISettingValidationError(
            "invalid_value_type",
            f"Invalid watch-code folder entry: {exc}",
        ) from exc
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_watch_code_folders(
            SetWatchCodeInputsRequest(
                projectConfigId=project_config_id,
                watchCodeFolders=folders,
                watchCodeFiles=[],
            ),
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, list) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=normalized_value,
        changed=old_value != new_value,
    )


async def _write_watch_code_files(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    normalized_value = validate_ui_setting_value(_WATCH_CODE_FILES_VALUE_SCHEMA, value)
    if not isinstance(normalized_value, list):
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected an array of strings.",
        )
    normalized_files = [entry for entry in normalized_value if isinstance(entry, str)]
    if len(normalized_files) != len(normalized_value):
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected an array of strings.",
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_watch_code_files(
            SetWatchCodeInputsRequest(
                projectConfigId=project_config_id,
                watchCodeFolders=[],
                watchCodeFiles=normalized_files,
            ),
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, list) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=normalized_files,
        changed=old_value != new_value,
    )


def _read_show_param_display_names(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return project_state.projectConfig.showParamDisplayNames


def _read_project_ai_llm_api_keys_count(
    ctx: "Context",
    project_config_id: ID,  # noqa: ARG001 - project scoped tool; value is global
) -> JSONValue:
    agent_runner = getattr(ctx.fastmcp.state, "agent_runner", None)
    if agent_runner is None:
        return 0
    api_keys = getattr(agent_runner, "api_keys", None)
    if not isinstance(api_keys, dict):
        return 0
    return len(api_keys)


def _read_project_ai_agent_profiles_count(
    ctx: "Context",
    project_config_id: ID,  # noqa: ARG001 - project scoped tool; value is global
) -> JSONValue:
    dbe = getattr(ctx.fastmcp.state, "dbe", None)
    if dbe is None:
        return 0
    return len(load_agent_profiles(dbe))


def _read_project_ai_prompt_templates_count(
    ctx: "Context",
    project_config_id: ID,  # noqa: ARG001 - project scoped tool; value is global
) -> JSONValue:
    dbe = getattr(ctx.fastmcp.state, "dbe", None)
    if dbe is None:
        return 0
    return len(list_prompt_templates(dbe))


def _read_project_ai_external_agents_count(
    ctx: "Context",
    project_config_id: ID,  # noqa: ARG001 - project scoped tool; value is global
) -> JSONValue:
    dbe = getattr(ctx.fastmcp.state, "dbe", None)
    if dbe is None:
        return 0
    return len(load_external_agent_configs(dbe))


def _read_project_name(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return project_state.projectConfig.name


async def _write_project_name(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if not isinstance(value, str):
        raise UISettingValidationError("invalid_value_type", "Expected a string value.")
    normalized_name = value.strip()
    if normalized_name == "":
        raise UISettingValidationError(
            "invalid_value_range_or_enum",
            "Project name must not be empty.",
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_project_config_name(
            project_config_id,
            normalized_name,
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, str) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=normalized_name,
        changed=old_value != new_value,
    )


def _read_python_codegen_enabled(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return project_config_has_codegen_language(
        project_state.projectConfig,
        ProjectCodegenLanguage.python,
    )


async def _write_python_codegen_enabled(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if not isinstance(value, bool):
        raise UISettingValidationError(
            "invalid_value_type", "Expected a boolean value."
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_python_codegen_enabled(
            project_config_id,
            value,
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, bool) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


async def _write_show_param_display_names(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if not isinstance(value, bool):
        raise UISettingValidationError(
            "invalid_value_type", "Expected a boolean value."
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_show_param_display_names(
            SetShowParamDisplayNamesRequest(
                projectConfigId=project_config_id,
                showParamDisplayNames=value,
            ),
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, bool) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


async def _get_app_definition(ctx: "Context", project_config_id: ID) -> AppDefinition:
    manager = _get_project_manager(ctx, project_config_id)
    current = await manager.get_app_definition(GetAppDefinitionRequest())
    return current.appDefinition or AppDefinition()


async def _read_app_catalog_id(ctx: "Context", project_config_id: ID) -> JSONValue:
    definition = await _get_app_definition(ctx, project_config_id)
    return definition.catalogId


async def _write_app_catalog_id(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if not isinstance(value, str) or value.strip() == "":
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected a non-empty string value.",
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_app_definition_catalog_id(
            catalog_id=value.strip(),
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, str) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


async def _read_app_spec_version(ctx: "Context", project_config_id: ID) -> JSONValue:
    definition = await _get_app_definition(ctx, project_config_id)
    return definition.appSpecVersion


async def _write_app_spec_version(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if not isinstance(value, str) or value.strip() == "":
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected a non-empty string value.",
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        (
            old_value,
            new_value,
        ) = await manager.compare_and_set_app_definition_spec_version(
            app_spec_version=value.strip(),
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, str) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


async def _read_app_spec_path(ctx: "Context", project_config_id: ID) -> JSONValue:
    definition = await _get_app_definition(ctx, project_config_id)
    if isinstance(definition.appSpecPath, str) and definition.appSpecPath.strip() != "":
        return definition.appSpecPath
    return default_app_spec_path()


async def _write_app_spec_path(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if not isinstance(value, str) or value.strip() == "":
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected a non-empty string value.",
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_app_definition_spec_path(
            app_spec_path=value.strip(),
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, str) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


async def _read_app_theme_mode(ctx: "Context", project_config_id: ID) -> JSONValue:
    definition = await _get_app_definition(ctx, project_config_id)
    theme = definition.theme
    if isinstance(theme, dict):
        mode = theme.get("mode")
        if mode in {"auto", "dark", "light"}:
            return mode
    return "auto"


async def _write_app_theme_mode(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
    expected_old_value: JSONValue | None = None,
) -> UISettingMutationResult:
    if value not in {"auto", "dark", "light"}:
        raise UISettingValidationError(
            "invalid_value_range_or_enum",
            "Theme mode must be one of: auto, dark, light.",
        )
    manager = _get_project_manager(ctx, project_config_id)
    try:
        old_value, new_value = await manager.compare_and_set_app_definition_theme_mode(
            theme_mode=value,
            expected_old_value=(
                expected_old_value if isinstance(expected_old_value, str) else None
            ),
        )
    except UISettingExpectedOldValueMismatchError as exc:
        raise UISettingValidationError("mutation_failed", str(exc)) from exc
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )
