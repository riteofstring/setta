import type { WorkspaceActionResult, WorkspaceDocument } from "../core.js";
import type { SectionMovePlan } from "./section-move-planning.js";
import type {
  WorkspaceSectionMovePreview,
  WorkspaceSectionMoveSession,
} from "./workspace-section-move-session.js";

function moveSubject<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionIds: readonly string[],
): string {
  const title = document.sections[sectionIds[0] ?? ""]?.title ?? "Section";
  return sectionIds.length === 1 ? title : `${title} and ${String(sectionIds.length - 1)} more`;
}

function destinationDescription<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): string {
  if (plan.destination.parentId === null) {
    return "the canvas";
  }
  return document.sections[plan.destination.parentId]?.title ?? "the destination container";
}

function nestedPositionDescription<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): string {
  if (plan.destination.parentId === null) {
    return "";
  }
  if (plan.destination.placement.type === "freeform") {
    const position = plan.destination.placement.positions[plan.sectionIds[0] ?? ""];
    return position
      ? ` at x ${formatCoordinate(position.x)}, y ${formatCoordinate(position.y)}`
      : "";
  }
  const currentCount = document.sections[plan.destination.parentId]?.childLayout?.sectionIds.length;
  const movedFromDestination = plan.sourceParentIds.filter(
    (parentId) => parentId === plan.destination.parentId,
  ).length;
  const total = (currentCount ?? 0) - movedFromDestination + plan.sectionIds.length;
  const first = plan.destination.placement.index + 1;
  const last = plan.destination.placement.index + plan.sectionIds.length;
  const position = first === last ? String(first) : `${String(first)} through ${String(last)}`;
  return `, position ${position} of ${String(total)}`;
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.0+$/u, "");
}

export function workspaceSectionMovePreviewAnnouncement<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  plan: SectionMovePlan,
): string {
  return `Preview: ${moveSubject(document, plan.sectionIds)} will move to ${destinationDescription(document, plan)}${nestedPositionDescription(document, plan)}.`;
}

export function workspaceSectionMoveCompletionAnnouncement<TSectionData>(
  session: WorkspaceSectionMoveSession<TSectionData>,
  preview: WorkspaceSectionMovePreview,
  result: WorkspaceActionResult,
): string {
  const subject = moveSubject(session.document, preview.plan.sectionIds);
  if (result.status === "applied") {
    return `${subject} moved to ${destinationDescription(session.document, preview.plan)}${nestedPositionDescription(session.document, preview.plan)}.`;
  }
  if (result.status === "unchanged") {
    return `${subject} stayed in place.`;
  }
  if ("reason" in result && result.reason === "section-locked") {
    return `${subject} did not move because one of the selected sections is locked.`;
  }
  return `${subject} did not move because the proposed destination was rejected.`;
}

export function workspaceSectionMovePendingAnnouncement(
  session: WorkspaceSectionMoveSession,
  preview: WorkspaceSectionMovePreview,
): string {
  return `Checking the move for ${moveSubject(session.document, preview.plan.sectionIds)}.`;
}

export function workspaceSectionMoveControlledRejectionAnnouncement(
  session: WorkspaceSectionMoveSession,
  preview: WorkspaceSectionMovePreview,
): string {
  return `${moveSubject(session.document, preview.plan.sectionIds)} did not move because the controlled host did not accept the change.`;
}

export function workspaceSectionMoveMismatchAnnouncement(
  session: WorkspaceSectionMoveSession,
  reason: string,
): string {
  return `${moveSubject(session.document, session.sectionIds)} did not move. ${reason || "The displayed destination changed before completion."}`;
}
