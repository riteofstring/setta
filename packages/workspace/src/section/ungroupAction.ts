import { getReactFlowStore } from "../canvas/store";
import { getWorkspaceCapabilitiesStore } from "../document/capabilities";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import { createNodesMapFromDocumentChildren } from "../document/nodeProjection";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  getActiveSectionsStore,
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import {
  prepareUngroupSections,
  type UngroupPromotedSectionMeasurement,
} from "../document/ungroupSections";
import { getSectionRefsStore } from "./sectionRefs";
import type { WorkspaceHost } from "../workspaceHost";
import { isWorkspaceHostElement } from "../workspaceHostInternals";

type UngroupFocusSurface = "canvas" | "outline";

type UngroupFocusPlan = {
  groupId: string;
  outlineRoot?: HTMLElement;
  surface: UngroupFocusSurface;
};

function measurePromotedSection(
  host: WorkspaceHost,
  sectionId: string,
): UngroupPromotedSectionMeasurement | null {
  const section = getSectionRefsStore(host).getState().withNested[sectionId];
  if (!section || section.offsetWidth <= 0 || section.offsetHeight <= 0) {
    return null;
  }
  return { width: section.offsetWidth, height: section.offsetHeight };
}

function getOutlineItemId(element: HTMLElement): string | null {
  return (
    element.closest<HTMLElement>("[data-workspace-outline-item]")?.dataset[
      "workspaceOutlineItem"
    ] ?? null
  );
}

function captureUngroupFocusPlan(
  host: WorkspaceHost,
  groupIds: ReadonlyArray<string>,
): UngroupFocusPlan | null {
  if (
    typeof document === "undefined" ||
    !(document.activeElement instanceof HTMLElement)
  ) {
    return null;
  }
  const activeElement = document.activeElement;
  if (!isWorkspaceHostElement(host, activeElement)) {
    return null;
  }
  const outlineItemId = getOutlineItemId(activeElement);
  if (outlineItemId && groupIds.includes(outlineItemId)) {
    const outlineRoot = activeElement.closest<HTMLElement>(
      '[role="tree"][aria-label="Workspace outline"]',
    );
    if (!outlineRoot) {
      return null;
    }
    return { groupId: outlineItemId, outlineRoot, surface: "outline" };
  }
  const sectionRefs = getSectionRefsStore(host).getState();
  const groupId = groupIds.find((candidateId) =>
    sectionRefs.withNested[candidateId]?.contains(activeElement),
  );
  return groupId ? { groupId, surface: "canvas" } : null;
}

function getOutlineFocusTarget(
  outlineRoot: HTMLElement,
  sectionId: string,
): HTMLElement | null {
  return (
    [
      ...outlineRoot.querySelectorAll<HTMLElement>(
        "[data-workspace-outline-item]",
      ),
    ].find(
      (element) => element.dataset["workspaceOutlineItem"] === sectionId,
    ) ?? null
  );
}

function restoreOutlineFocus(
  plan: UngroupFocusPlan,
  targetSectionId: string | null,
): void {
  const target = targetSectionId
    ? plan.outlineRoot
      ? getOutlineFocusTarget(plan.outlineRoot, targetSectionId)
      : null
    : (plan.outlineRoot ?? null);
  if (!target) {
    throw new Error("Cannot restore Outline focus after ungrouping.");
  }
  target.focus({ preventScroll: true });
}

function restoreCanvasFocus(
  host: WorkspaceHost,
  targetSectionId: string | null,
): void {
  if (targetSectionId) {
    const refs = getSectionRefsStore(host).getState();
    const target =
      refs.selfOnly[targetSectionId] ?? refs.withNested[targetSectionId];
    if (!target) {
      throw new Error(
        `Cannot restore focus to ungrouped section ${targetSectionId}.`,
      );
    }
    target.focus({ preventScroll: true });
    return;
  }
  const pane = getReactFlowStore(host)
    .getState()
    .domNode?.querySelector<HTMLElement>(".react-flow__pane");
  if (!pane) {
    throw new Error(
      "Cannot restore focus after ungrouping without a mounted canvas pane.",
    );
  }
  pane.focus({ preventScroll: true });
}

function restoreUngroupFocus(
  host: WorkspaceHost,
  plan: UngroupFocusPlan | null,
  targetSectionId: string | null,
): void {
  if (!plan) {
    return;
  }
  requestAnimationFrame(() => {
    if (plan.surface === "outline") {
      restoreOutlineFocus(plan, targetSectionId);
      return;
    }
    restoreCanvasFocus(host, targetSectionId);
  });
}

export function ungroupSections(
  host: WorkspaceHost,
  groupIds: ReadonlyArray<string>,
): void {
  if (!getWorkspaceCapabilitiesStore(host).getState().canEditStructure) {
    throw new Error(
      "Ungrouping requires permission to edit workspace structure.",
    );
  }
  const documentStore = getWorkspaceDocumentStore(host);
  const nodeInternalsStore = getNodeInternalsStore(host);
  const activeSectionsStore = getActiveSectionsStore(host);
  const currentDocument = documentStore.getState();
  const currentActiveSections = activeSectionsStore.getState();
  const prepared = prepareUngroupSections(
    currentDocument,
    currentActiveSections,
    groupIds,
    (sectionId) => measurePromotedSection(host, sectionId),
  );
  const focusPlan = captureUngroupFocusPlan(host, prepared.groupIds);
  const nextNodes = createNodesMapFromDocumentChildren(
    host,
    prepared.document,
    nodeInternalsStore.getState().x,
  );
  runWithAtomicallyPublishedWorkspaceStores(
    host,
    {
      document: prepared.document,
      nodeInternals: { x: nextNodes },
      activeSections: prepared.activeSections,
    },
    () => {
      nodeInternalsStore.setState({ x: nextNodes });
      documentStore.setState(prepared.document);
      activeSectionsStore.setState(prepared.activeSections);
    },
  );
  getReactFlowStore(host).setState({ nodesSelectionDims: null });
  notifyWorkspaceDocumentChange(host);
  restoreUngroupFocus(
    host,
    focusPlan,
    focusPlan
      ? (prepared.focusTargetByGroupId.get(focusPlan.groupId) ?? null)
      : null,
  );
}
