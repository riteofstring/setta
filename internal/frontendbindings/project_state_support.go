package frontendbindings

type ProjectStateSingleConfig struct{}

type ProjectMetadataEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type AllProjectMetadata struct {
	DefaultProjectConfigID *string                `json:"defaultProjectConfigId"`
	ProjectMetadata        []ProjectMetadataEntry `json:"projectMetadata"`
}

type LoadProjectConfigRequestInput struct {
	ProjectConfigName string `json:"projectConfigName"`
}

type CreateProjectConfigRequestInput struct {
	PreviewImgColor string `json:"previewImgColor"`
}

type CreateProjectConfigResponse string

type DeleteSectionsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type DeleteSelectedParamsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionID       string   `json:"sectionId"`
	ParamInfoIDs    []string `json:"paramInfoIds"`
}

type GroupSectionsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	SectionIDs      []string `json:"sectionIds"`
}

type UngroupGroupsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	GroupIDs        []string `json:"groupIds"`
}

type ToggleParamSelectedRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
	SectionID       string  `json:"sectionId"`
	ParamInfoID     string  `json:"paramInfoId"`
}

type UnselectAllParamsRequestInput struct {
	FrontendOpID    *string `json:"frontendOpId,omitempty"`
	ProjectConfigID string  `json:"projectConfigId"`
}

type ViewportInput struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type TopLevelSectionLayoutInput struct {
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	ZIndex int      `json:"zIndex,omitempty"`
	W      *float64 `json:"w,omitempty"`
	H      *float64 `json:"h,omitempty"`
}

type SetTopLevelSectionLayoutRequestInput struct {
	FrontendOpID     *string                               `json:"frontendOpId,omitempty"`
	ProjectConfigID  string                                `json:"projectConfigId"`
	TopLevelSections map[string]TopLevelSectionLayoutInput `json:"topLevelSections"`
}

type SetViewportRequestInput struct {
	FrontendOpID    *string        `json:"frontendOpId,omitempty"`
	ProjectConfigID string         `json:"projectConfigId"`
	Viewport        *ViewportInput `json:"viewport"`
}

type SetActiveIDsRequestInput struct {
	FrontendOpID    *string  `json:"frontendOpId,omitempty"`
	ProjectConfigID string   `json:"projectConfigId"`
	ActiveIDs       []string `json:"activeIds"`
}

const projectStateFrontendSupportRawTS = `
export const SectionTypeEnum = {
  Callable: "Callable",
  Dict: "Dict",
  ListRoot: "ListRoot",
  Group: "Group",
  Image: "Image",
  Chart: "Chart",
  Draw: "Draw",
  TextBlock: "TextBlock",
  Prompt: "Prompt",
  MetaControl: "MetaControl",
  Social: "Social",
  GlobalVariables: "GlobalVariables",
  Code: "Code",
  GenPythonCode: "GenPythonCode",
  GenPythonMetadata: "GenPythonMetadata",
  Terminal: "Terminal",
  IFrame: "IFrame",
  Chat: "Chat",
  Browser: "Browser",
  Plugin: "Plugin",
  TaskBoard: "TaskBoard",
  Spreadsheet: "Spreadsheet",
} as const;
export type SectionType = ObjectValues<typeof SectionTypeEnum>;

export const CodeObjTypeEnum = {
  CodeCallable: "CodeCallable",
  CodeParam: "CodeParam",
  TextParam: "TextParam",
  DateParam: "DateParam",
  TimeParam: "TimeParam",
  ButtonParam: "ButtonParam",
  SliderParam: "SliderParam",
  RotaryParam: "RotaryParam",
  SwitchParam: "SwitchParam",
  ColorPickerParam: "ColorPickerParam",
  DropdownParam: "DropdownParam",
  PasswordParam: "PasswordParam",
  TextAreaParam: "TextAreaParam",
  DropzoneParam: "DropzoneParam",
  NestedParam: "NestedParam",
} as const;
export type CodeObjType = ObjectValues<typeof CodeObjTypeEnum>;

export const ListRootViewModeEnum = {
  default: "default",
  task_list: "task_list",
  kanban: "kanban",
} as const;
export type ListRootViewMode = ObjectValues<typeof ListRootViewModeEnum>;

export const CodeLanguageEnum = {
  python: "python",
  bash: "bash",
  javascript: "javascript",
  typescript: "typescript",
  json: "json",
  yaml: "yaml",
  toml: "toml",
  markdown: "markdown",
  plaintext: "plaintext",
} as const;
export type BuiltinCodeLanguage = ObjectValues<typeof CodeLanguageEnum>;

export const ConfigLanguageEnum = {
  python: "python",
  json: "json",
} as const;
export type ConfigLanguage = ObjectValues<typeof ConfigLanguageEnum>;

export const TextBlockDisplayModeEnum = {
  Render: "Render",
  Edit: "Edit",
} as const;
export type TextBlockDisplayMode = ObjectValues<
  typeof TextBlockDisplayModeEnum
>;

export const TextBlockFormatEnum = {
  Plaintext: "Plaintext",
  Markdown: "Markdown",
} as const;
export type TextBlockFormat = ObjectValues<typeof TextBlockFormatEnum>;

export const ChatRoleEnum = {
  system: "system",
  user: "user",
  assistant: "assistant",
  tool: "tool",
} as const;
export type ChatRole = ObjectValues<typeof ChatRoleEnum>;

export const ChatPermissionModeEnum = {
  minimal: "minimal",
  yolo: "yolo",
  config_toml_custom: "config_toml_custom",
} as const;
export type ChatPermissionMode = ObjectValues<typeof ChatPermissionModeEnum>;

export const ChatDictationModeEnum = {
  auto: "auto",
  browser: "browser",
  provider: "provider",
} as const;
export type ChatDictationMode = ObjectValues<typeof ChatDictationModeEnum>;

export const TaskBoardViewModeEnum = {
  task_list: "task_list",
  kanban: "kanban",
} as const;
export type TaskBoardViewMode = ObjectValues<typeof TaskBoardViewModeEnum>;

export const TaskBoardTaskRecurrenceEnum = {
  none: "none",
  hourly: "hourly",
  daily: "daily",
  specified_days: "specified_days",
  specified_months: "specified_months",
  specified_years: "specified_years",
} as const;
export type TaskBoardTaskRecurrence = ObjectValues<
  typeof TaskBoardTaskRecurrenceEnum
>;

export const TaskBoardRecurringWeekdayEnum = {
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
} as const;
export type TaskBoardRecurringWeekday = ObjectValues<
  typeof TaskBoardRecurringWeekdayEnum
>;

export const TaskBoardRecurringMonthEnum = {
  january: "january",
  february: "february",
  march: "march",
  april: "april",
  may: "may",
  june: "june",
  july: "july",
  august: "august",
  september: "september",
  october: "october",
  november: "november",
  december: "december",
} as const;
export type TaskBoardRecurringMonth = ObjectValues<
  typeof TaskBoardRecurringMonthEnum
>;

export const SpreadsheetGridDensityEnum = {
  compact: "compact",
  comfortable: "comfortable",
} as const;
export type SpreadsheetGridDensity = ObjectValues<
  typeof SpreadsheetGridDensityEnum
>;

export const ParameterPassingStyleEnum = {
  DEFAULT: "DEFAULT",
  ARGS: "ARGS",
  KWARGS: "KWARGS",
  POSITIONAL_ONLY: "POSITIONAL_ONLY",
  KEYWORD_ONLY: "KEYWORD_ONLY",
} as const;
export type ParameterPassingStyle = ObjectValues<
  typeof ParameterPassingStyleEnum
>;

export const ParamNameTypeEnum = {
  CODE: "CODE",
  TEXT: "TEXT",
} as const;
export type ParamNameType = ObjectValues<typeof ParamNameTypeEnum>;

export const RunSnapshotModeEnum = {
  ephemeral: "ephemeral",
  always: "always",
  never: "never",
} as const;
export type RunSnapshotMode = ObjectValues<typeof RunSnapshotModeEnum>;

type GeneratedMutableValue =
  | null
  | boolean
  | number
  | string
  | Array<GeneratedMutableValue>
  | { [key: string]: GeneratedMutableValue | undefined };

function cloneGeneratedValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneGeneratedValue(entry)) as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(
    value as Record<string, GeneratedMutableValue | undefined>,
  )) {
    cloned[key] = cloneGeneratedValue(entry);
  }
  return cloned as T;
}

function mergeGeneratedOptions<T extends object>(
  defaults: T,
  options: Partial<T> = {},
): T {
  return {
    ...cloneGeneratedValue(defaults),
    ...cloneGeneratedValue(options),
  } as T;
}

export type SectionSize = {
  width: number;
  height: number;
};

export type EdgePort = {
  id: string;
  accessor: string;
};

export type TypeErrorIgnoreState = {
  callable: boolean;
  params: Record<string, boolean>;
};

export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

export type TopLevelSectionLayout = {
  x: number;
  y: number;
  zIndex?: number;
  w?: number | null;
  h?: number | null;
};
export function createTopLevelSectionLayout(
  options: Partial<TopLevelSectionLayout> = {},
): TopLevelSectionLayout {
  return mergeGeneratedOptions(
    {
      x: 0,
      y: 0,
      zIndex: 0,
      w: null,
      h: null,
    },
    options,
  );
}

export type ViewMode = {
  id: string;
  name: string;
  sortIndex?: number;
  isUserFacing?: boolean;
  isTab?: boolean;
  visibilityBySectionId?: Record<string, boolean>;
  viewport?: Viewport | null;
  viewportInitialized?: boolean;
  topLevelSections?: Record<string, TopLevelSectionLayout>;
};

export type Edge = {
  id: string;
  sourceSectionId: string;
  sourceVariantId: string;
  sourcePortId: string;
  targetSectionId: string;
  targetVariantId: string;
  targetPortId: string;
  type?: string;
  label?: string | null;
  style?: Record<string, unknown>;
  animated?: boolean;
  hidden?: boolean;
  zIndex?: number;
  data?: Record<string, unknown>;
  selected?: boolean;
};

export type AgenticEdge = {
  id: string;
  sourceSectionId: string;
  targetSectionId: string;
  kind: string;
  contextMode?: string;
  style?: Record<string, unknown>;
  hidden?: boolean;
  zIndex?: number;
  selected?: boolean;
};

export type WatchCodeFolder = {
  path: string;
  recursive: boolean;
};

export type WatchCodeRegistryEntry = {
  callableName: string;
  kind: string;
  signatureHash: string;
  bodyHash: string;
  sourcePath: string;
  sectionIds?: Array<string>;
  sectionsCount?: number;
};

export type CodeFileBinding = {
  canonicalPath: string;
  accessMode: string;
  autoBinding: boolean;
};

export type Core = {
  id: string;
  name: string;
  displayName: string;
  variants: Array<string>;
  defaultVariant: string | null;
  sharedModifier: Record<string, unknown>;
  unsharedKeys: Array<string>;
};
export function createCore(options: Partial<Core> = {}): Core {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      displayName: "",
      variants: [],
      defaultVariant: null,
      sharedModifier: {},
      unsharedKeys: [],
    },
    options,
  );
}

export type Variant = {
  id: string;
  name: string;
  impl: string;
  nonPresetImpls: Array<string>;
  modifier: Record<string, unknown>;
  isFrozen: boolean;
};
export function createVariant(options: Partial<Variant> = {}): Variant {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      impl: "",
      nonPresetImpls: [],
      modifier: {},
      isFrozen: false,
    },
    options,
  );
}

export type ProjectConfig = {
  id: string;
  name: string;
  showParamDisplayNames: boolean;
  allowJsonSourceKeyEdits: boolean;
  previewImgColor?: string;
  viewport?: Viewport | null;
  viewportInitialized: boolean;
  viewModes: Record<string, ViewMode>;
  activeViewModeId?: string | null;
  isEditingViewMode: boolean;
  codegenTargets: Array<Record<string, unknown>>;
  watchCodeEnabled: boolean;
  watchCodeFolders: Array<WatchCodeFolder>;
  watchCodeFiles: Array<string>;
  watchCodeRegistry: Record<string, WatchCodeRegistryEntry>;
  watchCodeBaselineByPath: Record<string, Array<string>>;
  entryCodeBlockId?: string | null;
  topLevelSections: Record<string, TopLevelSectionLayout>;
  sectionVariantMap: Record<string, string>;
  activeIds: Array<string>;
  edges: Array<Edge>;
  agenticEdges: Array<AgenticEdge>;
};
export function createProjectConfig(
  options: Partial<ProjectConfig> = {},
): ProjectConfig {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      showParamDisplayNames: false,
      allowJsonSourceKeyEdits: false,
      previewImgColor: "",
      viewport: null,
      viewportInitialized: false,
      viewModes: {},
      activeViewModeId: null,
      isEditingViewMode: false,
      codegenTargets: [],
      watchCodeEnabled: false,
      watchCodeFolders: [],
      watchCodeFiles: [],
      watchCodeRegistry: {},
      watchCodeBaselineByPath: {},
      entryCodeBlockId: null,
      topLevelSections: {},
      sectionVariantMap: {},
      activeIds: [],
      edges: [],
      agenticEdges: [],
    },
    options,
  );
}

export type SingletonSections = {
  GlobalVariables: string | null;
  GenPythonCode: string | null;
  GenPythonMetadata: string | null;
};
export function createSingletonSections(
  options: Partial<SingletonSections> = {},
): SingletonSections {
  return mergeGeneratedOptions(
    {
      GlobalVariables: null,
      GenPythonCode: null,
      GenPythonMetadata: null,
    },
    options,
  );
}

export type ShownParamIdDetails = {
  requiredParamIdsToPaths: Record<string, Array<string>>;
  topLevelParamIds: Array<string>;
};

export type ShownParamIds = {
  pinned: ShownParamIdDetails;
  unpinned: ShownParamIdDetails;
};

export type ProjectStateSingleConfig = {
  projectConfig: ProjectConfig;
  sections: Record<string, Core>;
  sectionImpls: Record<string, BaseSectionImplUnion>;
  sectionVariants: Record<string, Variant>;
  codeObjs: Record<string, Core>;
  codeObjImpls: Record<string, BaseCodeObjImplUnion>;
  codeObjVariants: Record<string, Variant>;
  artifactGroups?: Record<string, unknown>;
  singletonSections: SingletonSections;
  parentSectionMap: Record<string, string | null>;
  shownParamIds: Record<string, ShownParamIds>;
  requiredDecodedImages: Array<string>;
  genCodeBinding?: CodeFileBinding | null;
};

export type ProjectStateSingleConfigWithCompletedOpIds = {
  projectState: ProjectStateSingleConfig;
  completedOpIds: Array<string>;
  pendingOpIds: Array<string>;
};

type GeneratedFactoryResolution<TDefaults extends object, TImpl extends object> =
  {
    defaults: TDefaults;
    overrides: Partial<TImpl>;
  };

function isGeneratedImplOverrideCandidate(
  value: unknown,
): value is { id?: unknown; type?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    ("id" in value || "type" in value)
  );
}

function resolveGeneratedFactoryInputs<
  TDefaults extends object,
  TImpl extends object,
>(
  baseDefaults: TDefaults,
  defaultsOrOverrides?: Partial<TDefaults> | Partial<TImpl>,
  overrides?: Partial<TImpl>,
): GeneratedFactoryResolution<TDefaults, TImpl> {
  if (overrides !== undefined) {
    return {
      defaults: mergeGeneratedOptions(
        baseDefaults,
        (defaultsOrOverrides ?? {}) as Partial<TDefaults>,
      ),
      overrides,
    };
  }
  if (isGeneratedImplOverrideCandidate(defaultsOrOverrides)) {
    return {
      defaults: cloneGeneratedValue(baseDefaults),
      overrides: defaultsOrOverrides as Partial<TImpl>,
    };
  }
  return {
    defaults: mergeGeneratedOptions(
      baseDefaults,
      (defaultsOrOverrides ?? {}) as Partial<TDefaults>,
    ),
    overrides: {},
  };
}

type JSONValue =
  | null
  | boolean
  | number
  | string
  | Array<JSONValue>
  | { [key: string]: JSONValue | undefined };

export type ChatFileAttachment = {
  id: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
};

export type MessageTextContent = {
  type: "text";
  text: string;
};
export function createMessageTextContent(
  options: Partial<MessageTextContent> = {},
): MessageTextContent {
  return mergeGeneratedOptions(
    {
      type: "text",
      text: "",
    },
    options,
  );
}

export type MessageImageUrl = {
  url: string;
  detail?: "auto" | "low" | "high" | null;
};

export type MessageImageUrlContent = {
  type: "image_url";
  image_url: MessageImageUrl;
};

export type MessageThinkingContent = {
  type: "thinking";
  thinking: string;
  summary?: string | null;
  signature?: string | null;
};
export function createMessageThinkingContent(
  options: Partial<MessageThinkingContent> = {},
): MessageThinkingContent {
  return mergeGeneratedOptions(
    {
      type: "thinking",
      thinking: "",
      summary: "",
      signature: "",
    },
    options,
  );
}

export type MessageContent =
  | MessageTextContent
  | MessageImageUrlContent
  | MessageThinkingContent;

export type ToolReferenceContent = {
  type: "tool_reference";
  tool_name: string;
};

export type ToolCallFunction = {
  name: string;
  arguments: { [key: string]: JSONValue | undefined };
};
export function createToolCallFunction(
  options: Partial<ToolCallFunction> = {},
): ToolCallFunction {
  return mergeGeneratedOptions(
    {
      name: "",
      arguments: {},
    },
    options,
  );
}

export type ToolCall = {
  id: string;
  type: "function";
  function: ToolCallFunction;
};
export function createToolCall(options: Partial<ToolCall> = {}): ToolCall {
  return mergeGeneratedOptions(
    {
      id: "",
      type: "function",
      function: createToolCallFunction(),
    },
    options,
  );
}

type ContentChatMessageBase = {
  id: string;
  content: Array<MessageContent>;
  attachments: Array<ChatFileAttachment>;
};

export type SystemChatMessage = ContentChatMessageBase & {
  role: typeof ChatRoleEnum.system;
};

export type AssistantChatMessage = ContentChatMessageBase & {
  role: typeof ChatRoleEnum.assistant;
  tool_calls?: Array<ToolCall> | null;
};

export type UserChatMessage = ContentChatMessageBase & {
  role: typeof ChatRoleEnum.user;
};

export type ToolChatMessage = {
  id: string;
  role: typeof ChatRoleEnum.tool;
  tool_call_id: string;
  tool_name?: string | null;
  arguments: JSONValue;
  result: JSONValue;
  content: Array<ToolReferenceContent | Record<string, unknown>>;
  is_error: boolean;
  started_at: string;
  completed_at?: string | null;
};

export type BaseChatMessageUnion =
  | SystemChatMessage
  | AssistantChatMessage
  | UserChatMessage
  | ToolChatMessage;

export function createSystemChatMessage(
  options: Partial<SystemChatMessage> = {},
): SystemChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.system,
      content: [],
      attachments: [],
    },
    options,
  );
}

export function createAssistantChatMessage(
  options: Partial<AssistantChatMessage> = {},
): AssistantChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.assistant,
      content: [],
      attachments: [],
      tool_calls: null,
    },
    options,
  );
}

export function createUserChatMessage(
  options: Partial<UserChatMessage> = {},
): UserChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.user,
      content: [],
      attachments: [],
    },
    options,
  );
}

export function createToolChatMessage(
  options: Partial<ToolChatMessage> = {},
): ToolChatMessage {
  return mergeGeneratedOptions(
    {
      id: "",
      role: ChatRoleEnum.tool,
      tool_call_id: "",
      tool_name: null,
      arguments: {},
      result: null,
      content: [],
      is_error: false,
      started_at: "",
      completed_at: null,
    },
    options,
  );
}

export type ChatSectionBranch = {
  messages: Array<BaseChatMessageUnion>;
  createdAt: number;
  parentBranchId?: string | null;
  branchFromMessageId?: string | null;
};

export type ChatSectionState = {
  messages: Array<BaseChatMessageUnion>;
  inputText: string;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  activeBranchId?: string | null;
  branches: Record<string, ChatSectionBranch>;
};

export type CodeSectionDiagnosticsIgnoreState = {
  muted: boolean;
  suppressedCodes: Array<string | number>;
};

export type BaseCodeObjImpl = {
  type: CodeObjType;
  id: string;
  name: string;
  description: string;
  isPreset: boolean;
  children?: Array<string>;
  coreNameType?: ParamNameType;
  coreNameEditable?: boolean;
  passingStyle?: ParameterPassingStyle;
  typeAnnotation?: string;
  defaultVal?: string;
  value?: string;
  [key: string]: unknown;
};
export type CodeParamCodeObjImpl = BaseCodeObjImpl & {
  type: typeof CodeObjTypeEnum.CodeParam;
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  passingStyle: ParameterPassingStyle;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
};
export type BaseCodeObjImplUnion = BaseCodeObjImpl | CodeParamCodeObjImpl;
export type BaseChildlessCodeObjImplUnion = BaseCodeObjImpl | CodeParamCodeObjImpl;
export type BaseParamCodeObjImplUnion = BaseCodeObjImpl | CodeParamCodeObjImpl;

export type UserDefaultCodeParamCodeObjImpl = {
  coreNameType: ParamNameType;
  coreNameEditable: boolean;
  typeAnnotation: string;
  defaultVal: string;
  value: string;
};
export function createUserDefaultCodeParamCodeObjImpl(
  options: Partial<UserDefaultCodeParamCodeObjImpl> = {},
): UserDefaultCodeParamCodeObjImpl {
  return mergeGeneratedOptions(
    {
      coreNameType: ParamNameTypeEnum.TEXT,
      coreNameEditable: false,
      typeAnnotation: "",
      defaultVal: "",
      value: "",
    },
    options,
  );
}

export function createCodeParamCodeObjImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCodeParamCodeObjImpl>
    | Partial<CodeParamCodeObjImpl> = {},
  overrides?: Partial<CodeParamCodeObjImpl>,
): CodeParamCodeObjImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCodeParamCodeObjImpl,
    CodeParamCodeObjImpl
  >(createUserDefaultCodeParamCodeObjImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: CodeObjTypeEnum.CodeParam,
      id: "",
      name: "",
      description: "",
      isPreset: false,
      coreNameType: resolved.defaults.coreNameType,
      coreNameEditable: resolved.defaults.coreNameEditable,
      passingStyle: ParameterPassingStyleEnum.DEFAULT,
      typeAnnotation: resolved.defaults.typeAnnotation,
      defaultVal: resolved.defaults.defaultVal,
      value: resolved.defaults.value,
    },
    resolved.overrides,
  );
}

export type BaseSectionImpl = {
  type: SectionType;
  id: string;
  name: string;
  isFrozen: boolean;
  isInOtherProjectConfigs: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  aspectRatioExtraHeight: number;
  aspectRatioExtraWidth: number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  isPreset: boolean;
  children?: Array<string>;
  codeObjVariantMap?: Record<string, string>;
  hideUnpinnedParams?: boolean;
  paramFilter?: string;
  columnWidth?: number | null;
  configLanguage?: string;
  pinnedParams?: Array<string>;
  selectedParams?: Array<string>;
  ignoreTypeErrors?: TypeErrorIgnoreState;
  edgeInputParams?: Array<string>;
  edgeOutputPorts?: Array<EdgePort>;
  topLevelParamId?: string | null;
  isJsonSource?: boolean;
  jsonSourceKeys?: Array<string>;
  jsonSourceMissing?: boolean;
  metaControlParamId?: string | null;
  showSectionTitle?: boolean;
  attachedTerminalSectionId?: string | null;
  code?: string;
  codeLanguage?: string;
  codeFileBinding?: CodeFileBinding | null;
  messages?: Array<BaseChatMessageUnion>;
  inputText?: string;
  waitingForResponse?: boolean;
  toolCallArguments?: Record<string, string>;
  pluginId?: string;
  kind?: string;
  data?: Record<string, unknown>;
  schemaVersion?: number | null;
  viewMode?: ListRootViewMode;
  defaultChildSectionType?: SectionType;
  isHorizontalOrientation?: boolean;
  overflowMode?: boolean;
  hideColumn?: boolean;
  folder?: string;
  filePath?: string;
  activeSheet?: string | null;
  readOnly?: boolean;
  showRowNumbers?: boolean;
  density?: string;
  autoReloadOnExternalChange?: boolean;
  text?: string;
  metaControlStyle?: boolean;
  imagePath?: string;
  dataPath?: string;
  [key: string]: unknown;
};
export type CallableSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Callable;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  callable?: string | null;
  hideParams: boolean;
};
export type BaseParentSectionImplUnion = BaseSectionImpl & {
  children: Array<string>;
};
export type BaseSectionWithParamsImplUnion = BaseSectionImpl & {
  codeObjVariantMap: Record<string, string>;
};
export type DictSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Dict;
  codeObjVariantMap: Record<string, string>;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  pinnedParams: Array<string>;
  selectedParams: Array<string>;
  ignoreTypeErrors: TypeErrorIgnoreState;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  topLevelParamId: string | null;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
  jsonSourceMissing: boolean;
};

export type UserDefaultCallableSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  hideParams: boolean;
};

export type ListRootSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.ListRoot;
  children: Array<string>;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
};

export type UserDefaultListRootSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  defaultChildSectionType: SectionType;
  viewMode: ListRootViewMode;
};

export type TextBlockSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.TextBlock;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
};

export type UserDefaultTextBlockSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  format: TextBlockFormat;
  masterFontSizePx: number;
  headingAsSectionName: boolean;
  metaControlStyle: boolean;
  textDisplayMode: TextBlockDisplayMode;
  text: string;
};

export type CodeSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Code;
  children: Array<string>;
  code: string;
  codeLanguage: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
};

export type UserDefaultCodeSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  code: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
  codeLanguage: string;
  diagnosticsIgnoreState: CodeSectionDiagnosticsIgnoreState;
};

export type TerminalSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Terminal;
};

export type UserDefaultTerminalSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
};

export type ChatSectionImpl = BaseSectionImpl &
  ChatSectionState & {
    type: typeof SectionTypeEnum.Chat;
    managed: boolean;
    engineConfigId?: string | null;
    transcriptionProfileId?: string | null;
    agentProfileId?: string | null;
    chatId?: string | null;
    thinking: boolean;
    permissionMode: ChatPermissionMode;
    searchEnabled: boolean;
    dictationMode: ChatDictationMode;
  };

export type UserDefaultChatSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  managed: boolean;
  engineConfigId?: string | null;
  transcriptionProfileId?: string | null;
  agentProfileId?: string | null;
  chatId?: string | null;
  thinking: boolean;
  permissionMode: ChatPermissionMode;
  searchEnabled: boolean;
  dictationMode: ChatDictationMode;
  messages: Array<BaseChatMessageUnion>;
  inputText: string;
  waitingForResponse: boolean;
  toolCallArguments: Record<string, string>;
  activeBranchId?: string | null;
  branches: Record<string, ChatSectionBranch>;
};

export type TaskBoardColumn = {
  id: string;
  name: string;
  color: string;
  sortIndex: number;
};
export function createTaskBoardColumn(
  options: Partial<TaskBoardColumn> = {},
): TaskBoardColumn {
  return mergeGeneratedOptions(
    {
      id: "",
      name: "",
      color: "#3b82f6",
      sortIndex: 0,
    },
    options,
  );
}

export type TaskBoardTask = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  columnId?: string | null;
  dueDateIso: string;
  recurrence: TaskBoardTaskRecurrence;
  recurrenceDays: Array<TaskBoardRecurringWeekday>;
  recurrenceMonths: Array<TaskBoardRecurringMonth>;
  recurrenceYears: Array<number>;
  sortIndex: number;
};
export function createTaskBoardTask(
  options: Partial<TaskBoardTask> = {},
): TaskBoardTask {
  return mergeGeneratedOptions(
    {
      id: "",
      title: "",
      description: "",
      completed: false,
      columnId: null,
      dueDateIso: "",
      recurrence: TaskBoardTaskRecurrenceEnum.none,
      recurrenceDays: [],
      recurrenceMonths: [],
      recurrenceYears: [],
      sortIndex: 0,
    },
    options,
  );
}

export type TaskBoardSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.TaskBoard;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn>;
  tasks: Array<TaskBoardTask>;
};

export type UserDefaultTaskBoardSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  viewMode: TaskBoardViewMode;
  columns: Array<TaskBoardColumn> | null;
  tasks: Array<TaskBoardTask>;
};

export type SpreadsheetSectionImpl = BaseSectionImpl & {
  type: typeof SectionTypeEnum.Spreadsheet;
  filePath: string;
  activeSheet?: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
};

export type UserDefaultSpreadsheetSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  filePath: string;
  activeSheet?: string | null;
  readOnly: boolean;
  showRowNumbers: boolean;
  density: SpreadsheetGridDensity;
  autoReloadOnExternalChange: boolean;
};

export type BaseSectionImplUnion =
  | CallableSectionImpl
  | DictSectionImpl
  | ListRootSectionImpl
  | TextBlockSectionImpl
  | CodeSectionImpl
  | TerminalSectionImpl
  | ChatSectionImpl
  | TaskBoardSectionImpl
  | SpreadsheetSectionImpl
  | BaseSectionImpl;

function createGeneratedBaseSectionDefaults(): {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
} {
  return {
    isFrozen: false,
    tagColor: null,
    styleColor: null,
    size: {
      width: 250,
      height: 150,
    },
    aspectRatio: false,
    isMinimized: false,
    positionAndSizeLocked: false,
  };
}

function createGeneratedBaseSectionWithParamsDefaults(): {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: ConfigLanguage;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
} {
  return {
    ...createGeneratedBaseSectionDefaults(),
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    edgeInputParams: [],
    edgeOutputPorts: [],
  };
}

function createGeneratedBaseCodeSectionDefaults(): {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  code: string;
  codeFileBinding?: CodeFileBinding | null;
  attachedTerminalSectionId?: string | null;
} {
  return {
    ...createGeneratedBaseSectionDefaults(),
    code: "",
    size: {
      width: 500,
      height: 150,
    },
    codeFileBinding: null,
    attachedTerminalSectionId: null,
  };
}

export type UserDefaultDictSectionImpl = {
  isFrozen: boolean;
  tagColor: string | null;
  styleColor: string | null;
  size: SectionSize;
  aspectRatio: boolean | number;
  isMinimized: boolean;
  positionAndSizeLocked: boolean;
  hideUnpinnedParams: boolean;
  paramFilter: string;
  columnWidth: number | null;
  configLanguage: string;
  edgeInputParams: Array<string>;
  edgeOutputPorts: Array<EdgePort>;
  isJsonSource: boolean;
  jsonSourceKeys: Array<string>;
};
export function createUserDefaultDictSectionImpl(
  options: Partial<UserDefaultDictSectionImpl> = {},
): UserDefaultDictSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionWithParamsDefaults(),
      isJsonSource: false,
      jsonSourceKeys: [],
    },
    options,
  );
}

export function createDictSectionImpl(
  defaults: UserDefaultDictSectionImpl,
  overrides: Partial<DictSectionImpl> = {},
): DictSectionImpl {
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Dict,
      id: "",
      name: "",
      isFrozen: defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: defaults.tagColor,
      styleColor: defaults.styleColor,
      size: defaults.size,
      aspectRatio: defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: defaults.isMinimized,
      positionAndSizeLocked: defaults.positionAndSizeLocked,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: defaults.hideUnpinnedParams,
      paramFilter: defaults.paramFilter,
      columnWidth: defaults.columnWidth,
      configLanguage: defaults.configLanguage,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: {
        callable: false,
        params: {},
      },
      edgeInputParams: defaults.edgeInputParams,
      edgeOutputPorts: defaults.edgeOutputPorts,
      topLevelParamId: null,
      isJsonSource: defaults.isJsonSource,
      jsonSourceKeys: defaults.jsonSourceKeys,
      jsonSourceMissing: false,
    },
    overrides,
  );
}

export function createUserDefaultCallableSectionImpl(
  options: Partial<UserDefaultCallableSectionImpl> = {},
): UserDefaultCallableSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionWithParamsDefaults(),
      hideParams: false,
    },
    options,
  );
}

export function createCallableSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCallableSectionImpl>
    | Partial<CallableSectionImpl> = {},
  overrides?: Partial<CallableSectionImpl>,
): CallableSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCallableSectionImpl,
    CallableSectionImpl
  >(createUserDefaultCallableSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Callable,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      codeObjVariantMap: {},
      hideUnpinnedParams: resolved.defaults.hideUnpinnedParams,
      paramFilter: resolved.defaults.paramFilter,
      columnWidth: resolved.defaults.columnWidth,
      configLanguage: resolved.defaults.configLanguage,
      pinnedParams: [],
      selectedParams: [],
      ignoreTypeErrors: {
        callable: false,
        params: {},
      },
      edgeInputParams: resolved.defaults.edgeInputParams,
      edgeOutputPorts: resolved.defaults.edgeOutputPorts,
      callable: null,
      hideParams: resolved.defaults.hideParams,
    },
    resolved.overrides,
  );
}

export function createUserDefaultListRootSectionImpl(
  options: Partial<UserDefaultListRootSectionImpl> = {},
): UserDefaultListRootSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      defaultChildSectionType: SectionTypeEnum.Callable,
      viewMode: ListRootViewModeEnum.default,
    },
    options,
  );
}

export function createListRootSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultListRootSectionImpl>
    | Partial<ListRootSectionImpl> = {},
  overrides?: Partial<ListRootSectionImpl>,
): ListRootSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultListRootSectionImpl,
    ListRootSectionImpl
  >(createUserDefaultListRootSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.ListRoot,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      children: [],
      defaultChildSectionType: resolved.defaults.defaultChildSectionType,
      viewMode: resolved.defaults.viewMode,
    },
    resolved.overrides,
  );
}

export function createUserDefaultTextBlockSectionImpl(
  options: Partial<UserDefaultTextBlockSectionImpl> = {},
): UserDefaultTextBlockSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 500,
        height: 150,
      },
      format: TextBlockFormatEnum.Plaintext,
      masterFontSizePx: 14,
      headingAsSectionName: false,
      metaControlStyle: false,
      textDisplayMode: TextBlockDisplayModeEnum.Render,
      text: "",
    },
    options,
  );
}

export function createTextBlockSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTextBlockSectionImpl>
    | Partial<TextBlockSectionImpl> = {},
  overrides?: Partial<TextBlockSectionImpl>,
): TextBlockSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTextBlockSectionImpl,
    TextBlockSectionImpl
  >(createUserDefaultTextBlockSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.TextBlock,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      format: resolved.defaults.format,
      masterFontSizePx: resolved.defaults.masterFontSizePx,
      headingAsSectionName: resolved.defaults.headingAsSectionName,
      metaControlStyle: resolved.defaults.metaControlStyle,
      textDisplayMode: resolved.defaults.textDisplayMode,
      text: resolved.defaults.text,
    },
    resolved.overrides,
  );
}

export function createUserDefaultCodeSectionImpl(
  options: Partial<UserDefaultCodeSectionImpl> = {},
): UserDefaultCodeSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseCodeSectionDefaults(),
      codeLanguage: CodeLanguageEnum.python,
      diagnosticsIgnoreState: {
        muted: false,
        suppressedCodes: [],
      },
    },
    options,
  );
}

export function createCodeSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultCodeSectionImpl>
    | Partial<CodeSectionImpl> = {},
  overrides?: Partial<CodeSectionImpl>,
): CodeSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultCodeSectionImpl,
    CodeSectionImpl
  >(createUserDefaultCodeSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Code,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      children: [],
      code: resolved.defaults.code,
      codeLanguage: resolved.defaults.codeLanguage,
      codeFileBinding: resolved.defaults.codeFileBinding,
      attachedTerminalSectionId: resolved.defaults.attachedTerminalSectionId,
      diagnosticsIgnoreState: resolved.defaults.diagnosticsIgnoreState,
    },
    resolved.overrides,
  );
}

export function createUserDefaultTerminalSectionImpl(
  options: Partial<UserDefaultTerminalSectionImpl> = {},
): UserDefaultTerminalSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
    },
    options,
  );
}

export function createTerminalSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTerminalSectionImpl>
    | Partial<TerminalSectionImpl> = {},
  overrides?: Partial<TerminalSectionImpl>,
): TerminalSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTerminalSectionImpl,
    TerminalSectionImpl
  >(createUserDefaultTerminalSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Terminal,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
    },
    resolved.overrides,
  );
}

export function createUserDefaultChatSectionImpl(
  options: Partial<UserDefaultChatSectionImpl> = {},
): UserDefaultChatSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 400,
        height: 200,
      },
      managed: false,
      engineConfigId: null,
      transcriptionProfileId: null,
      agentProfileId: null,
      chatId: null,
      thinking: true,
      permissionMode: ChatPermissionModeEnum.minimal,
      searchEnabled: true,
      dictationMode: ChatDictationModeEnum.auto,
      messages: [],
      inputText: "",
      waitingForResponse: false,
      toolCallArguments: {},
      activeBranchId: null,
      branches: {},
    },
    options,
  );
}

export function createChatSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultChatSectionImpl>
    | Partial<ChatSectionImpl> = {},
  overrides?: Partial<ChatSectionImpl>,
): ChatSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultChatSectionImpl,
    ChatSectionImpl
  >(createUserDefaultChatSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Chat,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      managed: resolved.defaults.managed,
      engineConfigId: resolved.defaults.engineConfigId,
      transcriptionProfileId: resolved.defaults.transcriptionProfileId,
      agentProfileId: resolved.defaults.agentProfileId,
      chatId: resolved.defaults.chatId,
      thinking: resolved.defaults.thinking,
      permissionMode: resolved.defaults.permissionMode,
      searchEnabled: resolved.defaults.searchEnabled,
      dictationMode: resolved.defaults.dictationMode,
      messages: resolved.defaults.messages,
      inputText: resolved.defaults.inputText,
      waitingForResponse: resolved.defaults.waitingForResponse,
      toolCallArguments: resolved.defaults.toolCallArguments,
      activeBranchId: resolved.defaults.activeBranchId,
      branches: resolved.defaults.branches,
    },
    resolved.overrides,
  );
}

function resolveGeneratedTaskBoardColumns(
  columns: Array<TaskBoardColumn> | null | undefined,
): Array<TaskBoardColumn> {
  if (columns === null || columns === undefined) {
    return [];
  }
  return cloneGeneratedValue(columns);
}

export function createUserDefaultTaskBoardSectionImpl(
  options: Partial<UserDefaultTaskBoardSectionImpl> = {},
): UserDefaultTaskBoardSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 720,
        height: 430,
      },
      viewMode: TaskBoardViewModeEnum.kanban,
      columns: null,
      tasks: [],
    },
    options,
  );
}

export function createTaskBoardSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultTaskBoardSectionImpl>
    | Partial<TaskBoardSectionImpl> = {},
  overrides?: Partial<TaskBoardSectionImpl>,
): TaskBoardSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultTaskBoardSectionImpl,
    TaskBoardSectionImpl
  >(createUserDefaultTaskBoardSectionImpl(), defaultsOrOverrides, overrides);
  const normalizedOverrides: Partial<TaskBoardSectionImpl> = {
    ...resolved.overrides,
  };
  if (normalizedOverrides.columns === undefined) {
    delete normalizedOverrides.columns;
  }
  if (normalizedOverrides.tasks === undefined) {
    delete normalizedOverrides.tasks;
  }
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.TaskBoard,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      viewMode: resolved.defaults.viewMode,
      columns: resolveGeneratedTaskBoardColumns(resolved.defaults.columns),
      tasks: resolved.defaults.tasks,
    },
    normalizedOverrides,
  );
}

export function createUserDefaultSpreadsheetSectionImpl(
  options: Partial<UserDefaultSpreadsheetSectionImpl> = {},
): UserDefaultSpreadsheetSectionImpl {
  return mergeGeneratedOptions(
    {
      ...createGeneratedBaseSectionDefaults(),
      size: {
        width: 760,
        height: 500,
      },
      filePath: "",
      activeSheet: null,
      readOnly: false,
      showRowNumbers: true,
      density: SpreadsheetGridDensityEnum.compact,
      autoReloadOnExternalChange: false,
    },
    options,
  );
}

export function createSpreadsheetSectionImpl(
  defaultsOrOverrides:
    | Partial<UserDefaultSpreadsheetSectionImpl>
    | Partial<SpreadsheetSectionImpl> = {},
  overrides?: Partial<SpreadsheetSectionImpl>,
): SpreadsheetSectionImpl {
  const resolved = resolveGeneratedFactoryInputs<
    UserDefaultSpreadsheetSectionImpl,
    SpreadsheetSectionImpl
  >(createUserDefaultSpreadsheetSectionImpl(), defaultsOrOverrides, overrides);
  return mergeGeneratedOptions(
    {
      type: SectionTypeEnum.Spreadsheet,
      id: "",
      name: "",
      isFrozen: resolved.defaults.isFrozen,
      isInOtherProjectConfigs: false,
      tagColor: resolved.defaults.tagColor,
      styleColor: resolved.defaults.styleColor,
      size: resolved.defaults.size,
      aspectRatio: resolved.defaults.aspectRatio,
      aspectRatioExtraHeight: 0,
      aspectRatioExtraWidth: 0,
      isMinimized: resolved.defaults.isMinimized,
      positionAndSizeLocked: resolved.defaults.positionAndSizeLocked,
      isPreset: false,
      filePath: resolved.defaults.filePath,
      activeSheet: resolved.defaults.activeSheet,
      readOnly: resolved.defaults.readOnly,
      showRowNumbers: resolved.defaults.showRowNumbers,
      density: resolved.defaults.density,
      autoReloadOnExternalChange: resolved.defaults.autoReloadOnExternalChange,
    },
    resolved.overrides,
  );
}

export type SharePolicy = {
  allowParamChanges: boolean;
  allowVariantChanges: boolean;
  allowLayoutChanges: boolean;
  allowRun: boolean;
  allowLLM: boolean;
  allowExternalLinks: boolean;
  allowFileDownloads: boolean;
  allowMultipleRuns: boolean;
  runSnapshotMode: RunSnapshotMode;
};
export function createSharePolicy(
  options: Partial<SharePolicy> = {},
): SharePolicy {
  return mergeGeneratedOptions(
    {
      allowParamChanges: true,
      allowVariantChanges: true,
      allowLayoutChanges: true,
      allowRun: false,
      allowLLM: false,
      allowExternalLinks: false,
      allowFileDownloads: false,
      allowMultipleRuns: true,
      runSnapshotMode: RunSnapshotModeEnum.ephemeral,
    },
    options,
  );
}

export type SettingsState = {
  backend: {
    runSnapshotMode: RunSnapshotMode;
  };
  gui: {
    sectionTagColorChoices: Array<{
      color: string;
      description: string;
    }>;
  };
};
export function createSettingsState(
  options: Partial<SettingsState> = {},
): SettingsState {
  const defaults: SettingsState = {
    backend: {
      runSnapshotMode: RunSnapshotModeEnum.ephemeral,
    },
    gui: {
      sectionTagColorChoices: [
        { color: "#ef4444", description: "Red" },
        { color: "#f97316", description: "Orange" },
        { color: "#eab308", description: "Yellow" },
        { color: "#22c55e", description: "Green" },
        { color: "#06b6d4", description: "Cyan" },
        { color: "#3b82f6", description: "Blue" },
        { color: "#a855f7", description: "Purple" },
        { color: "#64748b", description: "Slate" },
      ],
    },
  };
  return {
    ...mergeGeneratedOptions(defaults, options),
    backend: mergeGeneratedOptions(defaults.backend, options.backend ?? {}),
    gui: mergeGeneratedOptions(defaults.gui, options.gui ?? {}),
  };
}

const BaseChildlessCodeObjImplTypeSet = new Set([
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.DropzoneParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TimeParam,
]);

const BaseParamCodeObjImplTypeSet = new Set([
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.DropzoneParam,
  CodeObjTypeEnum.NestedParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TimeParam,
]);

const BaseParentSectionImplTypeSet = new Set([
  SectionTypeEnum.Code,
  SectionTypeEnum.GenPythonCode,
  SectionTypeEnum.GenPythonMetadata,
  SectionTypeEnum.Group,
  SectionTypeEnum.ListRoot,
]);

const BaseSectionWithParamsImplTypeSet = new Set([
  SectionTypeEnum.Callable,
  SectionTypeEnum.Dict,
  SectionTypeEnum.GlobalVariables,
]);

export function isBaseChildlessCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseChildlessCodeObjImplUnion {
  return BaseChildlessCodeObjImplTypeSet.has(x.type);
}

export function isBaseParamCodeObjImpl(
  x: BaseCodeObjImplUnion,
): x is BaseParamCodeObjImplUnion {
  return BaseParamCodeObjImplTypeSet.has(x.type);
}

export function isBaseParentSectionImpl(
  x: BaseSectionImplUnion,
): x is BaseParentSectionImplUnion {
  return BaseParentSectionImplTypeSet.has(x.type);
}

export function isBaseSectionWithParamsImpl(
  x: BaseSectionImplUnion,
): x is BaseSectionWithParamsImplUnion {
  return BaseSectionWithParamsImplTypeSet.has(x.type);
}

type ImplArgsBundleWithUpdaters<T> = {
  [K in keyof T]?: T[K] | ((prev: T[K]) => T[K]);
};

export type ImplArgsBundleMap = {
  BaseSection: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplUnion>;
  };
  BaseSectionWithParams: {
    impl: BaseSectionWithParamsImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionWithParamsImplUnion>;
  };
  BaseParentSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  BaseCodeSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  ChatSection: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplUnion>;
  };
  CodeSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  GroupSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  ListRootSection: {
    impl: BaseParentSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseParentSectionImplUnion>;
  };
  BrowserSection: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplUnion>;
  };
  TextBlockSection: {
    impl: BaseSectionImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseSectionImplUnion>;
  };
  BaseDictSection: {
    impl: DictSectionImpl;
    args: ImplArgsBundleWithUpdaters<DictSectionImpl>;
  };
  BaseChildlessCodeObj: {
    impl: BaseChildlessCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseChildlessCodeObjImplUnion>;
  };
  BaseCodeObj: {
    impl: BaseCodeObjImplUnion;
    args: ImplArgsBundleWithUpdaters<BaseCodeObjImplUnion>;
  };
};
`

const pluginListEntryRawTS = `
export type PluginListEntry = {
  pluginId: string;
  name: string;
  version: string;
  sourceScope: PluginScope;
  sourceScopeLabel: string;
  sourceManager: PluginSourceManager;
  sourceManagerHint: string | null;
  canonicalSourceKey: string;
  sourceDigestSha256: string | null;
  frontend: PluginFrontendDescriptor;
  content: PluginContentDescriptor;
  config: PluginConfigDescriptor;
  effectiveCapabilities: Array<string>;
  enablementSource: PluginEnablementSource | null;
  restartRequired: boolean;
};
export function createPluginListEntry(
  options: Partial<PluginListEntry> = {},
): PluginListEntry {
  return {
    pluginId: "",
    name: "",
    version: "",
    sourceScope: "workspace",
    sourceScopeLabel: "",
    sourceManager: "setta",
    sourceManagerHint: null,
    canonicalSourceKey: "",
    sourceDigestSha256: null,
    frontend: {
      entrypointUrl: null,
      styleUrl: null,
    },
    content: {
      hasBlueprints: false,
      hasProjectTemplates: false,
      hasPrompts: false,
    },
    config: {
      hasSchema: false,
      schemaJson: null as unknown as Record<string, unknown>,
      schemaJsonDigestSha256: null,
      currentConfig: null as unknown as Record<string, unknown>,
      currentConfigDigestSha256: null,
    },
    effectiveCapabilities: [],
    enablementSource: null,
    restartRequired: false,
    ...options,
  };
}
`

const pluginStatusEntryRawTS = `
export type PluginStatusEntry = {
  pluginId: string;
  name: string;
  version: string;
  state: PluginRuntimeState;
  sourceScope: PluginScope;
  sourceScopeLabel: string;
  sourceManager: PluginSourceManager;
  sourceManagerHint: string | null;
  sourcePath: string;
  canonicalSourceKey: string;
  sourceDigestSha256: string | null;
  shadowedBySourcePath: string | null;
  requestedCapabilities: Array<string>;
  effectiveCapabilities: Array<string>;
  blockedCapabilities: Array<PluginBlockedCapability>;
  registeredLanguageServers: Array<PluginRegisteredLanguageServer>;
  registeredExternalAgentAdapters: Array<PluginRegisteredExternalAgentAdapter>;
  registeredCodegenTargets: Array<PluginRegisteredCodegenTarget>;
  enablementSource: PluginEnablementSource | null;
  restartRequired: boolean;
  runtimePayloadDigestSha256: string;
  errors: Array<PluginErrorInfo>;
};
export function createPluginStatusEntry(
  options: Partial<PluginStatusEntry> = {},
): PluginStatusEntry {
  return {
    pluginId: "",
    name: "",
    version: "",
    state: PluginRuntimeStateEnum.active,
    sourceScope: "workspace",
    sourceScopeLabel: "",
    sourceManager: "setta",
    sourceManagerHint: null,
    sourcePath: "",
    canonicalSourceKey: "",
    sourceDigestSha256: null,
    shadowedBySourcePath: null,
    requestedCapabilities: [],
    effectiveCapabilities: [],
    blockedCapabilities: [],
    registeredLanguageServers: [],
    registeredExternalAgentAdapters: [],
    registeredCodegenTargets: [],
    enablementSource: null,
    restartRequired: false,
    runtimePayloadDigestSha256: "",
    errors: [],
    ...options,
  };
}
`
