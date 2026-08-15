import { useReactFlow } from "../canvas/store";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { notifyWorkspaceDocumentChange } from "../document/documentChangeCallback";
import { createNodesMapFromDocumentChildren } from "../document/nodeProjection";
import {
  runWithAtomicallyPublishedWorkspaceStores,
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../document/stores";
import {
  prepareUngroupSections,
  type UngroupPromotedSectionMeasurement,
} from "../document/ungroupSections";
import { useSectionRefs } from "./sectionRefs";

type UngroupFocusSurface = "canvas" | "outline";

type UngroupFocusPlan = {
  groupId: string;
  surface: UngroupFocusSurface;
};

function measurePromotedSection(sectionId: string): UngroupPromotedSectionMeasurement | null {
  const section = useSectionRefs.getState().withNested[sectionId];
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

function captureUngroupFocusPlan(groupIds: ReadonlyArray<string>): UngroupFocusPlan | null {
  if (typeof document === "undefined" || !(document.activeElement instanceof HTMLElement)) {
    return null;
  }
  const activeElement = document.activeElement;
  const outlineItemId = getOutlineItemId(activeElement);
  if (outlineItemId && groupIds.includes(outlineItemId)) {
    return { groupId: outlineItemId, surface: "outline" };
  }
  const sectionRefs = useSectionRefs.getState();
  const groupId = groupIds.find((candidateId) =>
    sectionRefs.withNested[candidateId]?.contains(activeElement),
  );
  return groupId ? { groupId, surface: "canvas" } : null;
}

function getOutlineFocusTarget(sectionId: string): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>("[data-workspace-outline-item]")].find(
      (element) => element.dataset["workspaceOutlineItem"] === sectionId,
    ) ?? null
  );
}

function restoreUngroupFocus(plan: UngroupFocusPlan | null, targetSectionId: string | null): void {
  if (!plan) {
    return;
  }
  requestAnimationFrame(() => {
    if (plan.surface === "outline") {
      const target = targetSectionId
        ? getOutlineFocusTarget(targetSectionId)
        : document.querySelector<HTMLElement>('[role="tree"][aria-label="Workspace outline"]');
      if (!target) {
        throw new Error("Cannot restore Outline focus after ungrouping.");
      }
      target.focus({ preventScroll: true });
      return;
    }
    if (targetSectionId) {
      const refs = useSectionRefs.getState();
      const target = refs.selfOnly[targetSectionId] ?? refs.withNested[targetSectionId];
      if (!target) {
        throw new Error(`Cannot restore focus to ungrouped section ${targetSectionId}.`);
      }
      target.focus({ preventScroll: true });
      return;
    }
    const pane = useReactFlow.getState().domNode?.querySelector<HTMLElement>(".react-flow__pane");
    if (!pane) {
      throw new Error("Cannot restore focus after ungrouping without a mounted canvas pane.");
    }
    pane.focus({ preventScroll: true });
  });
}

// One public structural action owns validation, the canonical document replacement, derived
// geometry, selection pruning, focus restoration, and the single host notification. Every package
// action surface and direct host invocation routes through this function.
export function ungroupSections(groupIds: ReadonlyArray<string>): void {
  if (!useWorkspaceCapabilities.getState().canEditStructure) {
    throw new Error("Ungrouping requires permission to edit workspace structure.");
  }
  const currentDocument = useWorkspaceDocument.getState();
  const currentActiveSections = useActiveSections.getState();
  const prepared = prepareUngroupSections(
    currentDocument,
    currentActiveSections,
    groupIds,
    measurePromotedSection,
  );
  const focusPlan = captureUngroupFocusPlan(prepared.groupIds);
  const nextNodes = createNodesMapFromDocumentChildren(
    prepared.document,
    useNodeInternals.getState().x,
  );
  runWithAtomicallyPublishedWorkspaceStores(
    {
      document: prepared.document,
      nodeInternals: { x: nextNodes },
      activeSections: prepared.activeSections,
    },
    () => {
      useNodeInternals.setState({ x: nextNodes });
      useWorkspaceDocument.setState(prepared.document);
      useActiveSections.setState(prepared.activeSections);
    },
  );
  useReactFlow.setState({ nodesSelectionDims: null });
  notifyWorkspaceDocumentChange();
  restoreUngroupFocus(
    focusPlan,
    focusPlan ? (prepared.focusTargetByGroupId.get(focusPlan.groupId) ?? null) : null,
  );
}
