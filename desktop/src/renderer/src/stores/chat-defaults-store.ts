import type {
  ChatCodexDefaultsView,
  ChatCodexPermissionSettings,
  ChatCodexSettings,
  ChatModelOption,
  ChatPermissionPreset,
  ChatPermissionPresetID,
  ReasoningEffort,
} from "@generated/backend";
import { create } from "zustand";

export type ChatDefaultsStoreStatus = "idle" | "loading" | "ready" | "saving" | "error";

interface ChatDefaultsStore {
  draft: ChatCodexSettings | null;
  error: string | null;
  load: () => Promise<void>;
  revertDraft: () => void;
  saveDraft: (options?: ChatDefaultsSaveOptions) => Promise<void>;
  setModel: (model: string) => void;
  setPermissionPreset: (preset: ChatPermissionPresetID) => void;
  setReasoningEffort: (effort: ReasoningEffort | null) => void;
  status: ChatDefaultsStoreStatus;
  view: ChatCodexDefaultsView | null;
}

interface ChatDefaultsSaveOptions {
  confirmed?: boolean;
}

export const useChatDefaultsStore = create<ChatDefaultsStore>((set, get) => ({
  draft: null,
  error: null,
  load: async () => {
    const { status, view } = get();
    if (view || status === "loading" || status === "saving") {
      return;
    }
    set({ error: null, status: "loading" });
    try {
      const next = await window.setta.chat.readCodexDefaults();
      set({
        draft: cloneChatCodexSettings(next.settings),
        error: null,
        status: "ready",
        view: next,
      });
    } catch (error) {
      set({ error: errorText(error), status: "error" });
    }
  },
  revertDraft: () => {
    const view = get().view;
    if (!view) {
      return;
    }
    set({ draft: cloneChatCodexSettings(view.settings), error: null, status: "ready" });
  },
  saveDraft: async (options = {}) => {
    const draft = get().draft;
    if (!draft) {
      return;
    }
    set({ error: null, status: "saving" });
    try {
      const next = await window.setta.chat.updateCodexDefaults({
        confirmed: options.confirmed ?? false,
        settings: draft,
      });
      set({
        draft: cloneChatCodexSettings(next.settings),
        error: null,
        status: "ready",
        view: next,
      });
    } catch (error) {
      set({ error: errorText(error), status: "error" });
    }
  },
  setModel: (model) => {
    const { draft, view } = get();
    if (!draft) {
      return;
    }
    const nextModel = model.trim();
    set({
      draft: {
        ...draft,
        model: nextModel,
        reasoningEffort: supportedReasoningEffort(
          view?.models ?? [],
          nextModel,
          draft.reasoningEffort,
        )
          ? draft.reasoningEffort
          : null,
      },
      error: null,
    });
  },
  setPermissionPreset: (preset) => {
    const { draft, view } = get();
    if (!draft || !view) {
      return;
    }
    const permission = permissionSettingsForPreset(view, preset);
    if (!permission) {
      set({ error: `Unsupported permission preset: ${preset}` });
      return;
    }
    set({ draft: { ...draft, permission }, error: null });
  },
  setReasoningEffort: (effort) => {
    const draft = get().draft;
    if (!draft) {
      return;
    }
    set({ draft: { ...draft, reasoningEffort: effort }, error: null });
  },
  status: "idle",
  view: null,
}));

export function chatCodexSettingsEqual(
  left: ChatCodexSettings | null,
  right: ChatCodexSettings | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.model === right.model &&
    left.reasoningEffort === right.reasoningEffort &&
    permissionSettingsEqual(left.permission, right.permission)
  );
}

function permissionSettingsEqual(
  left: ChatCodexPermissionSettings | null,
  right: ChatCodexPermissionSettings | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.approvalPolicy === right.approvalPolicy &&
    left.permissions === right.permissions &&
    left.preset === right.preset
  );
}

function supportedReasoningEffort(
  models: ChatModelOption[],
  model: string,
  effort: ReasoningEffort | null,
) {
  if (!model || !effort) {
    return false;
  }
  return models
    .find((option) => option.model === model)
    ?.supportedReasoningEfforts.some((option) => option.effort === effort);
}

function permissionSettingsForPreset(
  view: ChatCodexDefaultsView,
  preset: ChatPermissionPresetID,
): ChatCodexPermissionSettings | null {
  const option = view.permissionPresets.find((candidate) => candidate.id === preset);
  if (!option) {
    return null;
  }
  return chatCodexPermissionSettingsFromPreset(option);
}

export function chatCodexPermissionSettingsFromPreset(
  option: ChatPermissionPreset,
): ChatCodexPermissionSettings {
  return {
    approvalPolicy: option.approvalPolicy,
    permissions: option.activePermissionProfileId,
    preset: option.id,
  };
}

function cloneChatCodexSettings(settings: ChatCodexSettings): ChatCodexSettings {
  return {
    model: settings.model,
    permission: settings.permission ? { ...settings.permission } : null,
    reasoningEffort: settings.reasoningEffort,
  };
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
