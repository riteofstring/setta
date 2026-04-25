import sidecar from "./generated/sidecar.json";
import { createPngArtifactId } from "./idNameCreation";

export type JsonRecord = Record<string, any>;
export type ObjectValues<T> = T[keyof T];
type CreateOptions<T> = T extends object ? Partial<T> : T;

type GeneratedMutableValue =
  | null
  | boolean
  | number
  | string
  | Array<GeneratedMutableValue>
  | { [key: string]: GeneratedMutableValue | undefined };

type SidecarExportedValueEntry = {
  name: string;
  value: unknown;
};

type SidecarEnumEntry = {
  kind: string;
  name: string;
  enumValues?: Array<{
    name: string;
    value: string;
  }>;
};

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
  defaults: Record<string, GeneratedMutableValue | undefined>,
  options: Partial<T> = {},
): T {
  return {
    ...cloneGeneratedValue(defaults),
    ...cloneGeneratedValue(options),
  } as T;
}

function readGeneratedExportedValue<T>(name: string): T {
  const entry = (sidecar.exportedValues as SidecarExportedValueEntry[]).find(
    (candidate) => candidate.name === name,
  );
  if (!entry) {
    throw new Error(
      `Missing generated app-subsystem SDK exported value ${JSON.stringify(name)}. Regenerate frontend bindings.`,
    );
  }
  return entry.value as T;
}

function readGeneratedStringEnum(
  name: string,
): Readonly<Record<string, string>> {
  const entry = (sidecar.contracts as SidecarEnumEntry[]).find(
    (candidate) => candidate.kind === "enum" && candidate.name === name,
  );
  const values = entry?.enumValues ?? [];
  if (values.length === 0) {
    throw new Error(
      `Missing generated app-subsystem SDK string enum ${JSON.stringify(name)}.`,
    );
  }
  return Object.freeze(
    Object.fromEntries(
      values.map((candidate) => [candidate.name, candidate.value]),
    ),
  );
}

export type Policy = JsonRecord;
export type Core = JsonRecord & {
  defaultVariant: string | null;
  displayName: string;
  id: string;
  name: string;
  sharedModifier: JsonRecord;
  unsharedKeys: string[];
  variants: string[];
};
export type Variant = JsonRecord & {
  id: string;
  impl: string;
  isFrozen: boolean;
  modifier: JsonRecord;
  name: string;
  nonPresetImpls: string[];
};
export type ContentRef = JsonRecord & {
  contentId: string;
  mimeType?: string;
};
export type ImageArtifact = JsonRecord & {
  id: string;
  type: string;
  value: ContentRef;
};
export type ProjectConfig = JsonRecord & {
  id: string;
  name: string;
  entryCodeBlockId: string | null;
  hasPythonCodegenTarget: boolean;
  sectionVariantMap: Record<string, string>;
  showParamDisplayNames: boolean;
};
export type SingletonSections = JsonRecord & {
  GenPythonCode: string | null;
  GenPythonMetadata: string | null;
  GlobalVariables: string | null;
};
export type SectionCapabilities = JsonRecord & {
  canRun: boolean;
  canSelectAsEntryCodeBlock: boolean;
  entryCodeBlockValue: string | null;
  runDisabledReason: string | null;
  runRequestSectionId: string | null;
};
export type SingleConfig = JsonRecord & {
  artifactGroups: Record<string, unknown>;
  codeObjImpls: Record<string, BaseCodeObjImplUnion>;
  codeObjVariants: Record<string, Variant>;
  codeObjs: Record<string, Core>;
  genCodeBinding: unknown | null;
  parentSectionMap: Record<string, string | null>;
  projectConfig: ProjectConfig;
  requiredDecodedImages: unknown[];
  sectionCapabilities: Record<string, SectionCapabilities>;
  sectionImpls: Record<string, BaseSectionImplUnion>;
  sectionVariants: Record<string, Variant>;
  sections: Record<string, Core>;
  shownParamIds: Record<string, unknown>;
  singletonSections: SingletonSections;
};

export type BaseDependencyKeyUnion = JsonRecord;
export type BaseDependencyValueUnion = JsonRecord;
export type LiteralDependencyValue = JsonRecord;
export type DateParamCodeObjImpl = JsonRecord;
export type TimeParamCodeObjImpl = JsonRecord;
export type BaseCodeObjImpl = JsonRecord & {
  id?: string;
  type: string;
};
export type BaseCodeObjImplUnion = BaseCodeObjImpl;
export type BaseChildlessCodeObjImplUnion = BaseCodeObjImpl;
export type BaseParamCodeObjImpl = BaseCodeObjImpl & {
  coreNameEditable?: boolean;
};
export type BaseSectionImplUnion = JsonRecord & {
  id?: string;
  type: string;
  codeObjVariantMap?: Record<string, string>;
};
export type CallableSectionImpl = BaseSectionImplUnion & {
  type: "Callable";
  codeObjVariantMap: Record<string, string>;
};
export type TextBlockSectionImpl = BaseSectionImplUnion & {
  text: string;
  textDisplayMode: string;
  type: "TextBlock";
};
export type CodeParamCodeObjImpl = BaseParamCodeObjImpl & {
  type: "CodeParam";
  value: string;
};
export type ServerModeCapabilities = {
  canManageDesktopLauncher: boolean;
};
export type EndpointOrigin = string;
export type WorkspaceLaunchRouteKind = string;
export type RunSnapshotMode = "ephemeral" | "always" | "never";

type CValue = JsonRecord & {
  CHAT_ATTACHMENTS_ALLOWED_MIME_PREFIXES: string[];
  CHAT_ATTACHMENTS_MAX_FILES: number;
  CHAT_ATTACHMENTS_MAX_FILE_BYTES: number;
  CHAT_ATTACHMENTS_MAX_FILE_LABEL: string;
  DEFAULT_HOST: string;
  DEFAULT_PORT: number;
  DROPZONE_ALLOWED_MIME_PREFIXES: string[];
  DROPZONE_STATEFUL_MAX_FILE_BYTES: number;
  DROPZONE_STATEFUL_MAX_FILE_LABEL: string;
  DROPZONE_STATELESS_MAX_FILE_BYTES: number;
  DROPZONE_STATELESS_MAX_FILE_LABEL: string;
  DROPZONE_STATELESS_MAX_TOTAL_BYTES: number;
  DROPZONE_STATELESS_MAX_TOTAL_LABEL: string;
};

type TransportRoutes = {
  apiPrefix: string;
  binary: {
    download: string;
    upload: string;
  };
  root: {
    bootstrapPage: string;
    toolsCall: string;
  };
  websocket: {
    frontend: string;
    listenerById: string;
    terminalBySection: string;
  };
};

type BootstrapHandoffProtocol = {
  launcherOriginStorageKey: string;
};

type LocalHostnamePolicy = {
  loopbackHosts: string[];
};

type ServerModeBoundaryPolicyByModeValue = Readonly<
  Record<
    "app" | "ide" | "launcher" | "share",
    {
      capabilities: ServerModeCapabilities;
      workspaceLaunchRouteKind: WorkspaceLaunchRouteKind;
    }
  >
>;

export const ArtifactTypeEnum = readGeneratedStringEnum("ArtifactType");
export const CodeObjTypeEnum = readGeneratedStringEnum("CodeObjType");
export const ConfigLanguageEnum = readGeneratedStringEnum("ConfigLanguage");
export const DateCalendarWeekStartEnum = readGeneratedStringEnum(
  "DateCalendarWeekStart",
);
export const DateControlModeEnum = readGeneratedStringEnum("DateControlMode");
export const DateDisplayFormatEnum =
  readGeneratedStringEnum("DateDisplayFormat");
export const DateSelectionModeEnum =
  readGeneratedStringEnum("DateSelectionMode");
export const DependencyKeyTypeEnum =
  readGeneratedStringEnum("DependencyKeyType");
export const DependencyValueTypeEnum = readGeneratedStringEnum(
  "DependencyValueType",
);
export const DropzoneModeEnum = readGeneratedStringEnum("DropzoneMode");
export const EndpointOriginEnum = readGeneratedStringEnum("EndpointOrigin");
export const SectionTypeEnum = readGeneratedStringEnum("SectionType");
export const TextBlockFormatEnum = readGeneratedStringEnum("TextBlockFormat");
export const TextParamInputUITypeEnum = readGeneratedStringEnum(
  "TextParamInputUIType",
);
export const TimeControlModeEnum = readGeneratedStringEnum("TimeControlMode");
export const TimeDisplayFontEnum = readGeneratedStringEnum("TimeDisplayFont");
export const TimeDisplayFormatEnum =
  readGeneratedStringEnum("TimeDisplayFormat");
export const WorkspaceLaunchRouteKindEnum = readGeneratedStringEnum(
  "WorkspaceLaunchRouteKind",
);

export const BootstrapProtocol =
  readGeneratedExportedValue<BootstrapHandoffProtocol>("BootstrapProtocol");
export const C = readGeneratedExportedValue<CValue>("C");
export const DefaultAppPolicy =
  readGeneratedExportedValue<Policy>("DefaultAppPolicy");
export const EndpointOriginPolicyByRoute = readGeneratedExportedValue<
  Record<string, EndpointOrigin>
>("EndpointOriginPolicyByRoute");
export const LocalHostnamePolicyConfig =
  readGeneratedExportedValue<LocalHostnamePolicy>("LocalHostnamePolicyConfig");
export const ModeScopedLauncherRoutesList = readGeneratedExportedValue<
  string[]
>("ModeScopedLauncherRoutesList");
export const RunSnapshotModeUIConfig = readGeneratedExportedValue<JsonRecord>(
  "RunSnapshotModeUIConfig",
);
export const ServerModeBoundaryPolicyByMode =
  readGeneratedExportedValue<ServerModeBoundaryPolicyByModeValue>(
    "ServerModeBoundaryPolicyByMode",
  );
export const TransportRouteConstants =
  readGeneratedExportedValue<TransportRoutes>("TransportRouteConstants");

export function createPolicy(
  options: CreateOptions<Policy> = {} as CreateOptions<Policy>,
): Policy {
  return cloneGeneratedValue(options) as Policy;
}

export function createCore(options: Partial<Core> = {}): Core {
  const defaults = {
    defaultVariant: null,
    displayName: "",
    id: "",
    name: "",
    sharedModifier: {},
    unsharedKeys: [],
    variants: [],
  };
  return mergeGeneratedOptions<Core>(defaults, options);
}

export function createVariant(options: Partial<Variant> = {}): Variant {
  const defaults = {
    id: "",
    impl: "",
    isFrozen: false,
    modifier: {},
    name: "",
    nonPresetImpls: [],
  };
  return mergeGeneratedOptions<Variant>(defaults, options);
}

export function createContentRef(
  options: CreateOptions<ContentRef> = {} as CreateOptions<ContentRef>,
): ContentRef {
  return cloneGeneratedValue(options) as ContentRef;
}

export function createImageArtifact(
  options: Partial<ImageArtifact> = {},
): ImageArtifact {
  const defaults = {
    id: "",
    type: "Image",
    value: {
      byteLength: 0,
      contentId: "",
      mimeType: "",
      sha256: "",
    },
  };
  return {
    ...mergeGeneratedOptions<ImageArtifact>(defaults, options),
    id: options.id ?? createPngArtifactId(),
    value: options.value ?? createContentRef(),
  };
}

export function createProjectConfig(
  options: Partial<ProjectConfig> = {},
): ProjectConfig {
  const defaults = {
    activeIds: [],
    activeViewModeId: null,
    agenticEdges: [],
    allowJsonSourceKeyEdits: false,
    codegenTargets: [],
    edges: [],
    entryCodeBlockId: null,
    hasPythonCodegenTarget: false,
    id: "",
    isEditingViewMode: false,
    name: "",
    previewImgColor: "",
    runCapabilities: {
      canRunFromMain: false,
      effectiveEntrySectionId: null,
      mainRunDisabledReason: null,
    },
    sectionIdsByPathSlug: {},
    sectionPathSlugsById: {},
    sectionVariantMap: {},
    showParamDisplayNames: false,
    stateMachineEdges: [],
    topLevelSections: {},
    viewModes: {},
    viewport: null,
    viewportInitialized: false,
    watchCodeBaselineByPath: {},
    watchCodeEnabled: false,
    watchCodeFiles: [],
    watchCodeFolders: [],
    watchCodeRegistry: {},
    windowSpaceIdsBySlug: {},
    windowSpaceSlugsById: {},
    windowSpaces: {},
  };
  return mergeGeneratedOptions<ProjectConfig>(defaults, options);
}

export function createSingletonSections(
  options: Partial<SingletonSections> = {},
): SingletonSections {
  const defaults = {
    GenPythonCode: null,
    GenPythonMetadata: null,
    GlobalVariables: null,
  };
  return mergeGeneratedOptions<SingletonSections>(defaults, options);
}

export function createSectionCapabilities(
  options: Partial<SectionCapabilities> = {},
): SectionCapabilities {
  const defaults = {
    canRun: false,
    canSelectAsEntryCodeBlock: false,
    entryCodeBlockValue: null,
    runDisabledReason: null,
    runRequestSectionId: null,
  };
  return mergeGeneratedOptions<SectionCapabilities>(defaults, options);
}

export function createSingleConfig(
  options: Partial<SingleConfig> = {},
): SingleConfig {
  const defaults = {
    artifactGroups: {},
    codeObjImpls: {},
    codeObjVariants: {},
    codeObjs: {},
    genCodeBinding: null,
    parentSectionMap: {},
    projectChatWindowing: {
      instancesById: {},
      nextInstanceNumber: 1,
      order: [],
    },
    projectConfig: createProjectConfig(),
    requiredDecodedImages: [],
    sectionCapabilities: {},
    sectionImpls: {},
    sectionVariants: {},
    sections: {},
    shownParamIds: {},
    singletonSections: createSingletonSections(),
  };
  return {
    ...mergeGeneratedOptions<SingleConfig>(defaults, options),
    projectConfig: createProjectConfig(
      (options.projectConfig ??
        defaults.projectConfig) as Partial<ProjectConfig>,
    ),
    singletonSections: createSingletonSections(
      (options.singletonSections ??
        defaults.singletonSections) as Partial<SingletonSections>,
    ),
  };
}

export function createSettingsState(options: JsonRecord = {}): JsonRecord {
  const defaults = {
    backend: {
      runSnapshotMode: "ephemeral",
    },
  };
  return mergeGeneratedOptions<JsonRecord>(defaults, options);
}

export function createCallableSectionImpl(
  options: Partial<CallableSectionImpl> = {},
): CallableSectionImpl {
  const defaults = {
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    callable: null,
    codeObjVariantMap: {},
    columnWidth: null,
    configLanguage: "python",
    edgeInputParams: [],
    edgeOutputPorts: [],
    hideParams: false,
    hideUnpinnedParams: false,
    id: "",
    ignoreTypeErrors: {
      callable: false,
      params: {},
    },
    isFrozen: false,
    isInOtherProjectConfigs: false,
    isMinimized: false,
    isPreset: false,
    name: "",
    paramFilter: "",
    pinnedParams: [],
    positionAndSizeLocked: false,
    selectedParams: [],
    size: {
      height: 150,
      width: 250,
    },
    styleColor: null,
    tagColor: null,
    type: "Callable",
  };
  return mergeGeneratedOptions<CallableSectionImpl>(defaults, options);
}

export function createCodeParamCodeObjImpl(
  options: Partial<CodeParamCodeObjImpl> = {},
): CodeParamCodeObjImpl {
  const defaults = {
    coreNameEditable: false,
    coreNameType: "TEXT",
    defaultVal: "",
    description: "",
    id: "",
    isPreset: false,
    name: "",
    passingStyle: "DEFAULT",
    type: "CodeParam",
    typeAnnotation: "",
    value: "",
  };
  return mergeGeneratedOptions<CodeParamCodeObjImpl>(defaults, options);
}

export function createTextBlockSectionImpl(
  options: Partial<TextBlockSectionImpl> = {},
): TextBlockSectionImpl {
  const defaults = {
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    format: "Plaintext",
    headingAsSectionName: false,
    id: "",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    isMinimized: false,
    isPreset: false,
    masterFontSizePx: 14,
    metaControlStyle: false,
    name: "",
    positionAndSizeLocked: false,
    size: {
      height: 150,
      width: 500,
    },
    styleColor: null,
    tagColor: null,
    text: "",
    textDisplayMode: "Render",
    type: "TextBlock",
  };
  return mergeGeneratedOptions<TextBlockSectionImpl>(defaults, options);
}

const BaseChildlessCodeObjImplTypeSet = new Set([
  "ButtonParam",
  "CodeParam",
  "ColorPickerParam",
  "DateParam",
  "DropdownParam",
  "DropzoneParam",
  "PasswordParam",
  "RotaryParam",
  "SliderParam",
  "SwitchParam",
  "TextAreaParam",
  "TextParam",
  "TimeParam",
]);

export function isBaseChildlessCodeObjImpl(
  value: BaseCodeObjImplUnion,
): value is BaseChildlessCodeObjImplUnion {
  return BaseChildlessCodeObjImplTypeSet.has(value.type);
}

const BaseParamCodeObjImplTypeSet = new Set([
  "CodeParam",
  "TextParam",
  "DateParam",
  "TimeParam",
  "ButtonParam",
  "SliderParam",
  "RotaryParam",
  "SwitchParam",
  "ColorPickerParam",
  "DropdownParam",
  "PasswordParam",
  "TextAreaParam",
  "DropzoneParam",
  "NestedParam",
]);

export function isBaseParamCodeObjImpl(
  value: BaseCodeObjImplUnion,
): value is BaseParamCodeObjImpl {
  return BaseParamCodeObjImplTypeSet.has(value.type);
}

const BaseSectionWithParamsImplTypeSet = new Set([
  "Callable",
  "Dict",
  "MetaControl",
  "GlobalVariables",
]);

export function isBaseSectionWithParamsImpl(
  value: BaseSectionImplUnion,
): value is BaseSectionImplUnion & {
  codeObjVariantMap: Record<string, string>;
} {
  return BaseSectionWithParamsImplTypeSet.has(value.type);
}
