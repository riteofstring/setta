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

export type BaseChatMessageUnion = {
  id: string;
  [key: string]: unknown;
};

export type BaseCodeObjImpl = {
  type: CodeObjType;
  id: string;
  name?: string;
  description?: string;
  isPreset?: boolean;
  children?: Array<string>;
  coreNameEditable?: boolean;
  value?: string;
  [key: string]: unknown;
};
export type BaseCodeObjImplUnion = BaseCodeObjImpl;
export type BaseChildlessCodeObjImplUnion = BaseCodeObjImpl;
export type BaseParamCodeObjImplUnion = BaseCodeObjImpl;

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
export type BaseSectionImplUnion = BaseSectionImpl;
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
      hideUnpinnedParams: false,
      paramFilter: "",
      columnWidth: null,
      configLanguage: "python",
      edgeInputParams: [],
      edgeOutputPorts: [],
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
