import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type {
  WorkspaceActionRejectionReason,
  WorkspaceActionResult,
  WorkspaceCapabilities,
  WorkspaceClipboardAdapter,
  WorkspaceDocument,
  WorkspacePoint,
} from "../core.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import {
  materializeWorkspaceClipboardClone,
  placeWorkspaceClipboardSections,
  prepareWorkspaceClipboardCopy,
  readWorkspaceClipboardItem,
  workspaceClipboardCloneRequest,
  workspaceClipboardFrameDocument,
  type WorkspaceClipboardPlacedSections,
  type WorkspaceClipboardReadResult,
} from "./workspace-clipboard.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import {
  validateWorkspaceSectionDefinitions,
  type WorkspaceSectionRegistry,
} from "./workspace-section-registry.js";

type ClipboardRejectedResult = Extract<WorkspaceActionResult, { status: "rejected" }>;

type ClipboardStageRejection = Readonly<{
  detail?: string;
  reason: WorkspaceActionRejectionReason;
  status: "rejected";
}>;

type PendingWorkspacePaste<TSectionData> = Readonly<{
  focusSectionId: string;
  rootSectionIds: readonly string[];
  sectionCount: number;
  typedSections: WorkspaceClipboardPlacedSections<TSectionData>["sections"];
}>;

type PreparedWorkspacePaste<TSectionData> =
  | ClipboardStageRejection
  | Readonly<{
      paste: WorkspaceClipboardPlacedSections<TSectionData>;
      pending: PendingWorkspacePaste<TSectionData>;
      status: "ready";
    }>;

export type WorkspaceClipboardCoordinator = Readonly<{
  announcement: string;
  configured: boolean;
  copySelection(): Promise<WorkspaceActionResult>;
  paste(): Promise<WorkspaceActionResult>;
  recordCanvasPoint(point: WorkspacePoint): void;
}>;

function rejected(reason: WorkspaceActionRejectionReason): ClipboardRejectedResult {
  return { reason, status: "rejected" };
}

function countText(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

const clipboardRejectionText: Partial<Record<WorkspaceActionRejectionReason, string>> = {
  "clipboard-busy": "A clipboard action is already in progress.",
  "clipboard-clone-failed": "Paste failed while the host was cloning the sections.",
  "clipboard-clone-invalid": "Paste failed because the host returned an invalid clone.",
  "clipboard-clone-partial": "Paste failed because the host did not clone the complete subtree.",
  "clipboard-data-invalid": "Paste failed because the clipboard section data is invalid.",
  "clipboard-data-unsupported":
    "Paste failed because this workspace does not support the copied sections.",
  "clipboard-empty": "There are no workspace sections on the clipboard.",
  "clipboard-format-unsupported": "The clipboard does not contain Setta workspace sections.",
  "clipboard-invalid": "The clipboard contains invalid workspace section data.",
  "clipboard-read-failed": "Unable to read workspace sections from the clipboard.",
  "clipboard-selection-empty": "Select at least one section to copy.",
  "clipboard-unauthorized": "The host did not authorize these sections to be pasted.",
  "clipboard-unavailable": "Clipboard actions are not configured for this workspace.",
  "clipboard-version-unsupported": "The copied sections use an unsupported clipboard version.",
  "clipboard-write-failed": "Unable to write the selected sections to the clipboard.",
  "section-geometry-unavailable":
    "Wait for the selected sections to finish rendering, then copy them again.",
  "section-id-exists": "Paste failed because the host returned a section ID already in use.",
  "structure-edit-disabled": "Paste is unavailable while structure editing is disabled.",
};

function rejectionAnnouncement(reason: WorkspaceActionRejectionReason, detail?: string): string {
  const base = clipboardRejectionText[reason] ?? "Unable to complete the clipboard action.";
  return detail && detail.trim().length > 0 ? `${base} ${detail}` : base;
}

function rootRects<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  canvas: WorkspaceCanvasController,
) {
  return document.rootSections.map((root) => {
    const measured = canvas.getSectionRect(root.sectionId);
    const section = document.sections[root.sectionId];
    if (measured) return measured;
    if (!section) throw new Error(`Workspace root ${root.sectionId} is missing its section.`);
    return {
      height: section.size.height.value,
      width: section.size.width.value,
      x: root.position.x,
      y: root.position.y,
    };
  });
}

function selectedPlacementPoint(
  selectedSectionIds: readonly string[],
  canvas: WorkspaceCanvasController,
): WorkspacePoint | null {
  const rects = selectedSectionIds.flatMap((sectionId) => {
    const rect = canvas.getSectionRect(sectionId);
    return rect ? [rect] : [];
  });
  if (rects.length === 0) return null;
  return {
    x: Math.min(...rects.map((rect) => rect.x)) + 24,
    y: Math.min(...rects.map((rect) => rect.y)) + 24,
  };
}

function fallbackPlacementPoint(canvas: WorkspaceCanvasController): WorkspacePoint {
  const viewport = canvas.getVisibleWorkspaceRect();
  return { x: viewport.x + 24, y: viewport.y + 24 };
}

function preferredPlacementPoint(
  selectedSectionIds: readonly string[],
  canvas: WorkspaceCanvasController,
  lastCanvasPoint: WorkspacePoint | null,
): WorkspacePoint {
  return (
    lastCanvasPoint ??
    selectedPlacementPoint(selectedSectionIds, canvas) ??
    fallbackPlacementPoint(canvas)
  );
}

function frameRegistryRejection<TSectionData>(
  frame: Parameters<typeof workspaceClipboardFrameDocument>[0],
  registry: WorkspaceSectionRegistry<TSectionData>,
): Readonly<{ detail?: string; reason: WorkspaceActionRejectionReason }> | null {
  const document = workspaceClipboardFrameDocument(frame);
  const unsupported = Object.values(document.sections).find(
    (section) => !registry.definition(section.kind),
  );
  if (unsupported) return { reason: "clipboard-data-unsupported" };
  try {
    validateWorkspaceSectionDefinitions(
      document,
      registry as unknown as WorkspaceSectionRegistry<unknown>,
    );
    return null;
  } catch (error) {
    if (error instanceof TypeError) {
      return { detail: error.message, reason: "clipboard-invalid" };
    }
    throw error;
  }
}

async function readAdapterClipboard<TSectionData>(
  adapter: WorkspaceClipboardAdapter<TSectionData>,
): Promise<WorkspaceClipboardReadResult | ClipboardStageRejection> {
  try {
    return readWorkspaceClipboardItem(await adapter.read());
  } catch {
    return { reason: "clipboard-read-failed", status: "rejected" };
  }
}

async function requestAdapterClone<TSectionData>(
  adapter: WorkspaceClipboardAdapter<TSectionData>,
  frame: Extract<WorkspaceClipboardReadResult, { status: "ready" }>["frame"],
): Promise<ClipboardStageRejection | Readonly<{ decision: unknown; status: "ready" }>> {
  try {
    return {
      decision: await adapter.cloneSections(workspaceClipboardCloneRequest(frame)),
      status: "ready",
    };
  } catch {
    return { reason: "clipboard-clone-failed", status: "rejected" };
  }
}

async function prepareWorkspacePaste<TSectionData>({
  adapter,
  canvas,
  capabilitiesRef,
  documentRef,
  gridOptionsRef,
  lastCanvasPoint,
  registryRef,
  selectionRef,
}: Readonly<{
  adapter: WorkspaceClipboardAdapter<TSectionData>;
  canvas: WorkspaceCanvasController;
  capabilitiesRef: RefObject<WorkspaceCapabilities>;
  documentRef: RefObject<WorkspaceDocument<TSectionData>>;
  gridOptionsRef: RefObject<ResolvedWorkspaceGridOptions>;
  lastCanvasPoint: WorkspacePoint | null;
  registryRef: RefObject<WorkspaceSectionRegistry<TSectionData>>;
  selectionRef: RefObject<readonly string[]>;
}>): Promise<PreparedWorkspacePaste<TSectionData>> {
  const read = await readAdapterClipboard(adapter);
  if (read.status === "rejected") return read;
  const registryRejection = frameRegistryRejection(read.frame, registryRef.current);
  if (registryRejection) return { ...registryRejection, status: "rejected" };
  const clone = await requestAdapterClone(adapter, read.frame);
  if (clone.status === "rejected") return clone;
  if (!capabilitiesRef.current.editStructure) {
    return { reason: "structure-edit-disabled", status: "rejected" };
  }
  const currentDocument = documentRef.current;
  const materialized = materializeWorkspaceClipboardClone<TSectionData>(
    read.frame,
    clone.decision,
    new Set(Object.keys(currentDocument.sections)),
  );
  if (materialized.status === "rejected") return materialized;
  const grid = gridOptionsRef.current;
  const paste = placeWorkspaceClipboardSections(materialized.paste, {
    grid: grid.snap ? grid.spacing : null,
    preferredPosition: preferredPlacementPoint(selectionRef.current, canvas, lastCanvasPoint),
    rootRects: rootRects(currentDocument, canvas),
  });
  const rootSectionIds = paste.rootSections.map(({ sectionId }) => sectionId);
  const focusSectionId = rootSectionIds[0];
  if (!focusSectionId) return { reason: "clipboard-clone-invalid", status: "rejected" };
  return {
    paste,
    pending: {
      focusSectionId,
      rootSectionIds,
      sectionCount: materialized.paste.sectionCount,
      typedSections: paste.sections,
    },
    status: "ready",
  };
}

function pastedSectionsAccepted<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  pending: PendingWorkspacePaste<TSectionData>,
): boolean {
  const rootIds = new Set(document.rootSections.map(({ sectionId }) => sectionId));
  if (pending.rootSectionIds.some((sectionId) => !rootIds.has(sectionId))) return false;
  return Object.entries(pending.typedSections).every(([sectionId, expected]) => {
    const actual = document.sections[sectionId];
    return actual !== undefined && JSON.stringify(actual) === JSON.stringify(expected);
  });
}

export function useWorkspaceClipboardCoordinator<TSectionData>({
  adapter,
  canvasControllerRef,
  capabilitiesRef,
  commitPaste,
  commitSelection,
  document,
  documentRef,
  gridOptionsRef,
  registryRef,
  selectionRef,
}: Readonly<{
  adapter: WorkspaceClipboardAdapter<TSectionData> | undefined;
  canvasControllerRef: RefObject<WorkspaceCanvasController | null>;
  capabilitiesRef: RefObject<WorkspaceCapabilities>;
  commitPaste(paste: WorkspaceClipboardPlacedSections<TSectionData>): WorkspaceActionResult;
  commitSelection(sectionIds: readonly string[]): WorkspaceActionResult;
  document: WorkspaceDocument<TSectionData>;
  documentRef: RefObject<WorkspaceDocument<TSectionData>>;
  gridOptionsRef: RefObject<ResolvedWorkspaceGridOptions>;
  registryRef: RefObject<WorkspaceSectionRegistry<TSectionData>>;
  selectionRef: RefObject<readonly string[]>;
}>): WorkspaceClipboardCoordinator {
  const adapterRef = useRef(adapter);
  const busyRef = useRef(false);
  const lastCanvasPointRef = useRef<WorkspacePoint | null>(null);
  const pendingRef = useRef<PendingWorkspacePaste<TSectionData> | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [revision, setRevision] = useState(0);
  adapterRef.current = adapter;

  const rejectWithAnnouncement = useCallback(
    (reason: WorkspaceActionRejectionReason, detail?: string): ClipboardRejectedResult => {
      setAnnouncement(rejectionAnnouncement(reason, detail));
      return rejected(reason);
    },
    [],
  );

  const copySelection = useCallback(async (): Promise<WorkspaceActionResult> => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter) return rejectWithAnnouncement("clipboard-unavailable");
    if (busyRef.current) return rejectWithAnnouncement("clipboard-busy");
    const canvas = canvasControllerRef.current;
    if (!canvas) return rejectWithAnnouncement("canvas-unavailable");
    const prepared = prepareWorkspaceClipboardCopy(
      documentRef.current,
      selectionRef.current,
      (sectionId) => canvas.getSectionRect(sectionId),
    );
    if (prepared.status === "rejected") {
      return rejectWithAnnouncement(prepared.reason);
    }
    busyRef.current = true;
    try {
      await currentAdapter.write(prepared.item);
      setAnnouncement(
        `Copied ${countText(prepared.rootCount, "selected section")} with ${countText(prepared.sectionCount, "section")} in the complete subtree.`,
      );
      return { status: "applied" };
    } catch {
      return rejectWithAnnouncement("clipboard-write-failed");
    } finally {
      busyRef.current = false;
    }
  }, [canvasControllerRef, documentRef, rejectWithAnnouncement, selectionRef]);

  const paste = useCallback(async (): Promise<WorkspaceActionResult> => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter) return rejectWithAnnouncement("clipboard-unavailable");
    if (!capabilitiesRef.current.editStructure) {
      return rejectWithAnnouncement("structure-edit-disabled");
    }
    if (busyRef.current) return rejectWithAnnouncement("clipboard-busy");
    const canvas = canvasControllerRef.current;
    if (!canvas) return rejectWithAnnouncement("canvas-unavailable");
    busyRef.current = true;
    try {
      const prepared = await prepareWorkspacePaste({
        adapter: currentAdapter,
        canvas,
        capabilitiesRef,
        documentRef,
        gridOptionsRef,
        lastCanvasPoint: lastCanvasPointRef.current,
        registryRef,
        selectionRef,
      });
      if (prepared.status === "rejected") {
        return rejectWithAnnouncement(prepared.reason, prepared.detail);
      }
      const result = commitPaste(prepared.paste);
      if (result.status !== "applied") {
        return result.status === "rejected"
          ? rejectWithAnnouncement(result.reason)
          : rejectWithAnnouncement("clipboard-clone-invalid");
      }
      pendingRef.current = prepared.pending;
      setAnnouncement("");
      setRevision((current) => current + 1);
      return result;
    } finally {
      busyRef.current = false;
    }
  }, [
    canvasControllerRef,
    capabilitiesRef,
    commitPaste,
    documentRef,
    gridOptionsRef,
    registryRef,
    rejectWithAnnouncement,
    selectionRef,
  ]);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    if (!pastedSectionsAccepted(document, pending)) {
      setAnnouncement("Paste was not accepted by the controlled host. The workspace is unchanged.");
      return;
    }
    commitSelection(pending.rootSectionIds);
    setAnnouncement(`Pasted ${countText(pending.sectionCount, "section")} in one change.`);
    void canvasControllerRef.current?.focusSelectionControlWhenReady(pending.focusSectionId);
  }, [canvasControllerRef, commitSelection, document, revision]);

  const recordCanvasPoint = useCallback((point: WorkspacePoint) => {
    lastCanvasPointRef.current = { ...point };
  }, []);

  return {
    announcement,
    configured: adapter !== undefined,
    copySelection,
    paste,
    recordCanvasPoint,
  };
}
