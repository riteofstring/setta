export const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
export const FRONTEND_ORIGIN = new URL(BASE_URL).origin;
export const FRONTEND_REFERER = `${FRONTEND_ORIGIN}/`;
export const BACKEND_HELPER_REQUEST_HEADERS = {
  Origin: FRONTEND_ORIGIN,
  Referer: FRONTEND_REFERER,
};

export type CreateSectionResponse = {
  sectionId?: string;
};

export type EngineConfigSummary = {
  id: string;
  engineType?: string;
  settaLlmConfigId?: string | null;
};

export type LLMConfigEntry = {
  model: string;
  provider?: string | null;
  api_key_env?: string | null;
  base_url?: string | null;
  other_params?: Record<string, unknown> | null;
  mcpServerIds?: string[] | null;
  temporary?: boolean;
};

export type LLMConfigPayload = {
  configs: Record<string, LLMConfigEntry>;
  mcpServers: Record<string, unknown>;
  defaultMcpServerIds?: string[];
  default_config_id?: string | null;
  codexMcpImportedAt?: string | null;
};

export type ManagedAPIKeysSnapshot = {
  apiKeys: Record<string, string>;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

export type ManagedChatProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

export type ManagedChatProviderServer = {
  origin: string;
  requests: ManagedChatProviderRequest[];
  close: () => Promise<void>;
};

export const MANAGED_CHAT_PROVIDER_RESPONSE_DELAY_MS = 3000;

export type DeterministicManagedChatEngine = {
  engineConfigId: string;
  providerServer: ManagedChatProviderServer;
  cleanup: () => Promise<void>;
};

export type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      stateMachineEdges?: Array<{
        id?: string;
        machineGroupId?: string;
        sourceSectionId?: string;
        sourcePortId?: string;
        targetSectionId?: string;
        targetPortId?: string;
        sourceFilter?: {
          type?: string | null;
          signalName?: string | null;
          payloadField?: string | null;
          equals?: string | null;
        } | null;
        sourceActivationCountCondition?: {
          operator?: string | null;
          value?: number | null;
        } | null;
        targetAction?: {
          type?: string | null;
          promptTemplateId?: string | null;
          promptSectionId?: string | null;
          inlinePrompt?: string | null;
          promptInputs?: Record<string, string> | null;
          threadStrategy?: string | null;
        } | null;
        style?: Record<string, string | number> | null;
        hidden?: boolean;
        zIndex?: number;
        selected?: boolean;
      }>;
      sectionVariantMap?: Record<string, string>;
    };
    sections?: Record<
      string,
      {
        sharedModifier?: {
          machineGroupId?: string;
          label?: string;
          maxIterations?: number | null;
          engineConfigId?: string | null;
        };
      }
    >;
    sectionVariants?: Record<
      string,
      {
        impl?: string;
        modifier?: {
          machineGroupId?: string;
          label?: string;
          maxIterations?: number | null;
          engineConfigId?: string | null;
        };
      }
    >;
    sectionImpls?: Record<
      string,
      {
        type?: string;
        machineGroupId?: string;
        label?: string;
        maxIterations?: number | null;
        engineConfigId?: string | null;
      }
    >;
  };
};

export type WorkflowRunRecord = {
  id?: string;
  status?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  outputs?: Record<string, unknown> | null;
  inputs?: {
    runType?: string;
    projectConfigId?: string;
    machineGroupId?: string;
  } | null;
  events?: Array<{
    type?: string;
    timestamp?: string | null;
    payload?: Record<string, unknown>;
  }>;
  [key: string]: unknown;
};
