from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

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
    ctx: "Context",  # noqa: ARG001 - plugin registry integration is follow-up work
    project_config_id: ID,  # noqa: ARG001 - plugin registry integration is follow-up work
) -> list[UISettingRuntimeEntry]:
    return []


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
