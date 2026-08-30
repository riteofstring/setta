import type {
  Position,
  TopLevelSectionLayout,
  WorkspaceDocument,
  WorkspaceItem,
  WorkspaceSection,
  WorkspaceSectionData,
  WorkspaceSectionItemTree,
} from "../document/types";
import type { WorkspaceSnapshot } from "../document/workspaceSnapshot";

export const WORKSPACE_CLIPBOARD_SCHEMA_ID =
  "setta.workspace.section-clipboard";
export const WORKSPACE_CLIPBOARD_SCHEMA_VERSION = 1;
export const WORKSPACE_LOCAL_CLIPBOARD_PAYLOAD_VERSION = 1;
export const WORKSPACE_CLIPBOARD_MAX_TEXT_BYTES = 1_000_000;
export const WORKSPACE_CLIPBOARD_MAX_SECTION_COUNT = 1_000;
export const WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT = 10_000;

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue =
  JsonPrimitive | Array<JsonValue> | { [key: string]: JsonValue };

export type WorkspaceClipboardAuthorityMetadata = Readonly<{
  id: string;
  payloadVersion: number;
}>;

export type WorkspaceClipboardItemIdMaps = ReadonlyMap<
  string,
  ReadonlyMap<string, string>
>;

export type WorkspaceClipboardIdMaps = Readonly<{
  itemIdsBySection: WorkspaceClipboardItemIdMaps;
  sectionIds: ReadonlyMap<string, string>;
}>;

export type WorkspaceClipboardSectionDataCloneContext =
  WorkspaceClipboardIdMaps &
    Readonly<{
      sourceSectionId: string;
    }>;

export type WorkspaceClipboardItemDataCloneContext = WorkspaceClipboardIdMaps &
  Readonly<{
    sourceItemId: string;
    sourceSectionId: string;
  }>;

export type WorkspaceLocalClipboardAuthority = Readonly<{
  cloneItemData?: (
    source: WorkspaceSnapshot<WorkspaceSectionData>,
    context: WorkspaceClipboardItemDataCloneContext,
  ) => WorkspaceSectionData;
  cloneSectionData?: (
    source: WorkspaceSnapshot<WorkspaceSectionData>,
    context: WorkspaceClipboardSectionDataCloneContext,
  ) => WorkspaceSectionData;
  id: string;
  kind: "local";
}>;

export type WorkspaceClipboardPrepareCopyRequest = Readonly<{
  fragment: WorkspaceClipboardFragment;
  rootIds: ReadonlyArray<string>;
  source: WorkspaceClipboardSource;
}>;

export type WorkspaceClipboardPastePlacement = Readonly<Position>;

export type WorkspaceClipboardPasteRequest = Readonly<{
  fragment: WorkspaceClipboardFragment;
  payload: JsonValue;
  payloadVersion: number;
  placement: WorkspaceClipboardPastePlacement;
  rootIds: ReadonlyArray<string>;
}>;

export type WorkspaceClipboardPasteResult = Readonly<{
  rootIds: ReadonlyArray<string>;
}>;

export type WorkspaceDelegatedClipboardAuthority = Readonly<{
  id: string;
  kind: "delegated";
  paste: (
    request: WorkspaceClipboardPasteRequest,
  ) => Promise<WorkspaceClipboardPasteResult> | WorkspaceClipboardPasteResult;
  payloadVersion: number;
  prepareCopy: (
    request: WorkspaceClipboardPrepareCopyRequest,
  ) => Promise<JsonValue> | JsonValue;
}>;

export type WorkspaceClipboardAuthority =
  WorkspaceDelegatedClipboardAuthority | WorkspaceLocalClipboardAuthority;

export type WorkspaceClipboardSection = Readonly<{
  children: ReadonlyArray<string>;
  id: string;
  isHorizontalOrientation: boolean;
  isMinimized: boolean;
  kind: string;
  name: string;
  overflowMode: boolean;
  positionAndSizeLocked: boolean;
  size: Readonly<WorkspaceSection["size"]>;
  styleColor: string | null;
  tagColor: string | null;
}>;

export type WorkspaceClipboardTopLevelLayout = Readonly<TopLevelSectionLayout>;

export type WorkspaceClipboardFragment = Readonly<{
  roots: ReadonlyArray<string>;
  sections: Readonly<Record<string, WorkspaceClipboardSection>>;
  topLevelLayouts: Readonly<Record<string, WorkspaceClipboardTopLevelLayout>>;
}>;

export type WorkspaceClipboardSource = Readonly<{
  sections: Readonly<Record<string, WorkspaceSnapshot<WorkspaceSection>>>;
}>;

export type WorkspaceClipboardCapturedSelection = Readonly<{
  fragment: WorkspaceClipboardFragment;
  source: WorkspaceClipboardSource;
}>;

export type WorkspaceClipboardLocalSectionContent = Readonly<{
  data?: WorkspaceSectionData;
  itemTree?: WorkspaceSectionItemTree;
}>;

export type WorkspaceLocalClipboardPayload = Readonly<{
  sections: Readonly<Record<string, WorkspaceClipboardLocalSectionContent>>;
}>;

export type WorkspaceClipboardEnvelope = Readonly<{
  authority: WorkspaceClipboardAuthorityMetadata;
  fragment: WorkspaceClipboardFragment;
  payload: JsonValue;
  schema: typeof WORKSPACE_CLIPBOARD_SCHEMA_ID;
  version: typeof WORKSPACE_CLIPBOARD_SCHEMA_VERSION;
}>;

export type WorkspaceClipboardIdentifierAllocator = Readonly<{
  allocateItemId: (sourceSectionId: string, sourceItemId: string) => string;
  allocateSectionId: (sourceSectionId: string) => string;
}>;

export type WorkspaceClipboardLocalPastePlan = Readonly<{
  itemIdsBySection: WorkspaceClipboardItemIdMaps;
  nextDocument: WorkspaceDocument;
  rootIds: ReadonlyArray<string>;
  sectionIds: ReadonlyMap<string, string>;
}>;

export type WorkspaceClipboardLocalPastePlanInput = Readonly<{
  allocator: WorkspaceClipboardIdentifierAllocator;
  authority: WorkspaceLocalClipboardAuthority;
  document: WorkspaceDocument;
  fragment: WorkspaceClipboardFragment;
  payload: WorkspaceLocalClipboardPayload;
  placement: WorkspaceClipboardPastePlacement;
}>;

export type WorkspaceClipboardAvailabilityAction = Readonly<{
  disabledReason: string | null;
  enabled: boolean;
}>;

export type WorkspaceClipboardRuntimeState = Readonly<{
  authority: WorkspaceClipboardAuthority | null;
  disposed: boolean;
  pending: boolean;
}>;

export type WorkspaceClipboardRuntimeListener = (
  state: WorkspaceClipboardRuntimeState,
) => void;

export type WorkspaceClipboardOperationLease = Readonly<{
  release: () => void;
}>;

export type WorkspaceClipboardEnvelopeErrorCode =
  | "authority-mismatch"
  | "authority-version-mismatch"
  | "clipboard-too-large"
  | "invalid-envelope"
  | "invalid-json"
  | "unknown-section-kind"
  | "unsupported-schema"
  | "unsupported-version";

export type WorkspaceClipboardEnvelopeParseResult =
  | Readonly<{ envelope: WorkspaceClipboardEnvelope; ok: true }>
  | Readonly<{ code: WorkspaceClipboardEnvelopeErrorCode; ok: false }>;

export type WorkspaceClipboardEnvelopeParseOptions = Readonly<{
  authority: WorkspaceClipboardAuthorityMetadata;
  isSectionKindSupported: (kind: string) => boolean;
  maxTextBytes?: number;
}>;

export type WorkspaceClipboardCaptureInput = Readonly<{
  activeIds: ReadonlyArray<string>;
  parentSectionMap: Readonly<Record<string, string>>;
  sections: Readonly<Record<string, WorkspaceSection>>;
  topLevelSections: Readonly<Record<string, TopLevelSectionLayout>>;
}>;

export type WorkspaceClipboardLocalPayloadParseResult =
  | Readonly<{ ok: true; payload: WorkspaceLocalClipboardPayload }>
  | Readonly<{ code: "invalid-local-payload"; ok: false }>;

export type WorkspaceClipboardPreparedPayload = Readonly<{
  envelope: WorkspaceClipboardEnvelope;
  localPayload: WorkspaceLocalClipboardPayload | null;
}>;

export type WorkspaceClipboardItemSource = WorkspaceSnapshot<WorkspaceItem>;
