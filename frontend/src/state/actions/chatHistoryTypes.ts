import type { AgentRun } from "utils/generatedTypes";

export type ChatTitleSource = "llm" | "deterministic" | "reused" | "external";
export type ChatRunType = "llm_chat" | "external_agent" | "scriptable_chat";

export type ChatHistoryCompatibility = {
  runType: ChatRunType;
  engineConfigId: string | null;
};

export type ChatRunProvenance = {
  runType: ChatRunType;
  engineConfigId: string | null;
};

export type ScopedChatProvenanceLookupResult =
  | {
      status: "ready";
      provenance: ChatRunProvenance;
    }
  | {
      status: "missing";
    }
  | {
      status: "ambiguous";
    };

export type ChatHistoryEntry = {
  chatId: string;
  label: string;
  nameSource: ChatTitleSource | null;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
  runType: ChatRunType | null;
  engineConfigId: string | null;
};

export type ChatRunSummary = {
  latestRun: AgentRun;
  lastUpdatedMs: number;
  waitingForResponse: boolean;
};

export type BuildChatHistoryEntriesOptions = {
  sectionId?: string | null;
  unscopedOnly?: boolean;
  compatibility?: ChatHistoryCompatibility | null;
  projectConfigId?: string | null;
};
