import inspect
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal
from urllib.parse import quote

from setta.agentic.store import (
    list_prompt_templates,
    load_agent_profiles,
    load_external_agent_configs,
)
from setta.app.spec_store import default_app_spec_path
from setta.mcp.ui_settings_context import resolve_project_manager_from_ctx
from setta.plugins.errors import PluginManagerError
from setta.plugins.models import (
    PluginListEntry,
    PluginRegisteredUISetting,
    PluginRuntimeResponse,
)
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
PLUGIN_SETTING_ID_PREFIX = "plugin::"
PLUGIN_UI_SETTINGS_SCHEMA_KEY = "x-setta-ui-settings"
PLUGIN_RUNTIME_OPERATIONAL_STATES = frozenset({"active", "pending_restart"})
_JS_ENCODE_URI_COMPONENT_SAFE_CHARS = "-_.!~*'()"
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
logger = logging.getLogger(__name__)


class PluginUISettingErrorsByPluginId(dict[str, str]):
    def __init__(self) -> None:
        super().__init__()
        self.by_plugin_and_local_setting_id: dict[tuple[str, str], str] = {}


class UISettingValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class _PluginUISettingDefinition:
    localSettingId: str
    title: str
    description: str
    synonyms: list[str]
    paneId: str
    revealKey: str
    configPath: list[str]
    mutability: Literal["readOnly", "writable"]
    valueSchema: UISettingValueSchema
    defaultValue: JSONValue


@dataclass(frozen=True, slots=True)
class _PluginUISettingContribution:
    source: Literal["schema", "backend"]
    localSettingId: str
    definition: _PluginUISettingDefinition | None = None
    registration: PluginRegisteredUISetting | None = None


@dataclass(frozen=True, slots=True)
class PluginRuntimeAvailability:
    pluginEntry: PluginListEntry | None
    observedStates: tuple[str, ...]
    hasOperationalState: bool


def build_plugin_setting_id(*, plugin_id: str, local_setting_id: str) -> str:
    return f"{PLUGIN_SETTING_ID_PREFIX}{plugin_id}::{local_setting_id}"


def parse_plugin_setting_id(setting_id: str) -> tuple[str, str] | None:
    if not setting_id.startswith(PLUGIN_SETTING_ID_PREFIX):
        return None
    remainder = setting_id[len(PLUGIN_SETTING_ID_PREFIX) :]
    if remainder == "":
        return None
    parts = remainder.split("::", maxsplit=1)
    if len(parts) != 2:
        return None
    plugin_id, local_setting_id = parts
    if plugin_id == "" or local_setting_id == "":
        return None
    return plugin_id, local_setting_id


def is_plugin_runtime_operational_state(*, state: str) -> bool:
    return state in PLUGIN_RUNTIME_OPERATIONAL_STATES


def describe_plugin_runtime_states(*, observed_states: tuple[str, ...]) -> str | None:
    if len(observed_states) == 0:
        return None
    if len(observed_states) == 1:
        return observed_states[0]
    return ",".join(observed_states)


def resolve_plugin_runtime_availability(
    *,
    runtime_response: PluginRuntimeResponse,
    plugin_id: str,
) -> PluginRuntimeAvailability:
    observed_states_set: set[str] = set()
    for status_entry in runtime_response.status.plugins:
        if status_entry.pluginId != plugin_id:
            continue
        observed_states_set.add(status_entry.state.value)
    observed_states = tuple(sorted(observed_states_set))

    plugin_entry: PluginListEntry | None = None
    for candidate in runtime_response.list.plugins:
        if candidate.pluginId == plugin_id:
            plugin_entry = candidate
            break

    return PluginRuntimeAvailability(
        pluginEntry=plugin_entry,
        observedStates=observed_states,
        hasOperationalState=any(
            is_plugin_runtime_operational_state(state=state)
            for state in observed_states
        ),
    )


@dataclass(slots=True)
class UISettingRegistry:
    entriesById: dict[str, UISettingRuntimeEntry]
    pluginErrorsByPluginId: dict[str, str]
    pluginErrorsByPluginAndLocalSettingId: dict[tuple[str, str], str]
    knownPluginIds: set[str]
    knownPluginAndLocalSettingIds: set[tuple[str, str]]

    def get(self, setting_id: str) -> UISettingRuntimeEntry | None:
        return self.entriesById.get(setting_id)

    def has_known_plugin(self, plugin_id: str) -> bool:
        return plugin_id in self.knownPluginIds

    def has_known_plugin_setting(self, plugin_id: str, local_setting_id: str) -> bool:
        return (plugin_id, local_setting_id) in self.knownPluginAndLocalSettingIds

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
    project_config_id: ID,  # noqa: ARG001 - reserved for plugin contributions
) -> UISettingRegistry:
    entries_by_id: dict[str, UISettingRuntimeEntry] = {}
    for entry in _build_core_entries():
        setting_id = entry.metadata.settingId
        if setting_id in entries_by_id:
            raise ValueError(f"Duplicate core UI setting id: {setting_id}")
        entries_by_id[setting_id] = entry
    plugin_entries, plugin_errors = _build_plugin_entries(
        ctx=ctx,
        project_config_id=project_config_id,
    )
    plugin_errors_by_plugin_and_local_setting_id = getattr(
        plugin_errors,
        "by_plugin_and_local_setting_id",
        {},
    )
    (
        known_plugin_ids,
        known_plugin_and_local_setting_ids,
    ) = _collect_known_plugin_ids_and_settings(ctx=ctx)
    known_plugin_ids.update(plugin_errors.keys())
    known_plugin_and_local_setting_ids.update(
        plugin_errors_by_plugin_and_local_setting_id.keys()
    )
    for entry in plugin_entries:
        setting_id = entry.metadata.settingId
        plugin_id = entry.metadata.pluginId
        if plugin_id is not None:
            parsed_setting_id = parse_plugin_setting_id(setting_id)
            if parsed_setting_id is not None:
                known_plugin_ids.add(plugin_id)
                known_plugin_and_local_setting_ids.add(parsed_setting_id)
        if setting_id in entries_by_id:
            if plugin_id is None:
                raise ValueError(f"Duplicate UI setting id: {setting_id}")
            parsed_setting_id = parse_plugin_setting_id(setting_id)
            local_setting_id = (
                parsed_setting_id[1] if parsed_setting_id is not None else setting_id
            )
            _record_plugin_ui_setting_error(
                plugin_errors,
                plugin_id=plugin_id,
                local_setting_id=local_setting_id,
                message=_build_plugin_duplicate_ui_setting_message(
                    plugin_id=plugin_id,
                    local_setting_id=local_setting_id,
                    sources={"registry_merge"},
                ),
            )
            continue
        entries_by_id[setting_id] = entry
    for entry in entries_by_id.values():
        _validate_runtime_entry_write_signature(entry)
    return UISettingRegistry(
        entriesById=entries_by_id,
        pluginErrorsByPluginId=plugin_errors,
        pluginErrorsByPluginAndLocalSettingId=(
            plugin_errors_by_plugin_and_local_setting_id
        ),
        knownPluginIds=known_plugin_ids,
        knownPluginAndLocalSettingIds=known_plugin_and_local_setting_ids,
    )


def _collect_known_plugin_ids_and_settings(
    *,
    ctx: "Context",
) -> tuple[set[str], set[tuple[str, str]]]:
    fastmcp = getattr(ctx, "fastmcp", None)
    state = getattr(fastmcp, "state", None)
    plugin_manager = getattr(state, "plugin_manager", None)
    if plugin_manager is None:
        return set(), set()

    runtime_response = plugin_manager.get_runtime_response()
    known_plugin_ids: set[str] = set()
    known_plugin_and_local_setting_ids: set[tuple[str, str]] = set()
    for status_entry in runtime_response.status.plugins:
        known_plugin_ids.add(status_entry.pluginId)
    for plugin in runtime_response.list.plugins:
        plugin_id = plugin.pluginId
        known_plugin_ids.add(plugin_id)

        schema_json = plugin.config.schemaJson
        if isinstance(schema_json, dict):
            raw_definitions = schema_json.get(PLUGIN_UI_SETTINGS_SCHEMA_KEY)
            if isinstance(raw_definitions, list):
                for raw_definition in raw_definitions:
                    local_setting_id = _try_resolve_plugin_local_setting_id_for_error(
                        raw_definition=raw_definition,
                    )
                    if local_setting_id is not None:
                        known_plugin_and_local_setting_ids.add(
                            (plugin_id, local_setting_id)
                        )

        backend_registrations = plugin_manager.get_backend_ui_settings(
            plugin_id=plugin_id
        )
        for registration in backend_registrations:
            local_setting_id = registration.localSettingId.strip()
            if local_setting_id == "":
                continue
            known_plugin_and_local_setting_ids.add((plugin_id, local_setting_id))

    return known_plugin_ids, known_plugin_and_local_setting_ids


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
                    overviewTabKey="WatchCode",
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
                    overviewTabKey="WatchCode",
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
                    overviewTabKey="WatchCode",
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


def _build_plugin_entries(
    *,
    ctx: "Context",
    project_config_id: ID,  # noqa: ARG001 - reserved for future plugin state scoping
) -> tuple[list[UISettingRuntimeEntry], dict[str, str]]:
    plugin_manager = getattr(ctx.fastmcp.state, "plugin_manager", None)
    if plugin_manager is None:
        return [], {}
    runtime_response = plugin_manager.get_runtime_response()
    entries: list[UISettingRuntimeEntry] = []
    plugin_errors_by_plugin_id = PluginUISettingErrorsByPluginId()
    for plugin in runtime_response.list.plugins:
        availability = resolve_plugin_runtime_availability(
            runtime_response=runtime_response,
            plugin_id=plugin.pluginId,
        )
        if not availability.hasOperationalState:
            continue
        if "registerPane" not in plugin.effectiveCapabilities:
            continue
        contributions_by_local_setting_id: dict[
            str, list[_PluginUISettingContribution]
        ] = {}
        schema_json = plugin.config.schemaJson
        if isinstance(schema_json, dict):
            definitions = _parse_plugin_ui_setting_definitions(
                schema_json=schema_json,
                plugin_id=plugin.pluginId,
                plugin_errors_by_plugin_id=plugin_errors_by_plugin_id,
            )
            for definition in definitions:
                _append_plugin_ui_setting_contribution(
                    contributions_by_local_setting_id,
                    _PluginUISettingContribution(
                        source="schema",
                        localSettingId=definition.localSettingId,
                        definition=definition,
                    ),
                )
        backend_registrations = plugin_manager.get_backend_ui_settings(
            plugin_id=plugin.pluginId,
        )
        for registration in backend_registrations:
            _append_plugin_ui_setting_contribution(
                contributions_by_local_setting_id,
                _PluginUISettingContribution(
                    source="backend",
                    localSettingId=registration.localSettingId,
                    registration=registration,
                ),
            )

        for local_setting_id, contributions in sorted(
            contributions_by_local_setting_id.items()
        ):
            if len(contributions) > 1:
                _record_plugin_ui_setting_error(
                    plugin_errors_by_plugin_id,
                    plugin_id=plugin.pluginId,
                    message=_build_plugin_duplicate_ui_setting_message(
                        plugin_id=plugin.pluginId,
                        local_setting_id=local_setting_id,
                        sources={contribution.source for contribution in contributions},
                    ),
                    local_setting_id=local_setting_id,
                )
                continue
            contribution = contributions[0]
            try:
                if contribution.source == "schema":
                    if contribution.definition is None:
                        raise ValueError(
                            (
                                "Missing schema definition payload for plugin "
                                f"{plugin.pluginId} setting {local_setting_id}."
                            )
                        )
                    entries.append(
                        _build_plugin_runtime_entry(
                            plugin_id=plugin.pluginId,
                            definition=contribution.definition,
                        )
                    )
                    continue
                if contribution.registration is None:
                    raise ValueError(
                        (
                            "Missing backend registration payload for plugin "
                            f"{plugin.pluginId} setting {local_setting_id}."
                        )
                    )
                entries.append(
                    _build_backend_plugin_runtime_entry(
                        plugin_id=plugin.pluginId,
                        registration=contribution.registration,
                        plugin_manager=plugin_manager,
                    )
                )
            except Exception as exc:
                _record_plugin_ui_setting_error(
                    plugin_errors_by_plugin_id,
                    plugin_id=plugin.pluginId,
                    message=str(exc),
                    local_setting_id=local_setting_id,
                )
    return entries, plugin_errors_by_plugin_id


def _append_plugin_ui_setting_contribution(
    contributions_by_local_setting_id: dict[str, list[_PluginUISettingContribution]],
    contribution: _PluginUISettingContribution,
) -> None:
    local_setting_id = contribution.localSettingId
    if local_setting_id not in contributions_by_local_setting_id:
        contributions_by_local_setting_id[local_setting_id] = [contribution]
        return
    contributions_by_local_setting_id[local_setting_id].append(contribution)


def _build_plugin_duplicate_ui_setting_message(
    *,
    plugin_id: str,
    local_setting_id: str,
    sources: set[str],
) -> str:
    normalized_sources = sorted(sources)
    if normalized_sources == ["backend", "schema"]:
        return (
            f"Plugin {plugin_id} duplicated ui settingId: {local_setting_id} "
            "(declared in both schema and backend registration)."
        )
    if normalized_sources == ["backend"]:
        return (
            f"Plugin {plugin_id} duplicated ui settingId: {local_setting_id} "
            "(multiple backend registrations)."
        )
    if normalized_sources == ["schema"]:
        return (
            f"Plugin {plugin_id} duplicated ui settingId: {local_setting_id} "
            "(multiple schema entries)."
        )
    return (
        f"Plugin {plugin_id} duplicated ui settingId: {local_setting_id} "
        f"(sources={', '.join(normalized_sources)})."
    )


def _record_plugin_ui_setting_error(
    plugin_errors_by_plugin_id: dict[str, str],
    *,
    plugin_id: str,
    message: str,
    local_setting_id: str | None = None,
) -> None:
    logger.warning(
        "Skipping invalid UI-setting contribution from plugin %s: %s",
        plugin_id,
        message,
    )
    plugin_errors_by_plugin_and_local_setting_id = getattr(
        plugin_errors_by_plugin_id,
        "by_plugin_and_local_setting_id",
        None,
    )
    existing = plugin_errors_by_plugin_id.get(plugin_id)
    if existing is None:
        plugin_errors_by_plugin_id[plugin_id] = message
        if (
            local_setting_id is not None
            and plugin_errors_by_plugin_and_local_setting_id is not None
        ):
            plugin_errors_by_plugin_and_local_setting_id[
                (plugin_id, local_setting_id)
            ] = message
        return
    if message in existing:
        if (
            local_setting_id is not None
            and plugin_errors_by_plugin_and_local_setting_id is not None
        ):
            key = (plugin_id, local_setting_id)
            if key not in plugin_errors_by_plugin_and_local_setting_id:
                plugin_errors_by_plugin_and_local_setting_id[key] = message
        return
    plugin_errors_by_plugin_id[plugin_id] = f"{existing}; {message}"
    if (
        local_setting_id is not None
        and plugin_errors_by_plugin_and_local_setting_id is not None
    ):
        plugin_errors_by_plugin_and_local_setting_id[(plugin_id, local_setting_id)] = (
            message
        )


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


def _build_plugin_runtime_entry(
    *,
    plugin_id: str,
    definition: _PluginUISettingDefinition,
) -> UISettingRuntimeEntry:
    setting_id = build_plugin_setting_id(
        plugin_id=plugin_id,
        local_setting_id=definition.localSettingId,
    )
    read_value = _build_plugin_read_value(
        plugin_id=plugin_id,
        config_path=definition.configPath,
        default_value=definition.defaultValue,
    )
    write_value = (
        None
        if definition.mutability == "readOnly"
        else _build_plugin_write_value(
            setting_id=setting_id,
            plugin_id=plugin_id,
            config_path=definition.configPath,
            default_value=definition.defaultValue,
            value_schema=definition.valueSchema,
        )
    )
    return UISettingRuntimeEntry(
        metadata=UISettingEntry(
            settingId=setting_id,
            title=definition.title,
            synonyms=definition.synonyms,
            description=definition.description,
            location=UISettingLocation(
                side="left",
                overviewTabKey=_build_plugin_pane_overview_tab_key(
                    plugin_id=plugin_id,
                    pane_id=definition.paneId,
                ),
                pluginId=plugin_id,
                paneId=definition.paneId,
            ),
            highlight=UISettingHighlight(
                strategy="plugin_handler",
                pluginRevealKey=definition.revealKey,
            ),
            source="plugin",
            pluginId=plugin_id,
            mutability=definition.mutability,
            valueSchema=definition.valueSchema,
        ),
        readValue=read_value,
        writeValue=write_value,
    )


def _build_backend_plugin_runtime_entry(
    *,
    plugin_id: str,
    registration: PluginRegisteredUISetting,
    plugin_manager,
) -> UISettingRuntimeEntry:
    setting_id = build_plugin_setting_id(
        plugin_id=plugin_id,
        local_setting_id=registration.localSettingId,
    )
    value_schema = UISettingValueSchema.model_validate(registration.valueSchema)
    read_value = _build_plugin_backend_read_value(
        plugin_id=plugin_id,
        read_handler_id=registration.readHandlerId,
        plugin_manager=plugin_manager,
    )
    write_value = (
        None
        if registration.mutability == "readOnly" or registration.writeHandlerId is None
        else _build_plugin_backend_write_value(
            setting_id=setting_id,
            plugin_id=plugin_id,
            read_handler_id=registration.readHandlerId,
            write_handler_id=registration.writeHandlerId,
            plugin_manager=plugin_manager,
            value_schema=value_schema,
        )
    )
    return UISettingRuntimeEntry(
        metadata=UISettingEntry(
            settingId=setting_id,
            title=registration.title,
            synonyms=list(registration.synonyms),
            description=registration.description,
            location=UISettingLocation(
                side="left",
                overviewTabKey=_build_plugin_pane_overview_tab_key(
                    plugin_id=plugin_id,
                    pane_id=registration.paneId,
                ),
                pluginId=plugin_id,
                paneId=registration.paneId,
            ),
            highlight=UISettingHighlight(
                strategy="plugin_handler",
                pluginRevealKey=registration.revealKey,
            ),
            source="plugin",
            pluginId=plugin_id,
            mutability=registration.mutability,
            valueSchema=value_schema,
        ),
        readValue=read_value,
        writeValue=write_value,
    )


def _build_plugin_read_value(
    *,
    plugin_id: str,
    config_path: list[str],
    default_value: JSONValue,
):
    def _read_plugin_value(
        ctx: "Context",
        project_config_id: ID,  # noqa: ARG001 - plugin settings are project-global
    ) -> JSONValue:
        plugin_entry = _require_active_plugin_runtime_entry(
            ctx=ctx,
            plugin_id=plugin_id,
        )
        return _read_plugin_config_path_value(
            config=plugin_entry.config.currentConfig,
            config_path=config_path,
            default_value=default_value,
            plugin_id=plugin_id,
        )

    return _read_plugin_value


def _build_plugin_write_value(
    *,
    setting_id: str,
    plugin_id: str,
    config_path: list[str],
    default_value: JSONValue,
    value_schema: UISettingValueSchema,
):
    async def _write_plugin_value(
        ctx: "Context",
        project_config_id: ID,  # noqa: ARG001 - plugin settings are project-global
        value: JSONValue,
        expected_old_value: JSONValue | None = None,
    ) -> UISettingMutationResult:
        _require_active_plugin_runtime_entry(
            ctx=ctx,
            plugin_id=plugin_id,
        )
        plugin_manager = ctx.fastmcp.state.plugin_manager

        def _validate_old_value(observed_old_value: JSONValue) -> None:
            validate_ui_setting_value(value_schema, observed_old_value)

        try:
            old_value, new_value = (
                plugin_manager.compare_and_write_plugin_config_path_value(
                    plugin_id=plugin_id,
                    setting_id=setting_id,
                    config_path=config_path,
                    default_value=default_value,
                    value=value,
                    expected_old_value=expected_old_value,
                    validate_old_value=_validate_old_value,
                )
            )
        except PluginManagerError as exc:
            raise _convert_plugin_manager_error_for_ui_setting(
                exc,
                plugin_id=plugin_id,
                operation="write",
            ) from exc
        return UISettingMutationResult(
            oldValue=old_value,
            newValue=new_value,
            normalizedValue=value,
            changed=old_value != new_value,
        )

    return _write_plugin_value


def _build_plugin_backend_read_value(
    *,
    plugin_id: str,
    read_handler_id: str,
    plugin_manager,
):
    def _read_plugin_backend_value(
        ctx: "Context",
        project_config_id: ID,
    ) -> JSONValue:
        _require_active_plugin_runtime_entry(
            ctx=ctx,
            plugin_id=plugin_id,
        )
        try:
            return plugin_manager.read_backend_ui_setting_value(
                plugin_id=plugin_id,
                read_handler_id=read_handler_id,
                project_config_id=project_config_id,
            )
        except PluginManagerError as exc:
            raise _convert_plugin_manager_error_for_ui_setting(
                exc,
                plugin_id=plugin_id,
                operation="read",
            ) from exc

    return _read_plugin_backend_value


def _build_plugin_backend_write_value(
    *,
    setting_id: str,
    plugin_id: str,
    read_handler_id: str,
    write_handler_id: str,
    plugin_manager,
    value_schema: UISettingValueSchema,
):
    async def _write_plugin_backend_value(
        ctx: "Context",
        project_config_id: ID,
        value: JSONValue,
        expected_old_value: JSONValue | None = None,
    ) -> UISettingMutationResult:
        _require_active_plugin_runtime_entry(
            ctx=ctx,
            plugin_id=plugin_id,
        )

        def _validate_backend_value(observed_value: JSONValue) -> None:
            validate_ui_setting_value(value_schema, observed_value)

        try:
            old_value, new_value = (
                plugin_manager.compare_and_write_backend_ui_setting_value(
                    plugin_id=plugin_id,
                    setting_id=setting_id,
                    read_handler_id=read_handler_id,
                    write_handler_id=write_handler_id,
                    project_config_id=project_config_id,
                    value=value,
                    expected_old_value=expected_old_value,
                    validate_old_value=_validate_backend_value,
                    validate_new_value=_validate_backend_value,
                )
            )
        except PluginManagerError as exc:
            raise _convert_plugin_manager_error_for_ui_setting(
                exc,
                plugin_id=plugin_id,
                operation="write",
            ) from exc
        return UISettingMutationResult(
            oldValue=old_value,
            newValue=new_value,
            normalizedValue=value,
            changed=old_value != new_value,
        )

    return _write_plugin_backend_value


def _convert_plugin_manager_error_for_ui_setting(
    exc: PluginManagerError,
    *,
    plugin_id: str,
    operation: str,
) -> UISettingValidationError:
    if exc.code in {
        "PLUGIN_BACKEND_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
        "PLUGIN_SCHEMA_UI_SETTING_EXPECTED_OLD_VALUE_MISMATCH",
        "PLUGIN_BACKEND_UI_SETTING_POST_WRITE_VALIDATION_FAILED",
        "PLUGIN_BACKEND_UI_SETTING_POST_WRITE_VALIDATION_ROLLBACK_FAILED",
    }:
        return UISettingValidationError(
            "mutation_failed",
            exc.message,
        )
    if exc.code == "PLUGIN_BACKEND_WORKER_TRANSPORT_ERROR":
        return UISettingValidationError(
            "plugin_unavailable",
            (
                f"Plugin {plugin_id} is unavailable for ui setting {operation}: "
                f"{exc.message}"
            ),
        )
    return UISettingValidationError(
        "mutation_failed",
        (f"Plugin {plugin_id} ui setting {operation} failed: {exc.message}"),
    )


def _parse_plugin_ui_setting_definitions(
    *,
    schema_json: dict[str, Any],
    plugin_id: str,
    plugin_errors_by_plugin_id: PluginUISettingErrorsByPluginId,
) -> list[_PluginUISettingDefinition]:
    if PLUGIN_UI_SETTINGS_SCHEMA_KEY not in schema_json:
        return []
    raw_definitions = schema_json[PLUGIN_UI_SETTINGS_SCHEMA_KEY]
    if not isinstance(raw_definitions, list):
        _record_plugin_ui_setting_error(
            plugin_errors_by_plugin_id,
            plugin_id=plugin_id,
            message=f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY} must be a list.",
        )
        return []

    definitions: list[_PluginUISettingDefinition] = []
    for index, raw_definition in enumerate(raw_definitions):
        local_setting_id_for_error = _try_resolve_plugin_local_setting_id_for_error(
            raw_definition=raw_definition
        )
        try:
            definitions.append(
                _parse_plugin_ui_setting_definition(
                    schema_json=schema_json,
                    plugin_id=plugin_id,
                    index=index,
                    raw_definition=raw_definition,
                )
            )
        except Exception as exc:
            _record_plugin_ui_setting_error(
                plugin_errors_by_plugin_id,
                plugin_id=plugin_id,
                message=str(exc),
                local_setting_id=local_setting_id_for_error,
            )
    return definitions


def _parse_plugin_ui_setting_definition(
    *,
    schema_json: dict[str, Any],
    plugin_id: str,
    index: int,
    raw_definition: Any,
) -> _PluginUISettingDefinition:
    if not isinstance(raw_definition, dict):
        raise ValueError(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] must be an object."
        )
    local_setting_id = _require_non_empty_string(
        raw_definition.get("settingId"),
        context=(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] "
            "settingId must be a non-empty string."
        ),
    )
    if "::" in local_setting_id:
        raise ValueError(
            f"Plugin {plugin_id} settingId {local_setting_id} must not contain '::'."
        )
    title = _require_non_empty_string(
        raw_definition.get("title"),
        context=(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] "
            "title must be a non-empty string."
        ),
    )
    description = _require_non_empty_string(
        raw_definition.get("description"),
        context=(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] "
            "description must be a non-empty string."
        ),
    )
    pane_id = _require_non_empty_string(
        raw_definition.get("paneId"),
        context=(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] "
            "paneId must be a non-empty string."
        ),
    )
    reveal_key = _require_non_empty_string(
        raw_definition.get("revealKey"),
        context=(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] "
            "revealKey must be a non-empty string."
        ),
    )
    config_path = _normalize_plugin_config_path(
        raw_definition.get("configPath"),
        plugin_id=plugin_id,
        index=index,
    )
    mutability = _normalize_plugin_mutability(
        raw_definition.get("mutability"),
        plugin_id=plugin_id,
        index=index,
    )
    synonyms = _normalize_plugin_synonyms(
        raw_definition.get("synonyms"),
        plugin_id=plugin_id,
        index=index,
    )
    value_schema = _resolve_plugin_value_schema(
        schema_json=schema_json,
        raw_value_schema=raw_definition.get("valueSchema"),
        config_path=config_path,
        plugin_id=plugin_id,
        local_setting_id=local_setting_id,
    )
    if "defaultValue" not in raw_definition:
        raise ValueError(
            (f"Plugin {plugin_id} setting {local_setting_id} must define defaultValue.")
        )
    default_value = _validate_plugin_default_value(
        plugin_id=plugin_id,
        local_setting_id=local_setting_id,
        value_schema=value_schema,
        value=raw_definition.get("defaultValue"),
    )
    return _PluginUISettingDefinition(
        localSettingId=local_setting_id,
        title=title,
        description=description,
        synonyms=synonyms,
        paneId=pane_id,
        revealKey=reveal_key,
        configPath=config_path,
        mutability=mutability,
        valueSchema=value_schema,
        defaultValue=default_value,
    )


def _try_resolve_plugin_local_setting_id_for_error(
    *,
    raw_definition: Any,
) -> str | None:
    if not isinstance(raw_definition, dict):
        return None
    raw_setting_id = raw_definition.get("settingId")
    if not isinstance(raw_setting_id, str):
        return None
    local_setting_id = raw_setting_id.strip()
    if local_setting_id == "" or "::" in local_setting_id:
        return None
    return local_setting_id


def _require_non_empty_string(value: Any, *, context: str) -> str:
    if not isinstance(value, str):
        raise ValueError(context)
    normalized = value.strip()
    if normalized == "":
        raise ValueError(context)
    return normalized


def _normalize_plugin_config_path(
    raw_value: Any,
    *,
    plugin_id: str,
    index: int,
) -> list[str]:
    context = (
        f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] "
        "configPath must be a non-empty string array."
    )
    if not isinstance(raw_value, list) or len(raw_value) == 0:
        raise ValueError(context)
    output: list[str] = []
    for path_item in raw_value:
        output.append(_require_non_empty_string(path_item, context=context))
    return output


def _normalize_plugin_synonyms(
    raw_value: Any,
    *,
    plugin_id: str,
    index: int,
) -> list[str]:
    if raw_value is None:
        return []
    if not isinstance(raw_value, list):
        raise ValueError(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] synonyms must be a string array."
        )
    output: list[str] = []
    for synonym in raw_value:
        output.append(
            _require_non_empty_string(
                synonym,
                context=(
                    f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] "
                    "synonyms must contain non-empty strings."
                ),
            )
        )
    return output


def _normalize_plugin_mutability(
    raw_value: Any,
    *,
    plugin_id: str,
    index: int,
) -> Literal["readOnly", "writable"]:
    if raw_value is None:
        return "writable"
    if raw_value in {"readOnly", "writable"}:
        return raw_value
    raise ValueError(
        f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY}[{index}] mutability must be readOnly or writable."
    )


def _resolve_plugin_value_schema(
    *,
    schema_json: dict[str, Any],
    raw_value_schema: Any,
    config_path: list[str],
    plugin_id: str,
    local_setting_id: str,
) -> UISettingValueSchema:
    if raw_value_schema is not None:
        if not isinstance(raw_value_schema, dict):
            raise ValueError(
                f"Plugin {plugin_id} setting {local_setting_id} valueSchema must be an object."
            )
        return UISettingValueSchema.model_validate(raw_value_schema)
    inferred = _infer_plugin_value_schema_from_config_schema(
        schema_json=schema_json,
        config_path=config_path,
    )
    if inferred is not None:
        return inferred
    raise ValueError(
        f"Plugin {plugin_id} setting {local_setting_id} must define valueSchema."
    )


def _validate_plugin_default_value(
    *,
    plugin_id: str,
    local_setting_id: str,
    value_schema: UISettingValueSchema,
    value: JSONValue,
) -> JSONValue:
    try:
        validate_ui_setting_value(value_schema, value)
    except UISettingValidationError as exc:
        raise ValueError(
            (
                f"Plugin {plugin_id} setting {local_setting_id} defaultValue "
                f"is invalid: {exc}"
            )
        ) from exc
    return value


def _infer_plugin_value_schema_from_config_schema(
    *,
    schema_json: dict[str, Any],
    config_path: list[str],
) -> UISettingValueSchema | None:
    schema_node = _resolve_schema_node_for_config_path(
        schema_json=schema_json,
        config_path=config_path,
    )
    if schema_node is None:
        return None
    return _infer_ui_setting_value_schema_from_schema_node(schema_node=schema_node)


def _infer_ui_setting_value_schema_from_schema_node(
    *,
    schema_node: dict[str, Any],
) -> UISettingValueSchema | None:
    raw_type: Any = schema_node.get("type")
    if isinstance(raw_type, list):
        non_null_types = [item for item in raw_type if item != "null"]
        if len(non_null_types) != 1:
            return None
        raw_type = non_null_types[0]
    if raw_type not in {"boolean", "string", "number", "integer", "array", "object"}:
        return None
    enum_values = schema_node.get("enum")
    if enum_values is not None and not isinstance(enum_values, list):
        return None
    minimum = _as_float(schema_node.get("minimum"))
    maximum = _as_float(schema_node.get("maximum"))
    min_length = _as_int(schema_node.get("minLength"))
    max_length = _as_int(schema_node.get("maxLength"))
    items_schema: UISettingValueSchema | None = None
    if raw_type == "array":
        raw_items = schema_node.get("items")
        if isinstance(raw_items, dict):
            items_schema = _infer_ui_setting_value_schema_from_schema_node(
                schema_node=raw_items
            )
    properties_schema: dict[str, UISettingValueSchema] | None = None
    required_properties: list[str] | None = None
    additional_properties: bool | None = None
    if raw_type == "object":
        raw_properties = schema_node.get("properties")
        if isinstance(raw_properties, dict):
            parsed_properties: dict[str, UISettingValueSchema] = {}
            for property_name, raw_property_schema in raw_properties.items():
                if not isinstance(property_name, str):
                    continue
                if not isinstance(raw_property_schema, dict):
                    continue
                parsed_property_schema = (
                    _infer_ui_setting_value_schema_from_schema_node(
                        schema_node=raw_property_schema
                    )
                )
                if parsed_property_schema is None:
                    continue
                parsed_properties[property_name] = parsed_property_schema
            properties_schema = parsed_properties
        raw_required = schema_node.get("required")
        if isinstance(raw_required, list):
            required_list = [
                item for item in raw_required if isinstance(item, str) and item != ""
            ]
            required_properties = required_list
        raw_additional_properties = schema_node.get("additionalProperties")
        if isinstance(raw_additional_properties, bool):
            additional_properties = raw_additional_properties
    return UISettingValueSchema(
        type=raw_type,
        enumValues=enum_values,
        minimum=minimum,
        maximum=maximum,
        minLength=min_length,
        maxLength=max_length,
        items=items_schema,
        properties=properties_schema,
        requiredProperties=required_properties,
        additionalProperties=additional_properties,
    )


def _resolve_schema_node_for_config_path(
    *,
    schema_json: dict[str, Any],
    config_path: list[str],
) -> dict[str, Any] | None:
    current_node: Any = schema_json
    for segment in config_path:
        if not isinstance(current_node, dict):
            return None
        if "properties" not in current_node:
            return None
        properties = current_node["properties"]
        if not isinstance(properties, dict):
            return None
        if segment not in properties:
            return None
        current_node = properties[segment]
    if not isinstance(current_node, dict):
        return None
    return current_node


def _as_float(value: Any) -> float | None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    return float(value)


def _as_int(value: Any) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    return int(value)


def _build_plugin_pane_overview_tab_key(*, plugin_id: str, pane_id: str) -> str:
    return (
        "PluginPane:"
        f"{quote(plugin_id, safe=_JS_ENCODE_URI_COMPONENT_SAFE_CHARS)}:"
        f"{quote(pane_id, safe=_JS_ENCODE_URI_COMPONENT_SAFE_CHARS)}"
    )


def _require_active_plugin_runtime_entry(
    *,
    ctx: "Context",
    plugin_id: str,
):
    plugin_manager = getattr(ctx.fastmcp.state, "plugin_manager", None)
    if plugin_manager is None:
        raise UISettingValidationError(
            "plugin_unavailable",
            "Plugin manager is unavailable for plugin UI setting access.",
        )
    runtime_response = plugin_manager.get_runtime_response()
    availability = resolve_plugin_runtime_availability(
        runtime_response=runtime_response,
        plugin_id=plugin_id,
    )
    if not availability.hasOperationalState:
        observed_state = describe_plugin_runtime_states(
            observed_states=availability.observedStates
        )
        if observed_state is None:
            raise UISettingValidationError(
                "plugin_unavailable",
                f"Plugin {plugin_id} is unavailable.",
            )
        raise UISettingValidationError(
            "plugin_unavailable",
            f"Plugin {plugin_id} is unavailable (state={observed_state}).",
        )
    if availability.pluginEntry is not None:
        return availability.pluginEntry
    observed_state = (
        describe_plugin_runtime_states(observed_states=availability.observedStates)
        or "unknown"
    )
    raise UISettingValidationError(
        "plugin_unavailable",
        (
            f"Plugin {plugin_id} is unavailable "
            f"(state={observed_state}, runtime entry missing)."
        ),
    )


def _read_plugin_config_path_value(
    *,
    config: Any,
    config_path: list[str],
    default_value: JSONValue,
    plugin_id: str,
) -> JSONValue:
    return _read_plugin_config_path_value_for_write(
        config=config,
        config_path=config_path,
        default_value=default_value,
        plugin_id=plugin_id,
    )


def _read_plugin_config_path_value_for_write(
    *,
    config: dict[str, Any],
    config_path: list[str],
    default_value: JSONValue,
    plugin_id: str,
) -> JSONValue:
    current_value: Any = config
    traversed_segments: list[str] = []
    for segment in config_path:
        if not isinstance(current_value, dict):
            mismatch_path = (
                ".".join(traversed_segments)
                if len(traversed_segments) > 0
                else "<root>"
            )
            raise UISettingValidationError(
                "mutation_failed",
                (
                    f"Plugin {plugin_id} config path {'.'.join(config_path)} "
                    f"contains a non-object node at {mismatch_path}."
                ),
            )
        if segment not in current_value:
            return default_value
        traversed_segments.append(segment)
        current_value = current_value[segment]
    return current_value


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
