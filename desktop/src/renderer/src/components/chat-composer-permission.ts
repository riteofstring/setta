import type {
  ChatCommandExecuteResult,
  ChatPermissionPreset,
  ChatPermissionPresetID,
  Conversation,
} from "@generated/backend";
import { useEffect, useRef, useState, type MutableRefObject } from "react";

import type { ComposerPermissionActions } from "./chat-composer-contract";

interface UseComposerPermissionPickerOptions {
  clearModelPicker: () => void;
  disabled: boolean;
  focusComposer: () => void;
  permissionActions?: ComposerPermissionActions;
  running: boolean;
  selectedConversation: Conversation | null;
  setDraft: (draft: string) => void;
  submittingRef: MutableRefObject<boolean>;
}

interface ScopedPermissionPicker {
  conversationId: string;
  result: ChatCommandExecuteResult;
}

interface ScopedPermissionConfirmation {
  conversationId: string;
  preset: ChatPermissionPreset;
}

export function useComposerPermissionPicker({
  clearModelPicker,
  disabled,
  focusComposer,
  permissionActions,
  running,
  selectedConversation,
  setDraft,
  submittingRef,
}: UseComposerPermissionPickerOptions) {
  const [permissionPickerState, setPermissionPickerState] = useState<ScopedPermissionPicker | null>(
    null,
  );
  const [permissionConfirmationState, setPermissionConfirmationState] =
    useState<ScopedPermissionConfirmation | null>(null);
  const selectedConversationId = selectedPermissionConversationId(selectedConversation);
  const selectedConversationIdRef = useRef(selectedConversationId);
  selectedConversationIdRef.current = selectedConversationId;
  const permissionPicker = permissionPickerResult(permissionPickerState);
  const permissionConfirmation = permissionConfirmationPreset(permissionConfirmationState);
  const permissionPickerDisabled = composerPermissionPickerDisabled({
    disabled,
    permissionActions,
    running,
    selectedConversation,
  });
  const permissionPickerOpen = composerPermissionPickerOpen(permissionPicker);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
    setPermissionPickerState((current) =>
      permissionScopeActive(current?.conversationId ?? "", selectedConversationId) ? current : null,
    );
    setPermissionConfirmationState((current) =>
      permissionScopeActive(current?.conversationId ?? "", selectedConversationId) ? current : null,
    );
  }, [selectedConversationId]);

  useEffect(() => {
    if (!permissionPickerOpen && permissionConfirmation === null) {
      return;
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (permissionConfirmation !== null) {
        cancelPermissionConfirmation();
        return;
      }
      dismissPermissionPicker();
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [permissionConfirmation, permissionPickerOpen]);

  function clearPermissionState() {
    setPermissionPickerState(null);
    setPermissionConfirmationState(null);
  }

  function clearPermissionPicker() {
    setPermissionPickerState(null);
  }

  function dismissPermissionPicker() {
    clearPermissionPicker();
    focusComposer();
  }

  function cancelPermissionConfirmation() {
    setPermissionConfirmationState(null);
    focusComposer();
  }

  async function openPermissionPicker() {
    const conversationId = selectedConversationIdRef.current;
    if (permissionPickerDisabled || submittingRef.current || conversationId === "") {
      return;
    }
    submittingRef.current = true;
    try {
      if (permissionActions === undefined) {
        return;
      }
      const result = await permissionActions.openCodexPermissionPicker();
      if (!permissionScopeActive(conversationId, selectedConversationIdRef.current)) {
        return;
      }
      if (result.result.action === "permission_picker") {
        clearModelPicker();
        setPermissionPickerState({ conversationId, result });
        setDraft("");
      }
    } finally {
      submittingRef.current = false;
    }
  }

  async function executePermissionSelection(presetId: ChatPermissionPresetID) {
    if (permissionPickerDisabled || submittingRef.current) {
      return;
    }
    const pickerState = permissionPickerState;
    if (pickerState === null) {
      return;
    }
    if (!permissionScopeActive(pickerState.conversationId, selectedConversationIdRef.current)) {
      clearPermissionPicker();
      return;
    }
    const preset = permissionPresetByID(pickerState.result.result.permissionPresets, presetId);
    if (preset === null || preset.disabled) {
      return;
    }
    if (preset.danger?.requiresConfirmation === true) {
      clearPermissionPicker();
      setPermissionConfirmationState({ conversationId: pickerState.conversationId, preset });
      return;
    }
    await submitPermissionSelection(pickerState.conversationId, preset.id, false);
  }

  async function confirmPermissionSelection() {
    const confirmationState = permissionConfirmationState;
    if (confirmationState === null || submittingRef.current) {
      return;
    }
    await submitPermissionSelection(
      confirmationState.conversationId,
      confirmationState.preset.id,
      true,
    );
    setPermissionConfirmationState(null);
  }

  async function submitPermissionSelection(
    conversationId: string,
    presetId: ChatPermissionPresetID,
    confirmed: boolean,
  ) {
    if (!permissionScopeActive(conversationId, selectedConversationIdRef.current)) {
      clearPermissionPicker();
      setPermissionConfirmationState(null);
      return;
    }
    submittingRef.current = true;
    try {
      if (permissionActions === undefined) {
        return;
      }
      await permissionActions.setCodexPermissionPreset(presetId, confirmed);
      setDraft("");
      clearPermissionPicker();
    } finally {
      submittingRef.current = false;
    }
  }

  return {
    cancelPermissionConfirmation,
    clearPermissionState,
    clearPermissionPicker,
    confirmPermissionSelection,
    dismissPermissionPicker,
    executePermissionSelection,
    openPermissionPicker,
    permissionConfirmation,
    permissionPicker,
    permissionPickerDisabled,
    permissionPickerOpen,
  };
}

function permissionPresetByID(presets: ChatPermissionPreset[], presetId: ChatPermissionPresetID) {
  return presets.find((candidate) => candidate.id === presetId) ?? null;
}

function selectedPermissionConversationId(selectedConversation: Conversation | null) {
  return selectedConversation?.id ?? "";
}

function permissionPickerResult(state: ScopedPermissionPicker | null) {
  return state?.result ?? null;
}

function permissionConfirmationPreset(state: ScopedPermissionConfirmation | null) {
  return state?.preset ?? null;
}

function composerPermissionPickerDisabled({
  disabled,
  permissionActions,
  running,
  selectedConversation,
}: {
  disabled: boolean;
  permissionActions?: ComposerPermissionActions;
  running: boolean;
  selectedConversation: Conversation | null;
}) {
  return permissionActions === undefined || selectedConversation === null || disabled || running;
}

function composerPermissionPickerOpen(permissionPicker: ChatCommandExecuteResult | null) {
  return permissionPicker?.result.action === "permission_picker";
}

export function permissionScopeActive(
  scopedConversationId: string,
  selectedConversationId: string,
) {
  return scopedConversationId !== "" && scopedConversationId === selectedConversationId;
}
