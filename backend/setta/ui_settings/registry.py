from copy import deepcopy
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal
from urllib.parse import quote

from setta.project_state.project_manager_types import (
    GetAppDefinitionRequest,
    SetAppDefinitionRequest,
    SetShowParamDisplayNamesRequest,
    SetWatchCodeEnabledRequest,
    SetWatchCodeInputsRequest,
)
from setta.types.app_definition import AppDefinition
from setta.types.chat_messages import JSONValue
from setta.types.id import ID
from setta.types.project_config import WatchCodeFolder
from setta.ui_settings.models import (
    UISettingEntry,
    UISettingHighlight,
    UISettingLocation,
    UISettingMutationResult,
    UISettingRuntimeEntry,
    UISettingValueSchema,
)

if TYPE_CHECKING:
    from mcp.server.fastmcp.server import Context

UISettingSourceFilter = Literal["core", "plugin", "all"]
PLUGIN_SETTING_ID_PREFIX = "plugin::"
PLUGIN_UI_SETTINGS_SCHEMA_KEY = "x-setta-ui-settings"


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
    project_config_id: ID,  # noqa: ARG001 - reserved for plugin contributions
) -> UISettingRegistry:
    entries_by_id: dict[str, UISettingRuntimeEntry] = {}
    for entry in _build_core_entries():
        entries_by_id[entry.metadata.settingId] = entry
    for entry in _build_plugin_entries(ctx=ctx, project_config_id=project_config_id):
        setting_id = entry.metadata.settingId
        if setting_id in entries_by_id:
            raise ValueError(f"Duplicate UI setting id: {setting_id}")
        entries_by_id[setting_id] = entry
    return UISettingRegistry(entriesById=entries_by_id)


def validate_ui_setting_value(
    schema: UISettingValueSchema,
    value: JSONValue,
) -> JSONValue:
    expected_type = schema.type
    if expected_type == "boolean":
        if not isinstance(value, bool):
            raise UISettingValidationError(
                "invalid_value_type",
                "Expected a boolean value.",
            )
        normalized: JSONValue = value
    elif expected_type == "string":
        if not isinstance(value, str):
            raise UISettingValidationError(
                "invalid_value_type",
                "Expected a string value.",
            )
        if schema.minLength is not None and len(value) < schema.minLength:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                f"String value must be at least {schema.minLength} characters.",
            )
        if schema.maxLength is not None and len(value) > schema.maxLength:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                f"String value must be at most {schema.maxLength} characters.",
            )
        normalized = value
    elif expected_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise UISettingValidationError(
                "invalid_value_type",
                "Expected a numeric value.",
            )
        normalized_float = float(value)
        if schema.minimum is not None and normalized_float < schema.minimum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                f"Value must be greater than or equal to {schema.minimum}.",
            )
        if schema.maximum is not None and normalized_float > schema.maximum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                f"Value must be less than or equal to {schema.maximum}.",
            )
        normalized = normalized_float
    elif expected_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise UISettingValidationError(
                "invalid_value_type",
                "Expected an integer value.",
            )
        normalized_int = int(value)
        if schema.minimum is not None and normalized_int < schema.minimum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                f"Value must be greater than or equal to {schema.minimum}.",
            )
        if schema.maximum is not None and normalized_int > schema.maximum:
            raise UISettingValidationError(
                "invalid_value_range_or_enum",
                f"Value must be less than or equal to {schema.maximum}.",
            )
        normalized = normalized_int
    elif expected_type == "array":
        if not isinstance(value, list):
            raise UISettingValidationError(
                "invalid_value_type",
                "Expected an array value.",
            )
        normalized = value
    elif expected_type == "object":
        if not isinstance(value, dict):
            raise UISettingValidationError(
                "invalid_value_type",
                "Expected an object value.",
            )
        normalized = value
    else:
        raise UISettingValidationError(
            "invalid_value_type",
            f"Unsupported value schema type: {expected_type}",
        )

    if schema.enumValues is not None and normalized not in schema.enumValues:
        raise UISettingValidationError(
            "invalid_value_range_or_enum",
            "Value is not in the allowed enum set.",
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


def _build_core_entries() -> list[UISettingRuntimeEntry]:
    return [
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
                valueSchema=UISettingValueSchema(type="array"),
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
                valueSchema=UISettingValueSchema(type="array"),
            ),
            readValue=_read_watch_code_files,
            writeValue=_write_watch_code_files,
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


def _build_plugin_entries(
    *,
    ctx: "Context",
    project_config_id: ID,  # noqa: ARG001 - reserved for future plugin state scoping
) -> list[UISettingRuntimeEntry]:
    plugin_manager = getattr(ctx.fastmcp.state, "plugin_manager", None)
    if plugin_manager is None:
        return []
    runtime_response = plugin_manager.get_runtime_response()
    plugin_state_by_id: dict[str, str] = {}
    for status_entry in runtime_response.status.plugins:
        state_value = status_entry.state
        plugin_state_by_id[status_entry.pluginId] = (
            state_value.value if hasattr(state_value, "value") else str(state_value)
        )
    entries: list[UISettingRuntimeEntry] = []
    for plugin in runtime_response.list.plugins:
        plugin_state = plugin_state_by_id.get(plugin.pluginId)
        if plugin_state != "active":
            continue
        if "registerPane" not in plugin.effectiveCapabilities:
            continue
        schema_json = plugin.config.schemaJson
        if not isinstance(schema_json, dict):
            continue
        definitions = _parse_plugin_ui_setting_definitions(
            schema_json=schema_json,
            plugin_id=plugin.pluginId,
        )
        for definition in definitions:
            entries.append(
                _build_plugin_runtime_entry(
                    plugin_id=plugin.pluginId,
                    definition=definition,
                )
            )
    return entries


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
            plugin_id=plugin_id,
            config_path=definition.configPath,
            default_value=definition.defaultValue,
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
        )

    return _read_plugin_value


def _build_plugin_write_value(
    *,
    plugin_id: str,
    config_path: list[str],
    default_value: JSONValue,
):
    async def _write_plugin_value(
        ctx: "Context",
        project_config_id: ID,  # noqa: ARG001 - plugin settings are project-global
        value: JSONValue,
    ) -> UISettingMutationResult:
        plugin_entry = _require_active_plugin_runtime_entry(
            ctx=ctx,
            plugin_id=plugin_id,
        )
        old_config = _clone_json_object(plugin_entry.config.currentConfig)
        old_value = _read_plugin_config_path_value(
            config=old_config,
            config_path=config_path,
            default_value=default_value,
        )
        next_config = _write_plugin_config_path_value(
            config=old_config,
            config_path=config_path,
            value=value,
        )
        ctx.fastmcp.state.plugin_manager.write_plugin_config(
            plugin_id=plugin_id,
            config=next_config,
        )
        refreshed_entry = _require_active_plugin_runtime_entry(
            ctx=ctx,
            plugin_id=plugin_id,
        )
        new_value = _read_plugin_config_path_value(
            config=refreshed_entry.config.currentConfig,
            config_path=config_path,
            default_value=default_value,
        )
        return UISettingMutationResult(
            oldValue=old_value,
            newValue=new_value,
            normalizedValue=value,
            changed=old_value != new_value,
        )

    return _write_plugin_value


def _clone_json_object(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return deepcopy(value)


def _parse_plugin_ui_setting_definitions(
    *,
    schema_json: dict[str, Any],
    plugin_id: str,
) -> list[_PluginUISettingDefinition]:
    if PLUGIN_UI_SETTINGS_SCHEMA_KEY not in schema_json:
        return []
    raw_definitions = schema_json[PLUGIN_UI_SETTINGS_SCHEMA_KEY]
    if not isinstance(raw_definitions, list):
        raise ValueError(
            f"Plugin {plugin_id} {PLUGIN_UI_SETTINGS_SCHEMA_KEY} must be a list."
        )

    definitions: list[_PluginUISettingDefinition] = []
    seen_local_ids: set[str] = set()
    for index, raw_definition in enumerate(raw_definitions):
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
        if local_setting_id in seen_local_ids:
            raise ValueError(
                f"Plugin {plugin_id} duplicated ui settingId: {local_setting_id}"
            )
        seen_local_ids.add(local_setting_id)
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
        default_value = raw_definition.get("defaultValue")
        definitions.append(
            _PluginUISettingDefinition(
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
        )
    return definitions


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
    return UISettingValueSchema(
        type=raw_type,
        enumValues=enum_values,
        minimum=minimum,
        maximum=maximum,
        minLength=min_length,
        maxLength=max_length,
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
    return f"PluginPane:{quote(plugin_id, safe='')}:{quote(pane_id, safe='')}"


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
    plugin_state: str | None = None
    for status_entry in runtime_response.status.plugins:
        if status_entry.pluginId != plugin_id:
            continue
        state_value = status_entry.state
        plugin_state = (
            state_value.value if hasattr(state_value, "value") else str(state_value)
        )
        break
    if plugin_state != "active":
        if plugin_state is None:
            raise UISettingValidationError(
                "plugin_unavailable",
                f"Plugin {plugin_id} is unavailable.",
            )
        raise UISettingValidationError(
            "plugin_unavailable",
            f"Plugin {plugin_id} is unavailable (state={plugin_state}).",
        )

    for plugin in runtime_response.list.plugins:
        if plugin.pluginId == plugin_id:
            return plugin
    raise UISettingValidationError(
        "plugin_unavailable",
        f"Plugin {plugin_id} is unavailable (state=active, runtime entry missing).",
    )


def _read_plugin_config_path_value(
    *,
    config: Any,
    config_path: list[str],
    default_value: JSONValue,
) -> JSONValue:
    current_value: Any = config
    for segment in config_path:
        if not isinstance(current_value, dict):
            return default_value
        if segment not in current_value:
            return default_value
        current_value = current_value[segment]
    return current_value


def _write_plugin_config_path_value(
    *,
    config: dict[str, Any],
    config_path: list[str],
    value: JSONValue,
) -> dict[str, Any]:
    output = deepcopy(config)
    current_value: dict[str, Any] = output
    for segment in config_path[:-1]:
        if segment in current_value and isinstance(current_value[segment], dict):
            nested_value = current_value[segment]
        else:
            nested_value = {}
            current_value[segment] = nested_value
        current_value = nested_value
    current_value[config_path[-1]] = value
    return output


def _get_project_manager(ctx: "Context", project_config_id: ID):
    return ctx.fastmcp.state.project_manager_switcher.get(project_config_id)


def _read_watch_code_enabled(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return project_state.projectConfig.watchCodeEnabled


async def _write_watch_code_enabled(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
) -> UISettingMutationResult:
    if not isinstance(value, bool):
        raise UISettingValidationError(
            "invalid_value_type", "Expected a boolean value."
        )
    old_value = _read_watch_code_enabled(ctx, project_config_id)
    manager = _get_project_manager(ctx, project_config_id)
    await manager.set_watch_code_enabled(
        SetWatchCodeEnabledRequest(
            projectConfigId=project_config_id,
            enabled=value,
        )
    )
    new_value = _read_watch_code_enabled(ctx, project_config_id)
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
) -> UISettingMutationResult:
    if not isinstance(value, list):
        raise UISettingValidationError("invalid_value_type", "Expected an array value.")
    folders = [WatchCodeFolder.model_validate(entry) for entry in value]
    old_value = _read_watch_code_folders(ctx, project_config_id)
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    await manager.set_watch_code_inputs(
        SetWatchCodeInputsRequest(
            projectConfigId=project_config_id,
            watchCodeFolders=folders,
            watchCodeFiles=list(project_state.projectConfig.watchCodeFiles),
        )
    )
    new_value = _read_watch_code_folders(ctx, project_config_id)
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


async def _write_watch_code_files(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
) -> UISettingMutationResult:
    if not isinstance(value, list) or any(
        not isinstance(entry, str) for entry in value
    ):
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected an array of strings.",
        )
    old_value = _read_watch_code_files(ctx, project_config_id)
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    await manager.set_watch_code_inputs(
        SetWatchCodeInputsRequest(
            projectConfigId=project_config_id,
            watchCodeFolders=list(project_state.projectConfig.watchCodeFolders),
            watchCodeFiles=list(value),
        )
    )
    new_value = _read_watch_code_files(ctx, project_config_id)
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


def _read_show_param_display_names(ctx: "Context", project_config_id: ID) -> JSONValue:
    manager = _get_project_manager(ctx, project_config_id)
    project_state = manager.get_single_config_state(project_config_id)
    return project_state.projectConfig.showParamDisplayNames


async def _write_show_param_display_names(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
) -> UISettingMutationResult:
    if not isinstance(value, bool):
        raise UISettingValidationError(
            "invalid_value_type", "Expected a boolean value."
        )
    old_value = _read_show_param_display_names(ctx, project_config_id)
    manager = _get_project_manager(ctx, project_config_id)
    await manager.set_show_param_display_names(
        SetShowParamDisplayNamesRequest(
            projectConfigId=project_config_id,
            showParamDisplayNames=value,
        )
    )
    new_value = _read_show_param_display_names(ctx, project_config_id)
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


async def _set_app_definition_field(
    ctx: "Context",
    project_config_id: ID,
    *,
    app_spec_version: str | None = None,
    catalog_id: str | None = None,
    app_spec_path: str | None = None,
    theme: dict[str, JSONValue] | None = None,
) -> None:
    manager = _get_project_manager(ctx, project_config_id)
    current = await manager.get_app_definition(GetAppDefinitionRequest())
    if not isinstance(current.appSpec, dict):
        raise UISettingValidationError(
            "mutation_failed",
            "Cannot update app definition settings before an app spec exists.",
        )
    await manager.set_app_definition(
        SetAppDefinitionRequest(
            appSpec=current.appSpec,
            appSpecVersion=app_spec_version,
            catalogId=catalog_id,
            appSpecPath=app_spec_path,
            theme=theme,
        )
    )


async def _read_app_catalog_id(ctx: "Context", project_config_id: ID) -> JSONValue:
    definition = await _get_app_definition(ctx, project_config_id)
    return definition.catalogId


async def _write_app_catalog_id(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
) -> UISettingMutationResult:
    if not isinstance(value, str) or value.strip() == "":
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected a non-empty string value.",
        )
    old_value = await _read_app_catalog_id(ctx, project_config_id)
    await _set_app_definition_field(
        ctx,
        project_config_id,
        catalog_id=value.strip(),
    )
    new_value = await _read_app_catalog_id(ctx, project_config_id)
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
) -> UISettingMutationResult:
    if not isinstance(value, str) or value.strip() == "":
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected a non-empty string value.",
        )
    old_value = await _read_app_spec_version(ctx, project_config_id)
    await _set_app_definition_field(
        ctx,
        project_config_id,
        app_spec_version=value.strip(),
    )
    new_value = await _read_app_spec_version(ctx, project_config_id)
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )


async def _read_app_spec_path(ctx: "Context", project_config_id: ID) -> JSONValue:
    definition = await _get_app_definition(ctx, project_config_id)
    return definition.appSpecPath


async def _write_app_spec_path(
    ctx: "Context",
    project_config_id: ID,
    value: JSONValue,
) -> UISettingMutationResult:
    if not isinstance(value, str) or value.strip() == "":
        raise UISettingValidationError(
            "invalid_value_type",
            "Expected a non-empty string value.",
        )
    old_value = await _read_app_spec_path(ctx, project_config_id)
    await _set_app_definition_field(
        ctx,
        project_config_id,
        app_spec_path=value.strip(),
    )
    new_value = await _read_app_spec_path(ctx, project_config_id)
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
) -> UISettingMutationResult:
    if value not in {"auto", "dark", "light"}:
        raise UISettingValidationError(
            "invalid_value_range_or_enum",
            "Theme mode must be one of: auto, dark, light.",
        )
    old_value = await _read_app_theme_mode(ctx, project_config_id)
    definition = await _get_app_definition(ctx, project_config_id)
    theme_payload: dict[str, JSONValue]
    if isinstance(definition.theme, dict):
        theme_payload = dict(definition.theme)
    else:
        theme_payload = {}
    theme_payload["mode"] = value
    await _set_app_definition_field(
        ctx,
        project_config_id,
        theme=theme_payload,
    )
    new_value = await _read_app_theme_mode(ctx, project_config_id)
    return UISettingMutationResult(
        oldValue=old_value,
        newValue=new_value,
        normalizedValue=new_value,
        changed=old_value != new_value,
    )
