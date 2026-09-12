import { createContext, useContext } from "react";
import type { WorkspaceSectionData } from "@setta/workspace";

import type {
  ContentReference,
  Project,
  RuntimeCancelRequest,
  RuntimeEvent,
  RuntimeSourceDocument,
} from "../backend/generatedContract";
import type { RuntimeViewState } from "./runtimeState";

export type RealtimeActions = {
  applyRuntimeSource: (sectionId: string, source: string) => Promise<boolean>;
  cancel: (identity: RuntimeCancelRequest["identity"]) => boolean;
  commitSectionData: (
    sectionId: string,
    data: WorkspaceSectionData,
  ) => Promise<boolean>;
  emit: (
    sectionId: string,
    event: RuntimeEvent["event"],
    payload: RuntimeEvent["payload"],
  ) => boolean;
  initialize: (
    sectionId: string,
    event: "change" | "snapshot",
    createPayload: () =>
      RuntimeEvent["payload"] | Promise<RuntimeEvent["payload"]>,
  ) => Promise<boolean>;
  reload: () => Promise<boolean>;
  reportError: (message: string) => void;
  uploadContent: (content: Blob) => Promise<ContentReference>;
};

type RuntimeSourceNotice = {
  kind: "error" | "success";
  message: string;
};

export type RuntimeSourceViewState = {
  activationRejected: boolean;
  document: RuntimeSourceDocument | null;
  notice: RuntimeSourceNotice | null;
  status: "unavailable" | "loading" | "ready" | "applying";
};

export const initialRuntimeSourceViewState: RuntimeSourceViewState = {
  activationRejected: false,
  document: null,
  notice: null,
  status: "unavailable",
};

type RealtimeContextValue = {
  actions: RealtimeActions;
  error: string | null;
  project: Project;
  runtime: RuntimeViewState;
  source: RuntimeSourceViewState;
};

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (value === null) {
    throw new Error("Realtime section content requires a runtime provider.");
  }
  return value;
}
