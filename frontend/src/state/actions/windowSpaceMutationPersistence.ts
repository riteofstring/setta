import { dispatchOptimisticProjectStateUpdate } from "state/actions/projectStateOptimisticUpdates";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  route_delete_window_space,
  route_set_window_space_name,
  route_set_window_space_sort_order,
} from "utils/generatedEndpoints";
import { type WindowSpaceConfig } from "utils/generatedTypes";

import {
  canMutateWindowSpaceLayout,
  getProjectWindowSpaces,
  sortWindowSpaces,
} from "./windowSpaceQueries";

function cloneWindowSpaces(
  windowSpaces: Record<string, WindowSpaceConfig>,
): Record<string, WindowSpaceConfig> {
  return Object.fromEntries(
    Object.entries(windowSpaces).map(([windowSpaceId, windowSpace]) => [
      windowSpaceId,
      {
        ...windowSpace,
        windowsById: Object.fromEntries(
          Object.entries(windowSpace.windowsById).map(
            ([instanceId, window]) => [instanceId, { ...window }],
          ),
        ),
        order: [...windowSpace.order],
      },
    ]),
  );
}

function dispatchOptimisticWindowSpaceMutation({
  apply,
  projectConfigId,
  send,
}: {
  apply: (state: ZustandProjectState) => void;
  projectConfigId: string;
  send: (args: {
    frontendOpId: string;
    projectConfigId: string;
  }) => void | Promise<unknown>;
}) {
  if (!canMutateWindowSpaceLayout()) {
    return;
  }
  const previousWindowSpaces = cloneWindowSpaces(
    getProjectWindowSpaces(useProjectState.getState().projectConfig),
  );
  dispatchOptimisticProjectStateUpdate({
    projectConfigId,
    apply,
    rollback: (state) => {
      state.projectConfig.windowSpaces =
        cloneWindowSpaces(previousWindowSpaces);
    },
    send: (frontendOpId) =>
      send({
        frontendOpId,
        projectConfigId,
      }),
  });
}

export function applyWindowSpaceSortOrder(
  state: ZustandProjectState,
  orderedWindowSpaceIds: Array<string>,
): void {
  const windowSpaces = state.projectConfig.windowSpaces;
  if (orderedWindowSpaceIds.length !== Object.keys(windowSpaces).length) {
    throw new Error(
      "orderedWindowSpaceIds must include every window space exactly once.",
    );
  }

  const seen = new Set<string>();
  for (const windowSpaceId of orderedWindowSpaceIds) {
    if (!(windowSpaceId in windowSpaces)) {
      throw new Error(`Window space ${windowSpaceId} not found.`);
    }
    if (seen.has(windowSpaceId)) {
      throw new Error("orderedWindowSpaceIds contains duplicates.");
    }
    seen.add(windowSpaceId);
  }

  orderedWindowSpaceIds.forEach((windowSpaceId, index) => {
    const windowSpace = windowSpaces[windowSpaceId];
    if (!windowSpace) {
      throw new Error(`Window space ${windowSpaceId} not found.`);
    }
    windowSpace.sortIndex = index;
  });
}

function compactWindowSpaceSortIndices(
  windowSpaces: Record<string, WindowSpaceConfig>,
): void {
  const sortedWindowSpaces = sortWindowSpaces(Object.values(windowSpaces));
  for (let index = 0; index < sortedWindowSpaces.length; index += 1) {
    const sortedWindowSpace = sortedWindowSpaces[index];
    if (!sortedWindowSpace) {
      continue;
    }
    sortedWindowSpace.sortIndex = index;
  }
}

export function persistWindowSpaceSortOrder(
  projectConfigId: string,
  orderedWindowSpaceIds: Array<string>,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      applyWindowSpaceSortOrder(state, orderedWindowSpaceIds);
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_set_window_space_sort_order({
        projectConfigId: nextProjectConfigId,
        orderedWindowSpaceIds,
        frontendOpId,
      }),
  });
}

export function setWindowSpaceName(
  projectConfigId: string,
  windowSpaceId: string,
  name: string,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      const windowSpaces = getProjectWindowSpaces(state.projectConfig);
      if (!(windowSpaceId in windowSpaces)) {
        throw new Error(`Window space ${windowSpaceId} not found`);
      }
      windowSpaces[windowSpaceId].name = name;
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_set_window_space_name({
        projectConfigId: nextProjectConfigId,
        windowSpaceId,
        name,
        frontendOpId,
      }),
  });
}

export function deleteWindowSpace(
  projectConfigId: string,
  windowSpaceId: string,
): void {
  dispatchOptimisticWindowSpaceMutation({
    apply: (state) => {
      const windowSpaces = getProjectWindowSpaces(state.projectConfig);
      if (!(windowSpaceId in windowSpaces)) {
        throw new Error(`Window space ${windowSpaceId} not found`);
      }
      delete windowSpaces[windowSpaceId];
      compactWindowSpaceSortIndices(windowSpaces);
    },
    projectConfigId,
    send: ({ frontendOpId, projectConfigId: nextProjectConfigId }) =>
      route_delete_window_space({
        projectConfigId: nextProjectConfigId,
        windowSpaceId,
        frontendOpId,
      }),
  });
}
