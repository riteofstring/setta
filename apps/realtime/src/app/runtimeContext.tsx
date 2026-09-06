import { createContext, useContext } from "react";
import type { WorkspaceSectionData } from "@setta/workspace";

import type {
  ContentReference,
  Project,
  RuntimeCancelRequest,
  RuntimeEvent,
} from "../backend/generatedContract";
import type { RuntimeViewState } from "./runtimeState";

export type RealtimeActions = {
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
  reload: () => Promise<boolean>;
  reportError: (message: string) => void;
  uploadContent: (content: Blob) => Promise<ContentReference>;
};

type RealtimeContextValue = {
  actions: RealtimeActions;
  error: string | null;
  project: Project;
  runtime: RuntimeViewState;
};

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (value === null) {
    throw new Error("Realtime section content requires a runtime provider.");
  }
  return value;
}
