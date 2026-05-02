import {
  callOpenAPI,
  getErrorDetail,
  res200,
} from "@setta/app-subsystem-frontend-sdk";
import { getMcpServerRuntimeStatus } from "openapi/http";
import { useEffect, useState } from "react";
import { postChromeReproEvent } from "state/actions/chromeRepro";
import {
  toRuntimeStatusByServerId,
  type McpRuntimeServerStatus,
} from "../projectChatSkillsMcpViewerUtils";
import { resolveMcpRuntimeStatusErrorMessage } from "./skillState";

type RuntimeServerEntry = {
  serverId: string;
  transport: string;
  endpoint: string;
};

type UseProjectChatMcpRuntimeStatusArgs = {
  allLLMConfigsInitialLoadComplete: boolean;
  chatId: string | null | undefined;
  engineConfigId: string | null;
  mcpServers: unknown;
  projectConfigId: string;
  showMcpSection: boolean;
};

export function useProjectChatMcpRuntimeStatus({
  allLLMConfigsInitialLoadComplete,
  chatId,
  engineConfigId,
  mcpServers,
  projectConfigId,
  showMcpSection,
}: UseProjectChatMcpRuntimeStatusArgs) {
  const [mcpConfigPath, setMcpConfigPath] = useState<string | null>(null);
  const [settaFilesLocation, setSettaFilesLocation] = useState<string | null>(
    null,
  );
  const [mcpRuntimeStatusLoading, setMcpRuntimeStatusLoading] = useState(true);
  const [mcpRuntimeStatusError, setMcpRuntimeStatusError] = useState<
    string | null
  >(null);
  const [mcpRuntimeStatusByServerId, setMcpRuntimeStatusByServerId] =
    useState<Record<string, McpRuntimeServerStatus> | null>(null);
  const [runtimeServers, setRuntimeServers] = useState<RuntimeServerEntry[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const runtimeStatusChatId = chatId ?? null;
    const runtimeStatusEngineConfigId = engineConfigId ?? null;
    async function loadMcpRuntimeStatus() {
      if (!showMcpSection || !allLLMConfigsInitialLoadComplete) {
        return;
      }
      setMcpRuntimeStatusLoading(true);
      setMcpRuntimeStatusError(null);
      const res = await callOpenAPI(
        getMcpServerRuntimeStatus({
          body: {
            chatId: runtimeStatusChatId,
            engineConfigId: runtimeStatusEngineConfigId,
          },
        } as Parameters<typeof getMcpServerRuntimeStatus>[0]),
      );
      if (cancelled) {
        return;
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        const errorMessage = resolveMcpRuntimeStatusErrorMessage(detail);
        postChromeReproEvent("mcp-runtime-status", {
          projectConfigId,
          chatId: runtimeStatusChatId,
          engineConfigId: runtimeStatusEngineConfigId,
          error: errorMessage,
        });
        setMcpRuntimeStatusError(errorMessage);
        setMcpRuntimeStatusByServerId(null);
        setRuntimeServers([]);
        setMcpConfigPath(null);
        setSettaFilesLocation(null);
        setMcpRuntimeStatusLoading(false);
        return;
      }
      const resolvedStatuses = res.data.resolvedServers;
      const runtimeStatusesByServerId =
        toRuntimeStatusByServerId(resolvedStatuses);
      postChromeReproEvent("mcp-runtime-status", {
        projectConfigId,
        chatId: runtimeStatusChatId,
        engineConfigId: runtimeStatusEngineConfigId,
        response: res.data,
        derivedRuntimeStatusByServerId: runtimeStatusesByServerId,
      });
      setMcpRuntimeStatusByServerId(runtimeStatusesByServerId);
      setRuntimeServers(
        resolvedStatuses.map((status) => ({
          serverId: status.serverId,
          transport: status.transport,
          endpoint: status.endpoint,
        })),
      );
      setMcpConfigPath(res.data.llmConfigPath);
      setSettaFilesLocation(res.data.activeSettaFilesLocation);
      setMcpRuntimeStatusLoading(false);
    }
    void loadMcpRuntimeStatus();
    return () => {
      cancelled = true;
    };
  }, [
    allLLMConfigsInitialLoadComplete,
    chatId,
    engineConfigId,
    mcpServers,
    projectConfigId,
    showMcpSection,
  ]);

  return {
    mcpConfigPath,
    mcpRuntimeStatusByServerId,
    mcpRuntimeStatusError,
    mcpRuntimeStatusLoading,
    runtimeServers,
    settaFilesLocation,
  };
}
