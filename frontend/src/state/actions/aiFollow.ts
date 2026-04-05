import { type AgenticScopeViolationEdge, useAIFollow } from "state/definitions";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import { route_get_ai_follow_snapshot } from "utils/generatedEndpoints";
import {
  AIFollowToolArgumentsUpdateContent,
  AIFollowToolResultUpdateContent,
} from "utils/generatedTypes";

const TOOL_RESULT_HIGHLIGHT_TIMEOUT_MS = 2000;
const toolResultTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
export const SCOPE_VIOLATION_TIMEOUT_MS = 5000;
const scopeViolationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

type AIFollowIdsByProjectConfig = Record<
  string,
  Record<string, Record<string, Array<string>>>
>;
export type AIFollowIdsByType = Record<string, Array<string>>;

function cloneIdsByType(
  idsByType: AIFollowIdsByType | null | undefined,
): AIFollowIdsByType | null {
  if (!idsByType) {
    return null;
  }
  const entries = Object.entries(idsByType);
  if (entries.length === 0) {
    return {};
  }
  return Object.fromEntries(
    entries.map(([idType, ids]) => [idType, [...ids]]),
  ) as AIFollowIdsByType;
}

type AIFollowSnapshotRouteResponse = ResponseDataAndStatus<
  Array<AIFollowToolArgumentsUpdateContent>
>;

function buildTimeoutKey(
  projectConfigId: string,
  chatId: string,
  idType: string,
  id: string,
): string {
  return `${projectConfigId}:${chatId}:${idType}:${id}`;
}

function buildScopeViolationKey(
  projectConfigId: string,
  edge: AgenticScopeViolationEdge,
): string {
  if (edge.kind === "chat_chat") {
    const source = edge.sourceSectionId;
    const target = edge.targetSectionId;
    const [a, b] = source < target ? [source, target] : [target, source];
    return `${projectConfigId}:${edge.kind}:${a}:${b}`;
  }
  return `${projectConfigId}:${edge.kind}:${edge.sourceSectionId}:${edge.targetSectionId}`;
}

function deleteChatEntry(
  idsByProjectConfigId: AIFollowIdsByProjectConfig,
  projectConfigId: string,
  chatId: string,
): void {
  const projectEntries = idsByProjectConfigId[projectConfigId];
  if (!projectEntries) {
    return;
  }
  delete projectEntries[chatId];
  if (Object.keys(projectEntries).length === 0) {
    delete idsByProjectConfigId[projectConfigId];
  }
}

function deleteIdEntry(
  idsByProjectConfigId: AIFollowIdsByProjectConfig,
  projectConfigId: string,
  chatId: string,
  idType: string,
  id: string,
): void {
  const projectEntries = idsByProjectConfigId[projectConfigId];
  if (!projectEntries) {
    return;
  }
  const chatEntries = projectEntries[chatId];
  if (!chatEntries) {
    return;
  }
  const storedIds = chatEntries[idType];
  if (!storedIds) {
    return;
  }
  const nextIds = storedIds.filter((entry) => entry !== id);
  if (nextIds.length > 0) {
    chatEntries[idType] = nextIds;
    return;
  }
  delete chatEntries[idType];
  if (Object.keys(chatEntries).length === 0) {
    deleteChatEntry(idsByProjectConfigId, projectConfigId, chatId);
  }
}

function deleteScopeViolationEdge(
  edgesByProjectConfigId: Record<string, Array<AgenticScopeViolationEdge>>,
  projectConfigId: string,
  edgeKey: string,
): void {
  const existing = edgesByProjectConfigId[projectConfigId];
  if (!existing) {
    return;
  }
  const filtered = existing.filter(
    (entry) => buildScopeViolationKey(projectConfigId, entry) !== edgeKey,
  );
  if (filtered.length > 0) {
    edgesByProjectConfigId[projectConfigId] = filtered;
    return;
  }
  delete edgesByProjectConfigId[projectConfigId];
}

export function receiveAIFollowToolArgumentsUpdate(
  payload: AIFollowToolArgumentsUpdateContent,
): void {
  const { projectConfigId, chatId, idsByType } = payload;
  useAIFollow.setState((state) => {
    if (Object.keys(idsByType).length === 0) {
      deleteChatEntry(
        state.toolArgumentsIdsByProjectConfigId,
        projectConfigId,
        chatId,
      );
      return;
    }
    const projectEntries =
      state.toolArgumentsIdsByProjectConfigId[projectConfigId] ??
      (state.toolArgumentsIdsByProjectConfigId[projectConfigId] = {});
    projectEntries[chatId] = idsByType;
  });
}

export function getAIFollowToolArgumentsSnapshot(
  projectConfigId: string,
  chatId: string,
): AIFollowIdsByType | null {
  return cloneIdsByType(
    useAIFollow.getState().toolArgumentsIdsByProjectConfigId[projectConfigId]?.[
      chatId
    ] ?? null,
  );
}

export function clearAIFollowToolArgumentsForChat(
  projectConfigId: string,
  chatId: string,
): void {
  useAIFollow.setState((state) => {
    deleteChatEntry(
      state.toolArgumentsIdsByProjectConfigId,
      projectConfigId,
      chatId,
    );
  });
}

export function restoreAIFollowToolArgumentsSnapshot({
  projectConfigId,
  chatId,
  idsByType,
}: {
  projectConfigId: string;
  chatId: string;
  idsByType: AIFollowIdsByType | null;
}): void {
  const nextIdsByType = cloneIdsByType(idsByType);
  useAIFollow.setState((state) => {
    if (nextIdsByType === null) {
      deleteChatEntry(
        state.toolArgumentsIdsByProjectConfigId,
        projectConfigId,
        chatId,
      );
      return;
    }
    const projectEntries =
      state.toolArgumentsIdsByProjectConfigId[projectConfigId] ??
      (state.toolArgumentsIdsByProjectConfigId[projectConfigId] = {});
    projectEntries[chatId] = nextIdsByType;
  });
}

export function receiveAIFollowToolResultUpdate(
  payload: AIFollowToolResultUpdateContent,
): void {
  const { projectConfigId, chatId, idsByType } = payload;
  useAIFollow.setState((state) => {
    const projectEntries =
      state.toolResultIdsByProjectConfigId[projectConfigId] ??
      (state.toolResultIdsByProjectConfigId[projectConfigId] = {});
    const chatEntries = projectEntries[chatId] ?? (projectEntries[chatId] = {});
    for (const [idType, ids] of Object.entries(idsByType)) {
      if (!chatEntries[idType]) {
        chatEntries[idType] = [];
      }
      const storedIds = chatEntries[idType];
      for (const id of ids) {
        if (!storedIds.includes(id)) {
          storedIds.push(id);
        }
      }
    }
  });

  for (const [idType, ids] of Object.entries(idsByType)) {
    for (const id of ids) {
      const key = buildTimeoutKey(projectConfigId, chatId, idType, id);
      const existingTimeout = toolResultTimeouts.get(key);
      if (existingTimeout !== undefined) {
        globalThis.clearTimeout(existingTimeout);
      }

      const timeoutId = globalThis.setTimeout(() => {
        useAIFollow.setState((state) => {
          deleteIdEntry(
            state.toolResultIdsByProjectConfigId,
            projectConfigId,
            chatId,
            idType,
            id,
          );
        });
        toolResultTimeouts.delete(key);
      }, TOOL_RESULT_HIGHLIGHT_TIMEOUT_MS);
      toolResultTimeouts.set(key, timeoutId);
    }
  }
}

export function receiveAgenticScopeViolationEdges({
  projectConfigId,
  edges,
}: {
  projectConfigId: string;
  edges: Array<AgenticScopeViolationEdge>;
}): void {
  if (edges.length === 0) {
    return;
  }
  useAIFollow.setState((state) => {
    const projectEdges =
      state.scopeViolationEdgesByProjectConfigId[projectConfigId] ??
      (state.scopeViolationEdgesByProjectConfigId[projectConfigId] = []);
    const existingKeys = new Set(
      projectEdges.map((entry) =>
        buildScopeViolationKey(projectConfigId, entry),
      ),
    );
    for (const edge of edges) {
      const edgeKey = buildScopeViolationKey(projectConfigId, edge);
      if (existingKeys.has(edgeKey)) {
        continue;
      }
      existingKeys.add(edgeKey);
      projectEdges.push(edge);
    }
  });

  for (const edge of edges) {
    const key = buildScopeViolationKey(projectConfigId, edge);
    const existingTimeout = scopeViolationTimeouts.get(key);
    if (existingTimeout !== undefined) {
      globalThis.clearTimeout(existingTimeout);
    }
    const timeoutId = globalThis.setTimeout(() => {
      useAIFollow.setState((state) => {
        deleteScopeViolationEdge(
          state.scopeViolationEdgesByProjectConfigId,
          projectConfigId,
          key,
        );
      });
      scopeViolationTimeouts.delete(key);
    }, SCOPE_VIOLATION_TIMEOUT_MS);
    scopeViolationTimeouts.set(key, timeoutId);
  }
}

export async function requestAIFollowSnapshot(
  projectConfigId: string,
): Promise<void> {
  const res: AIFollowSnapshotRouteResponse = await route_get_ai_follow_snapshot(
    { projectConfigId },
  );
  if (!res200(res)) {
    return;
  }
  const snapshot: AIFollowToolArgumentsUpdateContent[] = res.data;
  if (snapshot.length === 0) {
    return;
  }
  for (const entry of snapshot) {
    receiveAIFollowToolArgumentsUpdate(entry);
  }
}
