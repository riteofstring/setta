import type {
  ChatCommandExecuteResult,
  ChatPermissionPreset,
  ChatPermissionPresetID,
} from "@generated/backend";
import { useEffect, useRef, useState, type MutableRefObject } from "react";

import type { ComposerPermissionActions } from "./chat-composer-contract";

interface UseComposerPermissionPickerOptions {
  clearModelPicker: () => void;
  disabled: boolean;
  focusComposer: () => void;
  permissionActions?: ComposerPermissionActions;
  running: boolean;
  sessionId: string;
  setDraft: (draft: string) => void;
  submittingRef: MutableRefObject<boolean>;
}

interface ScopedPermissionPicker {
  result: ChatCommandExecuteResult;
  sessionId: string;
}

interface ScopedPermissionConfirmation {
  preset: ChatPermissionPreset;
  sessionId: string;
}

export function useComposerPermissionPicker({
  clearModelPicker,
  disabled,
  focusComposer,
  permissionActions,
  running,
  sessionId,
  setDraft,
  submittingRef,
}: UseComposerPermissionPickerOptions) {
  const [permissionPickerState, setPermissionPickerState] = useState<ScopedPermissionPicker | null>(
    null,
  );
  const [permissionConfirmationState, setPermissionConfirmationState] =
    useState<ScopedPermissionConfirmation | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const permissionPicker = permissionPickerResult(permissionPickerState);
  const permissionConfirmation = permissionConfirmationPreset(permissionConfirmationState);
  const permissionPickerDisabled = composerPermissionPickerDisabled({
    disabled,
    permissionActions,
    running,
    sessionId,
  });
  const permissionPickerOpen = composerPermissionPickerOpen(permissionPicker);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    setPermissionPickerState((current) =>
      permissionScopeActive(current?.sessionId ?? "", sessionId) ? current : null,
    );
    setPermissionConfirmationState((current) =>
      permissionScopeActive(current?.sessionId ?? "", sessionId) ? current : null,
    );
  }, [sessionId]);

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
    const currentSessionId = sessionIdRef.current;
    if (permissionPickerDisabled || submittingRef.current || currentSessionId === "") {
      return;
    }
    submittingRef.current = true;
    try {
      if (permissionActions === undefined) {
        return;
      }
      const result = await permissionActions.openCodexPermissionPicker();
      if (!permissionScopeActive(currentSessionId, sessionIdRef.current)) {
        return;
      }
      if (result.result.action === "permission_picker") {
        clearModelPicker();
        setPermissionPickerState({ result, sessionId: currentSessionId });
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
    if (!permissionScopeActive(pickerState.sessionId, sessionIdRef.current)) {
      clearPermissionPicker();
      return;
    }
    const preset = permissionPresetByID(pickerState.result.result.permissionPresets, presetId);
    if (preset === null || preset.disabled) {
      return;
    }
    if (preset.danger?.requiresConfirmation === true) {
      clearPermissionPicker();
      setPermissionConfirmationState({ preset, sessionId: pickerState.sessionId });
      return;
    }
    await submitPermissionSelection(pickerState.sessionId, preset.id, false);
  }

  async function confirmPermissionSelection() {
    const confirmationState = permissionConfirmationState;
    if (confirmationState === null || submittingRef.current) {
      return;
    }
    await submitPermissionSelection(confirmationState.sessionId, confirmationState.preset.id, true);
    setPermissionConfirmationState(null);
  }

  async function submitPermissionSelection(
    scopedSessionId: string,
    presetId: ChatPermissionPresetID,
    confirmed: boolean,
  ) {
    if (!permissionScopeActive(scopedSessionId, sessionIdRef.current)) {
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
  sessionId,
}: {
  disabled: boolean;
  permissionActions?: ComposerPermissionActions;
  running: boolean;
  sessionId: string;
}) {
  return permissionActions === undefined || sessionId === "" || disabled || running;
}

function composerPermissionPickerOpen(permissionPicker: ChatCommandExecuteResult | null) {
  return permissionPicker?.result.action === "permission_picker";
}

export function permissionScopeActive(scopedSessionId: string, currentSessionId: string) {
  return scopedSessionId !== "" && scopedSessionId === currentSessionId;
}
