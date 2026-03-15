import { denormalizeFloatingBounds } from "components/ChatWindowing/projectChatSnapLayout";
import { normalizeProjectChatWindowingState } from "state/actions/projectChatWindowingStateNormalization";
import type { ZustandProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  WindowSpaceSurfaceKindEnum,
  createProjectChatWindowInstance,
  createProjectChatWindowingState,
  type ProjectChatWindowingState,
  type WindowSpaceConfig,
  type WindowSpaceState,
} from "utils/generatedTypes";
import {
  resolveAuthoringFloatingViewport,
  type AuthoringFloatingViewport,
} from "./windowSpaceSnapshotCapture";
import { dedupeRestoredSectionBindings } from "./windowSpaceSnapshotRestoreSectionBindings";

function resolveRestoredWorkspaceWindowChatId(
  window: NonNullable<WindowSpaceState["windowsById"][string]>,
): string | null | undefined {
  return window.mode === ChatWindowModeEnum.project_ai_mode
    ? window.chatId
    : null;
}

function resolveNextProjectChatWindowInstanceNumber(
  instanceIds: Array<string>,
): number {
  let nextInstanceNumber = 1;
  for (const instanceId of instanceIds) {
    const match = /^project-chat-window-(\d+)$/.exec(instanceId);
    if (!match) {
      continue;
    }
    const parsed = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      continue;
    }
    nextInstanceNumber = Math.max(nextInstanceNumber, parsed + 1);
  }
  return nextInstanceNumber;
}

export function createProjectChatWindowingStateFromWindowSpace(
  windowSpace: WindowSpaceConfig,
  { sections }: Pick<ZustandProjectState, "sections">,
  viewport: AuthoringFloatingViewport = resolveAuthoringFloatingViewport(),
): ProjectChatWindowingState {
  const instancesById: ProjectChatWindowingState["instancesById"] = {};
  const order: Array<string> = [];
  const seen = new Set<string>();
  const orderedInstanceIds = [
    ...windowSpace.order,
    ...Object.keys(windowSpace.windowsById),
  ];

  for (const instanceId of orderedInstanceIds) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    const window = windowSpace.windowsById[instanceId];
    if (!window) {
      continue;
    }
    if (
      window.surfaceKind === WindowSpaceSurfaceKindEnum.section &&
      (!window.sectionIdOrNull ||
        !Object.hasOwn(sections, window.sectionIdOrNull))
    ) {
      continue;
    }
    instancesById[instanceId] = createProjectChatWindowInstance({
      instanceId,
      placement: ChatWindowPlacementEnum.floating,
      mode: window.mode,
      sectionIdOrNull: window.sectionIdOrNull,
      title:
        window.surfaceKind === WindowSpaceSurfaceKindEnum.section
          ? null
          : window.title,
      chatId: resolveRestoredWorkspaceWindowChatId(window),
      isClosed: false,
      isMinimized: false,
      isMaximized: false,
      lastPlacementBeforeMaximize: null,
      zIndex: window.zIndex,
      lastFocusedAt: window.zIndex,
      bounds: denormalizeFloatingBounds(
        window.normalizedBounds,
        viewport.viewportWidthPx,
        viewport.viewportHeightPx,
        viewport.insets,
      ),
    });
    order.push(instanceId);
  }

  return dedupeRestoredSectionBindings(
    normalizeProjectChatWindowingState(
      createProjectChatWindowingState({
        instancesById,
        order,
        nextInstanceNumber: resolveNextProjectChatWindowInstanceNumber(order),
      }),
    ),
  );
}
