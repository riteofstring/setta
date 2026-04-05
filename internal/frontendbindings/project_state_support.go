package frontendbindings

import (
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/lspcompletion"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
)

type ShownParamIdDetails projectview.ShownParamIDDetails

type ShownParamIds projectview.ShownParamIDs

type ProjectMetadataEntry projectstate.ProjectConfigMetadata

type DeploymentType deployments.Type

type DeploymentListenerConfig deployments.ListenerConfig

type DeploymentManifest deployments.Manifest

type DeploymentMetadata httpapi.DeploymentMetadataResponse

type DeploymentMetadataList []DeploymentMetadata

type ShareDeploymentSessionResponse httpapi.ShareDeploymentSessionResponse

type AppDeploymentSessionResponse httpapi.AppDeploymentSessionResponse

type DeploymentVersionRouteParams struct {
	DeploymentName string `json:"deploymentName"`
	Version        string `json:"version"`
}

type DeploymentNameRouteParams struct {
	DeploymentName string `json:"deploymentName"`
}

type AppDeploymentStateResponse httpapi.AppDeploymentStateResponse

type LoadProjectConfigRequestInput httpapi.ProjectLoadRequest

type SaveProjectRequestInput httpapi.ManualSaveRequest

type SaveAsNewProjectConfigRequestInput httpapi.SaveAsNewProjectConfigRequest

type CreateProjectConfigRequestInput httpapi.CreateProjectConfigRequest

type CreateProjectConfigResponse string

type DeleteProjectConfigsRequestInput httpapi.DeleteProjectConfigsRequest

type DeleteProjectConfigsResponse httpapi.DeleteProjectConfigsResponse

type SetProjectConfigNameRequestInput httpapi.SetProjectConfigNameRequest

type SetAsDefaultProjectRequestInput httpapi.SetDefaultProjectConfigRequest

type GetNotificationsRequestInput httpapi.GetNotificationsRequest

type DeleteNotificationRequestInput httpapi.DeleteNotificationRequest

type DeleteNotificationResponse httpapi.DeleteNotificationResponse

type DocstringToMarkdownResponse string

type AgenticSummaryCacheStatus struct {
	MaxSummariesPerRun     int      `json:"maxSummariesPerRun"`
	SummarySectionIDs      []string `json:"summarySectionIds"`
	CachedSectionIDs       []string `json:"cachedSectionIds"`
	MissingSectionIDs      []string `json:"missingSectionIds"`
	EmptySourceSectionIDs  []string `json:"emptySourceSectionIds"`
	ConsideredSectionIDs   []string `json:"consideredSectionIds"`
	WouldAttemptSectionIDs []string `json:"wouldAttemptSectionIds"`
}

type CodeMirrorCompletionResponse []lspcompletion.CodeMirrorCompletion

type CreateNewSectionVariantRequestInput httpapi.CreateNewSectionVariantRequest

type SetSectionVariantRequestInput httpapi.SetSectionVariantRequest

type SetDefaultSectionVariantRequestInput httpapi.SetDefaultSectionVariantRequest

type SetSectionVariantSortOrderRequestInput httpapi.SetSectionVariantSortOrderRequest

type ToggleVariantFrozenRequestInput httpapi.ToggleVariantFrozenRequest

type ToggleVariantJSONSourceRequestInput httpapi.ToggleVariantJSONSourceRequest

type SetVariantJSONSourceKeysRequestInput httpapi.SetVariantJSONSourceKeysRequest

type SetSectionVariantNameRequestInput httpapi.SetSectionVariantNameRequest

type CreateChildSectionsRequestInput struct {
	FrontendOpID    *string                          `json:"frontendOpId,omitempty"`
	ProjectConfigID string                           `json:"projectConfigId"`
	ParentID        string                           `json:"parentId"`
	ImplType        projectstate.FrontendSectionType `json:"implType"`
	NumChildren     int                              `json:"numChildren"`
	StartIdx        *int                             `json:"startIdx,omitempty"`
}

type CreateChildSectionsViaIncrementerRequestInput struct {
	FrontendOpID    *string                          `json:"frontendOpId,omitempty"`
	ProjectConfigID string                           `json:"projectConfigId"`
	CalledBy        string                           `json:"calledBy"`
	ImplType        projectstate.FrontendSectionType `json:"implType"`
	NumChildren     int                              `json:"numChildren"`
}

type DeleteChildSectionsViaDecrementerRequestInput httpapi.DeleteChildSectionsViaDecrementerRequest

type DeleteSectionsRequestInput httpapi.DeleteSectionsRequest

type DeleteSelectedParamsRequestInput httpapi.DeleteSelectedParamsRequest

type PrepareSectionsForCopyRequestInput httpapi.PrepareSectionsForCopyRequest

type PasteSectionsRequestInput httpapi.PasteSectionsRequest

type CreateEdgeRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	SourceSectionID string         `json:"sourceSectionId"`
	SourceVariantID string         `json:"sourceVariantId"`
	SourcePortID    string         `json:"sourcePortId"`
	TargetSectionID string         `json:"targetSectionId"`
	TargetVariantID string         `json:"targetVariantId"`
	TargetPortID    string         `json:"targetPortId"`
	Type            *string        `json:"type,omitempty"`
	Label           *string        `json:"label,omitempty"`
	Style           map[string]any `json:"style,omitempty"`
	Animated        *bool          `json:"animated,omitempty"`
	Hidden          *bool          `json:"hidden,omitempty"`
	ZIndex          *int           `json:"zIndex,omitempty"`
	Data            map[string]any `json:"data,omitempty"`
}

type UpdateEdgeRequestInput httpapi.UpdateEdgeRequest

type DeleteEdgesRequestInput httpapi.DeleteEdgesRequest

type ReconnectEdgeRequestInput httpapi.ReconnectEdgeRequest

type SetEdgesRequestInput httpapi.SetEdgesRequest

type CreateStateMachineEdgeRequestInput struct {
	FrontendOpID                   *string                                                  `json:"frontendOpId,omitempty"`
	ProjectConfigID                string                                                   `json:"projectConfigId"`
	ID                             *string                                                  `json:"id,omitempty"`
	MachineGroupID                 string                                                   `json:"machineGroupId"`
	SourceSectionID                string                                                   `json:"sourceSectionId"`
	SourcePortID                   string                                                   `json:"sourcePortId"`
	TargetSectionID                string                                                   `json:"targetSectionId"`
	TargetPortID                   string                                                   `json:"targetPortId"`
	SourceFilter                   *projectstate.StateMachineSourceFilter                   `json:"sourceFilter,omitempty"`
	SourceActivationCountCondition *projectstate.StateMachineSourceActivationCountCondition `json:"sourceActivationCountCondition,omitempty"`
	TargetAction                   *projectstate.StateMachineTargetAction                   `json:"targetAction,omitempty"`
	Style                          map[string]any                                           `json:"style,omitempty"`
	Hidden                         *bool                                                    `json:"hidden,omitempty"`
	ZIndex                         *int                                                     `json:"zIndex,omitempty"`
	Selected                       *bool                                                    `json:"selected,omitempty"`
}

type UpdateStateMachineEdgeRequestInput httpapi.UpdateStateMachineEdgeRequest

type DeleteStateMachineEdgesRequestInput httpapi.DeleteStateMachineEdgesRequest

type SetStateMachineEdgesRequestInput httpapi.SetStateMachineEdgesRequest

type CreateAgenticEdgeRequestInput struct {
	FrontendOpID    *string                 `json:"frontendOpId,omitempty"`
	ProjectConfigID string                  `json:"projectConfigId"`
	ID              *string                 `json:"id,omitempty"`
	SourceSectionID string                  `json:"sourceSectionId"`
	TargetSectionID string                  `json:"targetSectionId"`
	Kind            AgenticEdgeKind         `json:"kind"`
	ContextMode     *AgenticEdgeContextMode `json:"contextMode,omitempty"`
	Style           map[string]any          `json:"style,omitempty"`
	Hidden          *bool                   `json:"hidden,omitempty"`
	ZIndex          *int                    `json:"zIndex,omitempty"`
}

type UpdateAgenticEdgeRequestInput httpapi.UpdateAgenticEdgeRequest

type DeleteAgenticEdgesRequestInput httpapi.DeleteAgenticEdgesRequest

type SetAgenticEdgesRequestInput httpapi.SetAgenticEdgesRequest

type MoveSectionsRequestInput httpapi.MoveSectionsRequest

type MoveParamGroup httpapi.MoveParamGroupRequest

type MoveParamsRequestInput httpapi.MoveParamsRequest

type MoveParamGroupsRequestInput httpapi.MoveParamGroupsRequest

type IndentParamsRequestInput httpapi.IndentParamsRequest

type UnindentParamsRequestInput httpapi.UnindentParamsRequest

type AddKwargRequestInput httpapi.AddKwargRequest

type DeleteKwargRequestInput httpapi.DeleteKwargRequest

type SetParamEnteredValueRequestInput httpapi.SetParamEnteredValueRequest

type UpdateParamImplConfigRequestInput httpapi.UpdateParamImplConfigRequest

type SetCodeSectionAttachedTerminalRequestInput httpapi.SetCodeSectionAttachedTerminalRequest

type SetGenCodePrefixRequestInput httpapi.SetGenCodePrefixRequest

type SetGenCodeSuffixRequestInput httpapi.SetGenCodeSuffixRequest

type SetCodeObjNameRequestInput httpapi.SetCodeObjNameRequest

type SetCodeObjDisplayNameRequestInput httpapi.SetCodeObjDisplayNameRequest

type BackgroundVariant string

type SelectionMode string

type PanOnScrollMode string

type MetaControlSizeMode string

type SectionSizeMode string

type SharePolicy deployments.Policy

type SaveSettingsRequestInput struct {
	Settings settingsstate.FrontendSettingsState `json:"settings"`
}

type CreateTopLevelSectionRequestInput httpapi.CreateTopLevelSectionRequest

type CreateViewModeRequestInput httpapi.CreateViewModeRequest

type SetActiveViewModeRequestInput httpapi.SetActiveViewModeRequest

type ToggleIsEditingViewModeRequestInput httpapi.ToggleIsEditingViewModeRequest

type ToggleViewModeUserFacingRequestInput httpapi.ToggleViewModeUserFacingRequest

type ToggleViewModeTabRequestInput httpapi.ToggleViewModeTabRequest

type SetViewModeNameRequestInput httpapi.SetViewModeNameRequest

type SetViewModeSortOrderRequestInput httpapi.SetViewModeSortOrderRequest

type DeleteViewModeRequestInput httpapi.DeleteViewModeRequest

type SetSectionNameRequestInput httpapi.SetSectionNameRequest

type AcceptRenameRefactorRequestInput httpapi.AcceptRenameRefactorRequest

type DeclineRenameRefactorRequestInput httpapi.DeclineRenameRefactorRequest

type ToggleSectionVisibilityRequestInput httpapi.ToggleSectionVisibilityRequest

type AutoLayoutTopLevelSectionsRequestInput httpapi.AutoLayoutTopLevelSectionsRequest

type SetShowParamDisplayNamesRequestInput httpapi.SetShowParamDisplayNamesRequest

type TogglePositionLocksRequestInput httpapi.TogglePositionLocksRequest

type ToggleMinimizedRequestInput httpapi.ToggleMinimizedRequest

type SetSectionTagColorRequestInput httpapi.SetSectionTagColorRequest

type SetSectionStyleColorRequestInput httpapi.SetSectionStyleColorRequest

type GetLatestProjectStateRequestInput httpapi.GetLatestProjectStateRequest

type UndoRequestInput httpapi.UndoRequest

type RedoRequestInput httpapi.RedoRequest

type SetCallableRequestInput httpapi.SetCallableRequest

type SetCodeRequestInput httpapi.SetCodeRequest

type FormatCodeRequestInput httpapi.FormatCodeRequest

type SetCallableHideParamsRequestInput httpapi.SetCallableHideParamsRequest

type SetSectionHideUnpinnedParamsRequestInput httpapi.SetSectionHideUnpinnedParamsRequest

type SetSectionPinnedParamsRequestInput httpapi.SetSectionPinnedParamsRequest

type SetProjectConfigCodegenTargetsRequestInput struct {
	FrontendOpID    *string                            `json:"frontendOpId,omitempty"`
	ProjectConfigID string                             `json:"projectConfigId"`
	CodegenTargets  []projectview.ProjectCodegenTarget `json:"codegenTargets"`
}

type SetChatSectionSettingsRequestInput httpapi.SetChatSectionSettingsRequest

type SetStateMachineSectionSettingsRequestInput httpapi.SetStateMachineSectionSettingsRequest

type SetWatchCodeEnabledRequestInput httpapi.SetWatchCodeEnabledRequest

type SetWatchCodeInputsRequestInput httpapi.SetWatchCodeInputsRequest

type GroupSectionsRequestInput httpapi.GroupSectionsRequest

type UngroupGroupsRequestInput httpapi.UngroupGroupsRequest

type SetSectionSizesRequestInput struct {
	FrontendOpID    *string                             `json:"frontendOpId,omitempty"`
	ProjectConfigID string                              `json:"projectConfigId"`
	SectionSizes    map[string]projectstate.SectionSize `json:"sectionSizes"`
}

type ToggleParamSelectedRequestInput httpapi.ToggleParamSelectedRequest

type UnselectAllParamsRequestInput httpapi.UnselectAllParamsRequest

type BuiltinCodeLanguage struct{}

type BaseChartSettingsUnion struct{}

type AgenticEdgeKind string

type AgenticEdgeContextMode string

type CodeFileBindingUpdate httpapi.CodeFileBindingUpdate

type ViewModeConfig projectstate.ViewMode

type JSONValue struct{}

type MessageContent struct{}

type BaseChatMessageUnion struct{}

type UserDefaultChatSectionImpl struct{}

type UserDefaultBrowserSectionImpl struct{}

type UserDefaultListRootSectionImpl struct{}

type UserDefaultGroupSectionImpl struct{}

type UserDefaultStateMachineStartSectionImpl struct{}

type UserDefaultStateMachineGateSectionImpl struct{}

type UserDefaultStateMachineEndSectionImpl struct{}

type UserDefaultTextBlockSectionImpl struct{}

type UserDefaultPromptSectionImpl struct{}

type UserDefaultCodeSectionImpl struct{}

type UserDefaultTerminalSectionImpl struct{}

type BaseSectionImplUnion struct{}

type BaseParentSectionImplUnion struct{}

type BaseSectionWithParamsImplUnion struct{}

type UserDefaultCallableSectionImpl struct{}

type UserDefaultDictSectionImpl struct{}

type BaseDictSectionImplUnion struct{}

type BaseCodeObjImplUnion struct{}

type BaseChildlessCodeObjImplUnion struct{}

type BaseParamCodeObjImplUnion struct{}

type BaseParentCodeObjImplUnion struct{}

type UserDefaultCodeParamCodeObjImpl struct{}

type UserDefaultTaskBoardSectionImpl struct{}

type UserDefaultChartSectionImpl struct{}

type UserDefaultSpreadsheetSectionImpl struct{}

type SetSectionParamFilterRequestInput httpapi.SetSectionParamFilterRequest

type SetMetaControlShowSectionTitleRequestInput httpapi.SetMetaControlShowSectionTitleRequest

type SetSectionColumnWidthRequestInput httpapi.SetSectionColumnWidthRequest

type SetSectionEdgeInputsRequestInput httpapi.SetSectionEdgeInputsRequest

type SetSectionEdgeOutputsRequestInput httpapi.SetSectionEdgeOutputsRequest

type SetParentDefaultChildSectionTypeRequestInput struct {
	FrontendOpID            *string                          `json:"frontendOpId,omitempty"`
	ProjectConfigID         string                           `json:"projectConfigId"`
	SectionID               string                           `json:"sectionId"`
	DefaultChildSectionType projectstate.FrontendSectionType `json:"defaultChildSectionType"`
}

type SetListRootViewModeRequestInput httpapi.SetListRootViewModeRequest

type ToggleGroupOrientationRequestInput httpapi.ToggleGroupOrientationRequest

type SetGroupOverflowModeRequestInput httpapi.SetGroupOverflowModeRequest

type SetBrowserColumnWidthsRequestInput httpapi.SetBrowserColumnWidthsRequest

type SetBrowserAreaViewModeRequestInput httpapi.SetBrowserAreaViewModeRequest

type SetBrowserHideColumnRequestInput httpapi.SetBrowserHideColumnRequest

type SetBrowserSavedSearchesRequestInput httpapi.SetBrowserSavedSearchesRequest

type SetSpreadsheetFilePathRequestInput httpapi.SetSpreadsheetFilePathRequest

type SetSpreadsheetSectionSettingsRequestInput httpapi.SetSpreadsheetSectionSettingsRequest

type SetTaskBoardSectionStateRequestInput httpapi.SetTaskBoardSectionStateRequest

type SetImageAreaImagePathRequestInput httpapi.SetImageAreaImagePathRequest

type SetSocialURLRequestInput httpapi.SetSocialURLRequest

type AppendDrawAreaLayerItemRequestInput httpapi.AppendDrawAreaLayerItemRequest

type SetChartAreaDataPathRequestInput httpapi.SetChartAreaDataPathRequest

type SetChartTypeRequestInput httpapi.SetChartTypeRequest

type SetChartSettingsRequestInput struct {
	FrontendOpID    *string                `json:"frontendOpId,omitempty"`
	ProjectConfigID string                 `json:"projectConfigId"`
	SectionID       string                 `json:"sectionId"`
	ChartSettings   BaseChartSettingsUnion `json:"chartSettings"`
	ChangedSettings []string               `json:"changedSettings"`
}

type SetTextBlockTextRequestInput httpapi.SetTextBlockTextRequest

type SetTextBlockDisplayModeRequestInput httpapi.SetTextBlockDisplayModeRequest

type SetTextBlockFormatRequestInput httpapi.SetTextBlockFormatRequest

type SetTextBlockHeadingAsSectionNameRequestInput httpapi.SetTextBlockHeadingAsSectionNameRequest

type SetTextBlockMetaControlStyleRequestInput httpapi.SetTextBlockMetaControlStyleRequest

type SetTextBlockMasterFontSizeRequestInput httpapi.SetTextBlockMasterFontSizeRequest

type SetCodeFileBindingRequestInput httpapi.SetCodeFileBindingRequest

type ViewportInput projectstate.Viewport

type ViewportBoundsInput projectstate.ViewportBounds

type TopLevelSectionLayoutInput projectstate.TopLevelSectionLayout

type SetTopLevelSectionLayoutRequestInput httpapi.SetTopLevelSectionLayoutRequest

type SetViewportRequestInput httpapi.SetViewportRequest

type SetActiveIDsRequestInput httpapi.SetActiveIDsRequest

type generatedTypeSetSpec struct {
	Name     string
	TypeExpr string
	Members  []string
	Exported bool
}

type generatedTypeGuardSpec struct {
	Name           string
	InputTypeExpr  string
	ReturnTypeExpr string
	TypeSetName    string
}

var projectStateTypeGuardTypeSets = []generatedTypeSetSpec{
	{
		Name:     "BaseChildlessCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.TimeParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParamCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.ButtonParam",
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.NestedParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.TimeParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParentCodeObjImplTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeCallable",
			"CodeObjTypeEnum.NestedParam",
		},
	},
	{
		Name:     "ControlCodeObjTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.ButtonParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.DropzoneParam",
		},
		Exported: true,
	},
	{
		Name:     "SectionParamCodeObjTypeSet",
		TypeExpr: "CodeObjType",
		Members: []string{
			"CodeObjTypeEnum.CodeParam",
			"CodeObjTypeEnum.TextParam",
			"CodeObjTypeEnum.DateParam",
			"CodeObjTypeEnum.TimeParam",
			"CodeObjTypeEnum.TextAreaParam",
			"CodeObjTypeEnum.SliderParam",
			"CodeObjTypeEnum.RotaryParam",
			"CodeObjTypeEnum.SwitchParam",
			"CodeObjTypeEnum.ColorPickerParam",
			"CodeObjTypeEnum.DropdownParam",
			"CodeObjTypeEnum.PasswordParam",
			"CodeObjTypeEnum.DropzoneParam",
			"CodeObjTypeEnum.NestedParam",
		},
		Exported: true,
	},
	{
		Name:     "BaseParentSectionImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Code",
			"SectionTypeEnum.GenPythonCode",
			"SectionTypeEnum.GenPythonMetadata",
			"SectionTypeEnum.Group",
			"SectionTypeEnum.ListRoot",
		},
	},
	{
		Name:     "BaseDictSectionImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Dict",
			"SectionTypeEnum.GlobalVariables",
		},
	},
	{
		Name:     "BaseSectionWithParamsImplTypeSet",
		TypeExpr: "SectionType",
		Members: []string{
			"SectionTypeEnum.Callable",
			"SectionTypeEnum.Dict",
			"SectionTypeEnum.GlobalVariables",
		},
	},
}

var projectStateTypeGuards = []generatedTypeGuardSpec{
	{
		Name:           "isBaseChildlessCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseChildlessCodeObjImplUnion",
		TypeSetName:    "BaseChildlessCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParamCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseParamCodeObjImplUnion",
		TypeSetName:    "BaseParamCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParentCodeObjImpl",
		InputTypeExpr:  "BaseCodeObjImplUnion",
		ReturnTypeExpr: "BaseParentCodeObjImplUnion",
		TypeSetName:    "BaseParentCodeObjImplTypeSet",
	},
	{
		Name:           "isBaseParentSectionImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseParentSectionImplUnion",
		TypeSetName:    "BaseParentSectionImplTypeSet",
	},
	{
		Name:           "isBaseDictSectionImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseDictSectionImplUnion",
		TypeSetName:    "BaseDictSectionImplTypeSet",
	},
	{
		Name:           "isBaseSectionWithParamsImpl",
		InputTypeExpr:  "BaseSectionImplUnion",
		ReturnTypeExpr: "BaseSectionWithParamsImplUnion",
		TypeSetName:    "BaseSectionWithParamsImplTypeSet",
	},
}

func projectStateTypeGuardDeclarations() []TypeDeclaration {
	declarations := make([]TypeDeclaration, 0, len(projectStateTypeGuardTypeSets)+len(projectStateTypeGuards))
	for _, spec := range projectStateTypeGuardTypeSets {
		declarations = append(
			declarations,
			setDeclaration(spec.Name, spec.TypeExpr, spec.Exported, spec.Members...),
		)
	}
	for _, spec := range projectStateTypeGuards {
		declarations = append(
			declarations,
			typeGuardDeclaration(spec.Name, spec.InputTypeExpr, spec.ReturnTypeExpr, spec.TypeSetName),
		)
	}
	return declarations
}

func buildDefaultSharePolicyCreateExprTS() string {
	return buildSharePolicyCreateExprTS(deployments.DefaultPolicy())
}

func buildSharePolicyCreateExprTS(policy deployments.Policy) string {
	return buildTSMergeGeneratedOptionsExprFromGoValueTS(
		"frontend share policy defaults",
		policy,
		goJSONFieldOrder(policy),
		"options",
		"SharePolicy",
	)
}

func defaultAppPolicyDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
		"createDefaultAppPolicy",
		"SharePolicy",
		buildDefaultAppPolicyFunctionBodyTS(),
		TypeProperty{Name: "options", TypeExpr: "Partial<SharePolicy>", DefaultValue: "{}"},
	)
}

func buildDefaultAppPolicyFunctionBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyFromGoValueTS(
		"frontend default app policy",
		deployments.DefaultAppPolicy(),
		goJSONFieldOrder(deployments.Policy{}),
		"options",
		"SharePolicy",
	)
}

func projectStateSupportDeclarations() []TypeDeclaration {
	declarations := []TypeDeclaration{
		aliasDeclaration(
			"ImplArgsBundleMap",
			`{
  BaseSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  BaseSectionWithParams: {
    impl: BaseSectionWithParamsImplUnion;
    args: {
      [K in keyof BaseSectionWithParamsImplUnion]?: BaseSectionWithParamsImplUnion[K] | ((prev: BaseSectionWithParamsImplUnion[K]) => BaseSectionWithParamsImplUnion[K]);
    };
  };
  BaseParentSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  BaseCodeSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  ChatSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  CodeSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  GroupSection: {
    impl: GroupSectionImpl;
    args: {
      [K in keyof GroupSectionImpl]?: GroupSectionImpl[K] | ((prev: GroupSectionImpl[K]) => GroupSectionImpl[K]);
    };
  };
  ListRootSection: {
    impl: BaseParentSectionImplUnion;
    args: {
      [K in keyof BaseParentSectionImplUnion]?: BaseParentSectionImplUnion[K] | ((prev: BaseParentSectionImplUnion[K]) => BaseParentSectionImplUnion[K]);
    };
  };
  BrowserSection: {
    impl: BrowserSectionImpl;
    args: {
      [K in keyof BrowserSectionImpl]?: BrowserSectionImpl[K] | ((prev: BrowserSectionImpl[K]) => BrowserSectionImpl[K]);
    };
  };
  TextBlockSection: {
    impl: BaseSectionImplUnion;
    args: {
      [K in keyof BaseSectionImplUnion]?: BaseSectionImplUnion[K] | ((prev: BaseSectionImplUnion[K]) => BaseSectionImplUnion[K]);
    };
  };
  PromptSection: {
    impl: PromptSectionImpl;
    args: {
      [K in keyof PromptSectionImpl]?: PromptSectionImpl[K] | ((prev: PromptSectionImpl[K]) => PromptSectionImpl[K]);
    };
  };
  BaseDictSection: {
    impl: BaseDictSectionImplUnion;
    args: {
      [K in keyof BaseDictSectionImplUnion]?: BaseDictSectionImplUnion[K] | ((prev: BaseDictSectionImplUnion[K]) => BaseDictSectionImplUnion[K]);
    };
  };
  BaseChildlessCodeObj: {
    impl: BaseChildlessCodeObjImplUnion;
    args: {
      [K in keyof BaseChildlessCodeObjImplUnion]?: BaseChildlessCodeObjImplUnion[K] | ((prev: BaseChildlessCodeObjImplUnion[K]) => BaseChildlessCodeObjImplUnion[K]);
    };
  };
  BaseCodeObj: {
    impl: BaseCodeObjImplUnion;
    args: {
      [K in keyof BaseCodeObjImplUnion]?: BaseCodeObjImplUnion[K] | ((prev: BaseCodeObjImplUnion[K]) => BaseCodeObjImplUnion[K]);
    };
  };
}`,
		),
		defaultAppPolicyDeclaration(),
	}
	declarations = append(declarations, projectStateTypeGuardDeclarations()...)
	return declarations
}
