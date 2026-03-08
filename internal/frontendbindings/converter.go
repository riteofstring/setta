package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"
	"time"
)

var timeType = reflect.TypeOf(time.Time{})

type TypeDeclaration struct {
	Name       string
	Kind       string
	Alias      string
	Properties []TypeProperty
	EnumValues []EnumValue
	Raw        string
}

type EnumValue struct {
	Name  string
	Value string
}

type TypeProperty struct {
	Name     string
	TypeExpr string
	Optional bool
}

func objectDeclaration(name string, properties ...TypeProperty) TypeDeclaration {
	return TypeDeclaration{
		Name:       name,
		Kind:       "object",
		Properties: properties,
	}
}

type typeConverter struct {
	declarations []TypeDeclaration
	seen         map[reflect.Type]struct{}
	stringEnums  map[reflect.Type][]EnumValue
	manualTypes  map[reflect.Type]TypeDeclaration
}

func newTypeConverter() *typeConverter {
	return &typeConverter{
		seen: make(map[reflect.Type]struct{}),
		stringEnums: map[reflect.Type][]EnumValue{
			reflect.TypeOf(DependencyKeyType("")): {
				{Name: "Section", Value: "Section"},
				{Name: "SectionParam", Value: "SectionParam"},
			},
			reflect.TypeOf(DependencyValueType("")): {
				{Name: "Literal", Value: "Literal"},
				{Name: "Binary", Value: "Binary"},
				{Name: "FileRead", Value: "FileRead"},
			},
			reflect.TypeOf(ServerMode("")): {
				{Name: "IDE", Value: "ide"},
				{Name: "Share", Value: "share"},
				{Name: "App", Value: "app"},
				{Name: "Launcher", Value: "launcher"},
			},
			reflect.TypeOf(LaunchSettaFilesLocation("")): {
				{Name: "Auto", Value: "auto"},
				{Name: "Local", Value: "local"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(LaunchResolvedSettaFilesLocation("")): {
				{Name: "Local", Value: "local"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(LauncherOpenMode("")): {
				{Name: "Browser", Value: "browser"},
				{Name: "ChromeApp", Value: "chrome-app"},
			},
			reflect.TypeOf(LauncherWorkspaceBehavior("")): {
				{Name: "LastUsedOrPrompt", Value: "last_used_or_prompt"},
				{Name: "AlwaysPrompt", Value: "always_prompt"},
			},
			reflect.TypeOf(SetupLauncherWorkspaceBehavior("")): {
				{Name: "LastUsedOrPrompt", Value: "last-used-or-prompt"},
				{Name: "AlwaysPrompt", Value: "always-prompt"},
			},
			reflect.TypeOf(LauncherInstallSource("")): {
				{Name: "UVTool", Value: "uv-tool"},
				{Name: "InstallerManaged", Value: "installer-managed"},
				{Name: "Unsupported", Value: "unsupported"},
			},
			reflect.TypeOf(LauncherUpdateCapability("")): {
				{Name: "InApp", Value: "in_app"},
				{Name: "InstallerManaged", Value: "installer_managed"},
				{Name: "Unsupported", Value: "unsupported"},
			},
			reflect.TypeOf(AppCatalogPropType("")): {
				{Name: "String", Value: "string"},
				{Name: "Number", Value: "number"},
				{Name: "Dimension", Value: "dimension"},
				{Name: "Boolean", Value: "boolean"},
			},
			reflect.TypeOf(PluginScope("")): {
				{Name: "Workspace", Value: "workspace"},
				{Name: "SettaFiles", Value: "setta_files"},
				{Name: "Global", Value: "global"},
			},
			reflect.TypeOf(PluginRuntimeState("")): {
				{Name: "active", Value: "active"},
				{Name: "disabled", Value: "disabled"},
				{Name: "invalid", Value: "invalid"},
				{Name: "shadowed", Value: "shadowed"},
				{Name: "pending_restart", Value: "pending_restart"},
			},
			reflect.TypeOf(PluginEnablementSource("")): {
				{Name: "WorkspaceDisabled", Value: "workspace_disabled"},
				{Name: "WorkspaceEnabled", Value: "workspace_enabled"},
				{Name: "GlobalAutoEnabled", Value: "global_auto_enabled"},
				{Name: "ManifestDefault", Value: "manifest_default"},
			},
			reflect.TypeOf(PluginSourceManager("")): {
				{Name: "Setta", Value: "setta"},
				{Name: "PackageManager", Value: "package_manager"},
			},
			reflect.TypeOf(PluginInstallerBackend("")): {
				{Name: "Auto", Value: "auto"},
				{Name: "Pip", Value: "pip"},
				{Name: "UV", Value: "uv"},
			},
			reflect.TypeOf(PluginSourceTrustStatus("")): {
				{Name: "Unverified", Value: "unverified"},
			},
			reflect.TypeOf(PluginBlockedCapabilityReason("")): {
				{Name: "ModePolicy", Value: "mode_policy"},
				{Name: "HostPolicy", Value: "host_policy"},
				{Name: "ManifestInvalid", Value: "manifest_invalid"},
			},
			reflect.TypeOf(PluginRestartCapabilityMode("")): {
				{Name: "Manual", Value: "manual"},
				{Name: "Programmatic", Value: "programmatic"},
			},
			reflect.TypeOf(MCPServerTransport("")): {
				{Name: "sse", Value: "sse"},
				{Name: "streamable_http", Value: "streamable_http"},
				{Name: "stdio", Value: "stdio"},
			},
			reflect.TypeOf(PromptFormat("")): {
				{Name: "Jinja", Value: "Jinja"},
			},
			reflect.TypeOf(ExternalAgentToolType("")): {
				{Name: "claude_code", Value: "claude_code"},
				{Name: "codex", Value: "codex"},
				{Name: "opencode", Value: "opencode"},
				{Name: "plugin", Value: "plugin"},
			},
			reflect.TypeOf(ExternalAgentRunMode("")): {
				{Name: "mcp", Value: "mcp"},
				{Name: "server", Value: "server"},
				{Name: "sdk", Value: "sdk"},
				{Name: "app_server", Value: "app_server"},
			},
			reflect.TypeOf(ExternalAgentSettingsMode("")): {
				{Name: "read_only", Value: "read_only"},
				{Name: "managed_local", Value: "managed_local"},
				{Name: "managed_project", Value: "managed_project"},
				{Name: "explicit_path", Value: "explicit_path"},
			},
			reflect.TypeOf(ExternalAgentWorkingDirStrategy("")): {
				{Name: "project_root", Value: "project_root"},
				{Name: "temp_dir", Value: "temp_dir"},
				{Name: "custom", Value: "custom"},
			},
			reflect.TypeOf(ClaudeSettingsSource("")): {
				{Name: "user", Value: "user"},
				{Name: "project", Value: "project"},
				{Name: "local", Value: "local"},
			},
			reflect.TypeOf(SettaNotificationType("")): {
				{Name: "error", Value: "error"},
				{Name: "warning", Value: "warning"},
				{Name: "info", Value: "info"},
				{Name: "save", Value: "save"},
			},
			reflect.TypeOf(ArtifactType("")): {
				{Name: "Image", Value: "Image"},
				{Name: "BrushStroke", Value: "BrushStroke"},
				{Name: "DrawAreaLayerItemTransform", Value: "DrawAreaLayerItemTransform"},
				{Name: "ChartData", Value: "ChartData"},
				{Name: "File", Value: "File"},
			},
			reflect.TypeOf(DrawAreaBrushShape("")): {
				{Name: "butt", Value: "butt"},
				{Name: "round", Value: "round"},
				{Name: "square", Value: "square"},
			},
			reflect.TypeOf(DrawAreaMode("")): {
				{Name: "draw", Value: "draw"},
				{Name: "erase", Value: "erase"},
				{Name: "edit", Value: "edit"},
			},
			reflect.TypeOf(ArtifactSaveConflictStrategy("")): {
				{Name: "skip", Value: "skip"},
				{Name: "backup", Value: "backup"},
				{Name: "overwrite", Value: "overwrite"},
			},
			reflect.TypeOf(ArtifactSaveStatus("")): {
				{Name: "saved", Value: "saved"},
				{Name: "unchanged", Value: "unchanged"},
				{Name: "skipped", Value: "skipped"},
				{Name: "conflict", Value: "conflict"},
			},
			reflect.TypeOf(MissingFolderBehavior("")): {
				{Name: "error", Value: "error"},
				{Name: "empty", Value: "empty"},
			},
			reflect.TypeOf(FolderContentItemType("")): {
				{Name: "folder", Value: "folder"},
				{Name: "file", Value: "file"},
			},
			reflect.TypeOf(TransferOperation("")): {
				{Name: "copy", Value: "copy"},
				{Name: "move", Value: "move"},
			},
			reflect.TypeOf(GitDiffMode("")): {
				{Name: "unstaged", Value: "unstaged"},
				{Name: "staged", Value: "staged"},
			},
		},
		manualTypes: map[reflect.Type]TypeDeclaration{
			reflect.TypeOf(SectionDependencyKey{}): {
				Name: "SectionDependencyKey",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "sectionId", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyKeyTypeEnum.Section"},
				},
			},
			reflect.TypeOf(SectionParamDependencyKey{}): {
				Name: "SectionParamDependencyKey",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "sectionId", TypeExpr: "string"},
					{Name: "codeObjId", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyKeyTypeEnum.SectionParam"},
				},
			},
			reflect.TypeOf(BaseDependencyKeyUnion{}): {
				Name:  "BaseDependencyKeyUnion",
				Kind:  "alias",
				Alias: "SectionDependencyKey | SectionParamDependencyKey",
			},
			reflect.TypeOf(LiteralDependencyValue{}): {
				Name: "LiteralDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.Literal"},
				},
			},
			reflect.TypeOf(FileReadDependencyValue{}): {
				Name: "FileReadDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "string"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.FileRead"},
				},
			},
			reflect.TypeOf(BinaryDependencyValue{}): {
				Name: "BinaryDependencyValue",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "payload", TypeExpr: "BinaryContentRef"},
					{Name: "type", TypeExpr: "typeof DependencyValueTypeEnum.Binary"},
				},
			},
			reflect.TypeOf(BaseDependencyValueUnion{}): {
				Name:  "BaseDependencyValueUnion",
				Kind:  "alias",
				Alias: "LiteralDependencyValue | FileReadDependencyValue | BinaryDependencyValue",
			},
			reflect.TypeOf(RunCodeRequestInput{}): {
				Name: "RunCodeRequestInput",
				Kind: "object",
				Properties: []TypeProperty{
					{Name: "projectConfigId", TypeExpr: "string"},
					{Name: "sectionId", TypeExpr: "string | null"},
					{Name: "terminalSectionId", TypeExpr: "string | null", Optional: true},
					{Name: "cliId", TypeExpr: "string | null", Optional: true},
					{Name: "runSnapshotMode", TypeExpr: "RunSnapshotMode | null", Optional: true},
					{Name: "drawSnapshotsBySectionId", TypeExpr: "Record<string, BinaryContentRef> | null", Optional: true},
					{Name: "sectionVariantOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
					{Name: "paramOverrides", TypeExpr: "Record<string, string> | null", Optional: true},
				},
			},
			reflect.TypeOf(ProjectStateSingleConfig{}): {
				Name: "ProjectStateSingleConfig",
				Kind: "raw",
				Raw:  projectStateFrontendSupportRawTS,
			},
			reflect.TypeOf(SectionsClipboardDataResponse{}): {
				Name:  "SectionsClipboardDataResponse",
				Kind:  "alias",
				Alias: "SectionsClipboardData",
			},
			reflect.TypeOf(AIRuntimeSupport{}): {
				Name: "AIRuntimeSupport",
				Kind: "raw",
				Raw:  aiRuntimeFrontendSupportRawTS,
			},
			reflect.TypeOf(AgentProfileResponse{}): {
				Name:  "AgentProfileResponse",
				Kind:  "alias",
				Alias: "AgentProfile",
			},
			reflect.TypeOf(AgentProfileListResponse{}): {
				Name:  "AgentProfileListResponse",
				Kind:  "alias",
				Alias: "Array<AgentProfile>",
			},
			reflect.TypeOf(AgentRunResponse{}): {
				Name:  "AgentRunResponse",
				Kind:  "alias",
				Alias: "AgentRun",
			},
			reflect.TypeOf(AgentRunListResponse{}): {
				Name:  "AgentRunListResponse",
				Kind:  "alias",
				Alias: "Array<AgentRun>",
			},
			reflect.TypeOf(EngineConfigResponse{}): {
				Name:  "EngineConfigResponse",
				Kind:  "alias",
				Alias: "EngineConfig",
			},
			reflect.TypeOf(EngineConfigListResponse{}): {
				Name:  "EngineConfigListResponse",
				Kind:  "alias",
				Alias: "Array<EngineConfig>",
			},
			reflect.TypeOf(TranscriptionProfileResponse{}): {
				Name:  "TranscriptionProfileResponse",
				Kind:  "alias",
				Alias: "TranscriptionProfile",
			},
			reflect.TypeOf(TranscriptionProfileListResponse{}): {
				Name:  "TranscriptionProfileListResponse",
				Kind:  "alias",
				Alias: "Array<TranscriptionProfile>",
			},
			reflect.TypeOf(UpdateAgentProfileRequestInput{}): {
				Name: "UpdateAgentProfileRequestInput",
				Kind: "raw",
				Raw:  updateAgentProfileRequestInputRawTS,
			},
			reflect.TypeOf(UpdateEngineConfigRequestInput{}): {
				Name: "UpdateEngineConfigRequestInput",
				Kind: "raw",
				Raw:  updateEngineConfigRequestInputRawTS,
			},
			reflect.TypeOf(CreateTranscriptionProfileRequestInput{}): {
				Name: "CreateTranscriptionProfileRequestInput",
				Kind: "raw",
				Raw:  createTranscriptionProfileRequestInputRawTS,
			},
			reflect.TypeOf(UpdateTranscriptionProfileRequestInput{}): {
				Name: "UpdateTranscriptionProfileRequestInput",
				Kind: "raw",
				Raw:  updateTranscriptionProfileRequestInputRawTS,
			},
			reflect.TypeOf(SetChatSectionStateRequestInput{}): {
				Name: "SetChatSectionStateRequestInput",
				Kind: "raw",
				Raw:  setChatSectionStateRequestInputRawTS,
			},
			reflect.TypeOf(PrepareSectionsForCopyRequestInput{}): {
				Name: "PrepareSectionsForCopyRequestInput",
				Kind: "raw",
				Raw:  prepareSectionsForCopyRequestInputRawTS,
			},
			reflect.TypeOf(PasteSectionsRequestInput{}): {
				Name: "PasteSectionsRequestInput",
				Kind: "raw",
				Raw:  pasteSectionsRequestInputRawTS,
			},
			reflect.TypeOf(CreateChildSectionsRequestInput{}): {
				Name: "CreateChildSectionsRequestInput",
				Kind: "raw",
				Raw:  createChildSectionsRequestInputRawTS,
			},
			reflect.TypeOf(CreateChildSectionsViaIncrementerRequestInput{}): {
				Name: "CreateChildSectionsViaIncrementerRequestInput",
				Kind: "raw",
				Raw:  createChildSectionsViaIncrementerRequestInputRawTS,
			},
			reflect.TypeOf(DeleteChildSectionsViaDecrementerRequestInput{}): {
				Name: "DeleteChildSectionsViaDecrementerRequestInput",
				Kind: "raw",
				Raw:  deleteChildSectionsViaDecrementerRequestInputRawTS,
			},
			reflect.TypeOf(CreateEdgeRequestInput{}): {
				Name: "CreateEdgeRequestInput",
				Kind: "raw",
				Raw:  createEdgeRequestInputRawTS,
			},
			reflect.TypeOf(UpdateEdgeRequestInput{}): {
				Name: "UpdateEdgeRequestInput",
				Kind: "raw",
				Raw:  updateEdgeRequestInputRawTS,
			},
			reflect.TypeOf(DeleteEdgesRequestInput{}): {
				Name: "DeleteEdgesRequestInput",
				Kind: "raw",
				Raw:  deleteEdgesRequestInputRawTS,
			},
			reflect.TypeOf(ReconnectEdgeRequestInput{}): {
				Name: "ReconnectEdgeRequestInput",
				Kind: "raw",
				Raw:  reconnectEdgeRequestInputRawTS,
			},
			reflect.TypeOf(SetEdgesRequestInput{}): {
				Name: "SetEdgesRequestInput",
				Kind: "raw",
				Raw:  setEdgesRequestInputRawTS,
			},
			reflect.TypeOf(CreateAgenticEdgeRequestInput{}): {
				Name: "CreateAgenticEdgeRequestInput",
				Kind: "raw",
				Raw:  createAgenticEdgeRequestInputRawTS,
			},
			reflect.TypeOf(UpdateAgenticEdgeRequestInput{}): {
				Name: "UpdateAgenticEdgeRequestInput",
				Kind: "raw",
				Raw:  updateAgenticEdgeRequestInputRawTS,
			},
			reflect.TypeOf(DeleteAgenticEdgesRequestInput{}): {
				Name: "DeleteAgenticEdgesRequestInput",
				Kind: "raw",
				Raw:  deleteAgenticEdgesRequestInputRawTS,
			},
			reflect.TypeOf(SetAgenticEdgesRequestInput{}): {
				Name: "SetAgenticEdgesRequestInput",
				Kind: "raw",
				Raw:  setAgenticEdgesRequestInputRawTS,
			},
			reflect.TypeOf(MoveSectionsRequestInput{}): {
				Name: "MoveSectionsRequestInput",
				Kind: "raw",
				Raw:  moveSectionsRequestInputRawTS,
			},
			reflect.TypeOf(SetSectionSizesRequestInput{}): {
				Name: "SetSectionSizesRequestInput",
				Kind: "raw",
				Raw:  setSectionSizesRequestInputRawTS,
			},
			reflect.TypeOf(SetSectionEdgeOutputsRequestInput{}): objectDeclaration(
				"SetSectionEdgeOutputsRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "edgeOutputPorts", TypeExpr: "Array<EdgePort>"},
			),
			reflect.TypeOf(SetParentDefaultChildSectionTypeRequestInput{}): objectDeclaration(
				"SetParentDefaultChildSectionTypeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "defaultChildSectionType", TypeExpr: "SectionType"},
			),
			reflect.TypeOf(SetListRootViewModeRequestInput{}): objectDeclaration(
				"SetListRootViewModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "ListRootViewMode"},
			),
			reflect.TypeOf(SetBrowserAreaViewModeRequestInput{}): objectDeclaration(
				"SetBrowserAreaViewModeRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "viewMode", TypeExpr: "BrowserAreaViewMode"},
			),
			reflect.TypeOf(SetBrowserSavedSearchesRequestInput{}): objectDeclaration(
				"SetBrowserSavedSearchesRequestInput",
				TypeProperty{Name: "frontendOpId", TypeExpr: "string | null", Optional: true},
				TypeProperty{Name: "projectConfigId", TypeExpr: "string"},
				TypeProperty{Name: "sectionId", TypeExpr: "string"},
				TypeProperty{Name: "savedSearches", TypeExpr: "Array<BrowserSavedSearch>"},
			),
			reflect.TypeOf(SetSpreadsheetSectionSettingsRequestInput{}): {
				Name: "SetSpreadsheetSectionSettingsRequestInput",
				Kind: "raw",
				Raw:  setSpreadsheetSectionSettingsRequestInputRawTS,
			},
			reflect.TypeOf(SetTaskBoardSectionStateRequestInput{}): {
				Name: "SetTaskBoardSectionStateRequestInput",
				Kind: "raw",
				Raw:  setTaskBoardSectionStateRequestInputRawTS,
			},
			reflect.TypeOf(AppendDrawAreaLayerItemRequestInput{}): {
				Name: "AppendDrawAreaLayerItemRequestInput",
				Kind: "raw",
				Raw:  appendDrawAreaLayerItemRequestInputRawTS,
			},
			reflect.TypeOf(SetChartTypeRequestInput{}): {
				Name: "SetChartTypeRequestInput",
				Kind: "raw",
				Raw:  setChartTypeRequestInputRawTS,
			},
			reflect.TypeOf(SetChartSettingsRequestInput{}): {
				Name: "SetChartSettingsRequestInput",
				Kind: "raw",
				Raw:  setChartSettingsRequestInputRawTS,
			},
			reflect.TypeOf(SetTextBlockDisplayModeRequestInput{}): {
				Name: "SetTextBlockDisplayModeRequestInput",
				Kind: "raw",
				Raw:  setTextBlockDisplayModeRequestInputRawTS,
			},
			reflect.TypeOf(SetTextBlockFormatRequestInput{}): {
				Name: "SetTextBlockFormatRequestInput",
				Kind: "raw",
				Raw:  setTextBlockFormatRequestInputRawTS,
			},
			reflect.TypeOf(SetCodeFileBindingRequestInput{}): {
				Name: "SetCodeFileBindingRequestInput",
				Kind: "raw",
				Raw:  setCodeFileBindingRequestInputRawTS,
			},
			reflect.TypeOf(GetLLMChatResponse{}): {
				Name: "GetLLMChatResponse",
				Kind: "raw",
				Raw:  getLLMChatResponseRawTS,
			},
			reflect.TypeOf(ExternalAgentChatResponse{}): {
				Name: "ExternalAgentChatResponse",
				Kind: "raw",
				Raw:  externalAgentChatResponseRawTS,
			},
			reflect.TypeOf(PluginListEntry{}): {
				Name: "PluginListEntry",
				Kind: "raw",
				Raw:  pluginListEntryRawTS,
			},
			reflect.TypeOf(PluginStatusEntry{}): {
				Name: "PluginStatusEntry",
				Kind: "raw",
				Raw:  pluginStatusEntryRawTS,
			},
			reflect.TypeOf(BinaryUploadRequestInput{}): {
				Name:  "BinaryUploadRequestInput",
				Kind:  "alias",
				Alias: "FormData",
			},
			reflect.TypeOf(BinaryDownloadResponse{}): {
				Name:  "BinaryDownloadResponse",
				Kind:  "alias",
				Alias: "Uint8Array",
			},
			reflect.TypeOf(CanvasPoint{}): {
				Name: "CanvasPoint",
				Kind: "raw",
				Raw:  canvasPointRawTS,
			},
			reflect.TypeOf(DrawAreaTransform{}): {
				Name: "DrawAreaTransform",
				Kind: "raw",
				Raw:  drawAreaTransformRawTS,
			},
			reflect.TypeOf(BrushStroke{}): {
				Name: "BrushStroke",
				Kind: "raw",
				Raw:  brushStrokeRawTS,
			},
			reflect.TypeOf(BrushStrokeWithTransform{}): {
				Name: "BrushStrokeWithTransform",
				Kind: "raw",
				Raw:  brushStrokeWithTransformRawTS,
			},
			reflect.TypeOf(DrawAreaLayerItemTransform{}): {
				Name: "DrawAreaLayerItemTransform",
				Kind: "raw",
				Raw:  drawAreaLayerItemTransformRawTS,
			},
			reflect.TypeOf(DrawAreaLayerItem{}): {
				Name: "DrawAreaLayerItem",
				Kind: "raw",
				Raw:  drawAreaLayerItemRawTS,
			},
			reflect.TypeOf(DrawAreaLayer{}): {
				Name: "DrawAreaLayer",
				Kind: "raw",
				Raw:  drawAreaLayerRawTS,
			},
			reflect.TypeOf(ImageArtifact{}): {
				Name: "ImageArtifact",
				Kind: "raw",
				Raw:  imageArtifactRawTS,
			},
			reflect.TypeOf(BrushStrokeArtifact{}): {
				Name: "BrushStrokeArtifact",
				Kind: "raw",
				Raw:  brushStrokeArtifactRawTS,
			},
			reflect.TypeOf(DrawAreaLayerItemTransformArtifact{}): {
				Name: "DrawAreaLayerItemTransformArtifact",
				Kind: "raw",
				Raw:  drawAreaLayerItemTransformArtifactRawTS,
			},
			reflect.TypeOf(ChartDataValue{}): {
				Name: "ChartDataValue",
				Kind: "raw",
				Raw:  chartDataValueRawTS,
			},
			reflect.TypeOf(ChartDataArtifact{}): {
				Name: "ChartDataArtifact",
				Kind: "raw",
				Raw:  chartDataArtifactRawTS,
			},
			reflect.TypeOf(FileArtifact{}): {
				Name: "FileArtifact",
				Kind: "raw",
				Raw:  fileArtifactRawTS,
			},
			reflect.TypeOf(ArtifactUnion{}): {
				Name: "ArtifactUnion",
				Kind: "raw",
				Raw:  artifactUnionRawTS,
			},
			reflect.TypeOf(UpdateArtifactMsgContent{}): {
				Name: "UpdateArtifactMsgContent",
				Kind: "raw",
				Raw:  updateArtifactMsgContentRawTS,
			},
			reflect.TypeOf(WebsocketFrontendSupport{}): {
				Name: "WebsocketFrontendSupport",
				Kind: "raw",
				Raw:  websocketFrontendSupportRawTS,
			},
		},
	}
}

func (c *typeConverter) AddRootType(root reflect.Type) error {
	if root == nil {
		return nil
	}
	_, err := c.renderTypeExpr(root)
	return err
}

func (c *typeConverter) Declarations() []TypeDeclaration {
	return c.declarations
}

func (c *typeConverter) renderTypeExpr(t reflect.Type) (string, error) {
	if t == nil {
		return "null", nil
	}
	if t == timeType {
		return "string", nil
	}
	if t.Name() != "" && t.PkgPath() != "" {
		if err := c.ensureDeclaration(t); err != nil {
			return "", err
		}
		return t.Name(), nil
	}

	switch t.Kind() {
	case reflect.Pointer:
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return "", err
		}
		return inner + " | null", nil
	case reflect.String:
		return "string", nil
	case reflect.Bool:
		return "boolean", nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number", nil
	case reflect.Slice, reflect.Array:
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Array<%s>", inner), nil
	case reflect.Map:
		keyExpr, err := c.renderMapKeyExpr(t.Key())
		if err != nil {
			return "", err
		}
		valueExpr, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Record<%s, %s>", keyExpr, valueExpr), nil
	case reflect.Struct:
		properties, err := c.structProperties(t)
		if err != nil {
			return "", err
		}
		return renderInlineObject(properties), nil
	case reflect.Interface:
		return "unknown", nil
	default:
		if t.Name() != "" && t.PkgPath() != "" {
			if err := c.ensureDeclaration(t); err != nil {
				return "", err
			}
			return t.Name(), nil
		}
		return "", fmt.Errorf("unsupported Go type for TS conversion: %s", t.String())
	}
}

func (c *typeConverter) ensureDeclaration(t reflect.Type) error {
	if t == nil || t.PkgPath() == "" || t == timeType {
		return nil
	}
	if _, ok := c.seen[t]; ok {
		return nil
	}
	c.seen[t] = struct{}{}

	if decl, ok := c.manualTypes[t]; ok {
		c.declarations = append(c.declarations, decl)
		return nil
	}

	if values, ok := c.stringEnums[t]; ok {
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       t.Name(),
			Kind:       "enum",
			EnumValues: values,
		})
		return nil
	}

	switch t.Kind() {
	case reflect.Struct:
		properties, err := c.structProperties(t)
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:       t.Name(),
			Kind:       "object",
			Properties: properties,
		})
		return nil
	case reflect.String:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "string",
		})
		return nil
	case reflect.Bool:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "boolean",
		})
		return nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: "number",
		})
		return nil
	case reflect.Slice, reflect.Array:
		inner, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: fmt.Sprintf("Array<%s>", inner),
		})
		return nil
	case reflect.Map:
		keyExpr, err := c.renderMapKeyExpr(t.Key())
		if err != nil {
			return err
		}
		valueExpr, err := c.renderTypeExpr(t.Elem())
		if err != nil {
			return err
		}
		c.declarations = append(c.declarations, TypeDeclaration{
			Name:  t.Name(),
			Kind:  "alias",
			Alias: fmt.Sprintf("Record<%s, %s>", keyExpr, valueExpr),
		})
		return nil
	default:
		return fmt.Errorf("unsupported named Go type for TS declaration: %s", t.String())
	}
}

func (c *typeConverter) structProperties(t reflect.Type) ([]TypeProperty, error) {
	properties := make([]TypeProperty, 0, t.NumField())
	for i := range t.NumField() {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		name, optional, skip := jsonFieldName(field)
		if skip {
			continue
		}
		typeExpr, err := c.renderTypeExpr(field.Type)
		if err != nil {
			return nil, fmt.Errorf("%s.%s: %w", t.Name(), field.Name, err)
		}
		properties = append(properties, TypeProperty{
			Name:     name,
			TypeExpr: typeExpr,
			Optional: optional,
		})
	}
	return properties, nil
}

func (c *typeConverter) renderMapKeyExpr(t reflect.Type) (string, error) {
	if t.Kind() == reflect.Pointer {
		return c.renderMapKeyExpr(t.Elem())
	}
	switch t.Kind() {
	case reflect.String:
		return "string", nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
		reflect.Float32, reflect.Float64:
		return "number", nil
	case reflect.Bool:
		return "boolean", nil
	default:
		return "", fmt.Errorf("unsupported map key type for TS conversion: %s", t.String())
	}
}

func jsonFieldName(field reflect.StructField) (name string, optional bool, skip bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", false, true
	}
	if tag == "" {
		return lowerCamelCase(field.Name), false, false
	}
	parts := strings.Split(tag, ",")
	name = strings.TrimSpace(parts[0])
	if name == "" {
		name = lowerCamelCase(field.Name)
	}
	for _, part := range parts[1:] {
		if strings.TrimSpace(part) == "omitempty" {
			optional = true
		}
	}
	return name, optional, false
}

func lowerCamelCase(value string) string {
	if value == "" {
		return value
	}
	return strings.ToLower(value[:1]) + value[1:]
}

func renderInlineObject(properties []TypeProperty) string {
	if len(properties) == 0 {
		return "Record<string, never>"
	}
	lines := make([]string, 0, len(properties)+2)
	lines = append(lines, "{")
	for _, property := range properties {
		optional := ""
		if property.Optional {
			optional = "?"
		}
		lines = append(lines, fmt.Sprintf("  %s%s: %s;", property.Name, optional, property.TypeExpr))
	}
	lines = append(lines, "}")
	return strings.Join(lines, "\n")
}
