import type {
  ChatCommandDescriptor,
  ChatCommandExecuteResult,
  ChatImageInput,
  ChatInput,
  ImageAttachment,
  ChatModelOption,
  ChatReasoningEffortOption,
} from "@generated/backend";
import type { ChatCommandExecutionOptions } from "@shared/types";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { chatInputFromDraft, chatInputHasContent } from "../lib/chat-input";
import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import { commandDescriptorsNeedLoad, slashCommandExecutionPlan } from "./chat-command-execution";
import {
  commandComposerState,
  commandListErrorForDraft,
  commandListPendingForDraft,
  completionForCommandState,
  firstAvailableSuggestionIndex,
  type CommandCompletionEdit,
  type CommandSuggestionRow,
} from "./chat-command-composer-controller";
import { handleComposerKeyDown } from "./chat-composer-controls";
import {
  createImageAttachmentsFromFiles,
  maxComposerImageAttachments,
} from "./chat-composer-attachments";
import {
  commandPaletteShouldOpen,
  commandPaletteKeyAction,
  composerAcceptsPrompt,
  isSlashDraft,
} from "./chat-composer-helpers";
import {
  activeRunSubmitMode,
  canQueueComposerDraft,
  composerSendDisabled,
} from "./chat-composer-liveness";
import { composerDisabled, isModelPickerOpen } from "./chat-composer-state";
import {
  canSendCurrentComposerDraft,
  canSendImmediateSteeringComposerDraft,
  composerAttachmentFilePreflight,
  composerCommandListContextKey,
  composerDraftSupportsAttachments,
  composerModelPickerDisabled,
  composerSessionId,
  composerSessionSupportsImages,
  composerSlashDraftEnabled,
  composerSubmitActionAvailable,
} from "./chat-composer-derived-state";
import { ComposerFrame, type ReadOnlyComposerSettings } from "./chat-composer-frame";
import { useComposerPromptHistory, type ComposerPromptHistoryDraft } from "./chat-composer-history";
import { useComposerPermissionPicker } from "./chat-composer-permission";
import {
  composerActionPropsEqual,
  composerScalarPropsEqual,
  composerViewModelPropsEqual,
  runPresentationPropsEqual,
} from "./chat-composer-props";
import {
  missingComposerStopAction,
  validateComposerActionContract,
} from "./chat-composer-runtime-contract";
import { composerSessionMaterializedDraft } from "./chat-composer-session";
import type {
  AcceptedComposerSubmission,
  ComposerActions,
  ComposerViewModel,
} from "./chat-composer-contract";

export { modelPickerOptionSelected, reasoningEffortOptionSelected } from "./chat-composer-controls";
export { CommandPalette } from "./chat-command-palette";
export { commandSuggestions } from "./chat-composer-helpers";

const emptyCommandDescriptors: ChatCommandDescriptor[] = [];

interface ComposerProps {
  actions: ComposerActions;
  busy: boolean;
  disabled?: boolean;
  formClassName?: string;
  frameClassName?: string;
  onSendPrompt?: (input: ChatInput) => Promise<void>;
  placeholder?: string;
  readOnlySettings?: ReadOnlyComposerSettings | null;
  running: boolean;
  runPresentation: ActiveRunPresentation;
  viewModel: ComposerViewModel;
}

function ComposerComponent({
  actions,
  busy,
  disabled: disabledOverride,
  formClassName,
  frameClassName,
  onSendPrompt,
  placeholder = "",
  readOnlySettings,
  running,
  runPresentation,
  viewModel,
}: ComposerProps) {
  validateComposerActionContract(actions, runPresentation);
  const [draft, setDraft] = useState("");
  const [commands, setCommands] = useState<ChatCommandDescriptor[]>(emptyCommandDescriptors);
  const [commandListKey, setCommandListKey] = useState("");
  const [commandListRequestKey, setCommandListRequestKey] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [attachmentImageInputsById, setAttachmentImageInputsById] = useState<
    Record<string, ChatImageInput | undefined>
  >({});
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [modelPicker, setModelPicker] = useState<ChatCommandExecuteResult | null>(null);
  const [paletteDismissed, setPaletteDismissed] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const restoreComposerFocusRef = useRef(false);
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const session = viewModel.session;
  const sessionId = composerSessionId(session);
  const selected = session !== null;
  const attachmentContextRef = useRef(sessionId);
  const previousSessionRef = useRef(session);
  const commandActions = actions.commands;
  const attachmentActions = actions.attachments;
  const modelActions = actions.modelSettings;
  const permissionActions = actions.permissionSettings;
  const promptHistoryActions = actions.promptHistory;
  const commandListContextKey = composerCommandListContextKey(commandActions, session);
  const listCommands = commandActions?.listCommands;
  const acceptsPrompt = composerAcceptsPrompt(selected, onSendPrompt !== undefined);
  const disabled = composerDisabled(disabledOverride, acceptsPrompt, busy);
  const hasAttachments = attachments.length > 0;
  const slashDraft = composerSlashDraftEnabled(commandActions, draft, hasAttachments);
  const draftText = draft.trim();
  const commandState = useMemo(() => commandComposerState(draft, commands), [commands, draft]);
  const commandListPending = commandListPendingForDraft({
    commandListContextKey,
    commandListKey,
    commandListRequestKey,
    commandListStatus: viewModel.commandListStatus,
    slashDraft,
  });
  const commandListError = commandListErrorForDraft(
    slashDraft,
    viewModel.commandListStatus,
    viewModel.commandListError,
  );
  const hasPendingSteering = viewModel.pendingSteeringMessageIds.length > 0;
  const modelPickerOpen = isModelPickerOpen(modelPicker);
  const commandPaletteVisible = commandPaletteShouldOpen(
    slashDraft,
    paletteDismissed,
    modelPickerOpen,
  );
  const supportsImages = composerSessionSupportsImages(session);
  const supportsAttachments = composerDraftSupportsAttachments(
    attachmentActions,
    hasAttachments,
    supportsImages,
  );
  const activeSubmitMode = activeRunSubmitMode(running, runPresentation);
  const submitActionAvailable = composerSubmitActionAvailable({
    commandActions,
    mode: activeSubmitMode,
    onSendPrompt,
    sendMessage: actions.sendMessage,
    slashDraft,
    steerMessage: actions.steerMessage,
  });
  const canSend = canSendCurrentComposerDraft({
    attaching,
    disabled: composerSendDisabled(disabled, running, runPresentation),
    draftText,
    hasAttachments,
    submitActionAvailable,
    supportsAttachments,
  });
  const canSendImmediately = canSendImmediateSteeringComposerDraft({
    attaching,
    disabled,
    draftText,
    hasImmediateSteeringContent: hasAttachments,
    hasPendingSteering,
    runPresentation,
    running,
    sendSteeringImmediately: actions.sendSteeringImmediately,
    slashDraft,
    supportsAttachments,
  });
  const modelPickerDisabled = composerModelPickerDisabled(modelActions, session, disabled, running);
  const {
    cancelPermissionConfirmation,
    clearPermissionPicker,
    clearPermissionState,
    confirmPermissionSelection,
    executePermissionSelection,
    openPermissionPicker,
    permissionConfirmation,
    permissionPicker,
    permissionPickerDisabled,
    permissionPickerOpen,
  } = useComposerPermissionPicker({
    clearModelPicker: () => setModelPicker(null),
    disabled,
    focusComposer,
    permissionActions,
    running,
    sessionId,
    submittingRef,
  });
  const promptHistory = useComposerPromptHistory({
    applyDraft: applyPromptHistoryDraft,
    conversationId: sessionId,
    enabled: promptHistoryActions !== undefined,
    listHistory: promptHistoryActions?.listComposerPromptHistory ?? null,
    maxAttachments: maxComposerImageAttachments,
    setDiagnostic: setAttachmentError,
    textareaRef,
  });

  useEffect(() => {
    const previousSession = previousSessionRef.current;
    previousSessionRef.current = session;
    attachmentContextRef.current = sessionId;
    if (!composerSessionMaterializedDraft(previousSession, session)) {
      setAttachments([]);
      setAttachmentImageInputsById({});
      setAttachmentError(null);
      setAttaching(false);
    }
    setModelPicker(null);
    clearPermissionState();
  }, [sessionId]);

  useEffect(() => {
    setSelectedSuggestionIndex((current) => {
      if (commandState.suggestions.length === 0) {
        return 0;
      }
      if (current < commandState.suggestions.length) {
        return current;
      }
      return firstAvailableSuggestionIndex(commandState.suggestions);
    });
  }, [commandState.suggestions]);

  useEffect(() => {
    if (commandListContextKey === "") {
      setCommands(emptyCommandDescriptors);
      setCommandListKey("");
      setCommandListRequestKey("");
      setModelPicker(null);
      clearPermissionPicker();
      return;
    }
    if (!slashDraft) {
      setCommands(emptyCommandDescriptors);
      setCommandListKey("");
      setCommandListRequestKey("");
      return;
    }
    if (
      commandListKey === commandListContextKey ||
      commandListRequestKey === commandListContextKey
    ) {
      return;
    }
    let cancelled = false;
    setCommandListRequestKey(commandListContextKey);
    if (listCommands === undefined) {
      return;
    }
    void listCommands()
      .then((result) => {
        if (!cancelled) {
          setCommands(result?.commands ?? emptyCommandDescriptors);
          setCommandListKey(commandListContextKey);
          setCommandListRequestKey("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCommands(emptyCommandDescriptors);
          setCommandListKey(commandListContextKey);
          setCommandListRequestKey("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [commandListContextKey, commandListKey, listCommands, slashDraft]);

  useEffect(() => {
    if (focusRequest === 0) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    if (!restoreComposerFocusRef.current) {
      return;
    }
    focusComposer();
  }, [viewModel.activeRunId, disabled, running]);

  useEffect(() => {
    if (modelPicker?.result.action !== "model_picker") {
      return;
    }
    textareaRef.current?.focus();

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      dismissModelPicker();
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [modelPicker]);

  async function sendDraft() {
    const submittedDraft = draft;
    const submittedAttachments = attachments;
    const prompt = submittedDraft.trim();
    const input = chatInputFromDraft(prompt, submittedAttachments, attachmentImageInputsById);
    if (!canSubmitDraft(input)) {
      return;
    }
    submittingRef.current = true;
    restoreComposerFocusRef.current = true;
    try {
      focusComposerSoon();
      await submitDraftPrompt(input, submittedDraft, submittedAttachments);
      focusComposerSoon();
    } catch {
      focusComposerSoon();
    } finally {
      submittingRef.current = false;
    }
  }

  function canSubmitDraft(input: ChatInput) {
    return (
      chatInputHasContent(input) &&
      (session !== null || onSendPrompt !== undefined) &&
      submitActionAvailable &&
      !disabled &&
      !attaching &&
      supportsAttachments &&
      !submittingRef.current
    );
  }

  async function submitDraftPrompt(
    input: ChatInput,
    submittedDraft: string,
    submittedAttachments: ImageAttachment[],
  ) {
    if (onSendPrompt) {
      await onSendPrompt(input);
      clearDraftIfUnchanged(submittedDraft);
      clearAttachmentsIfUnchanged(submittedAttachments);
      return;
    }
    if (slashDraft) {
      await executeSlashDraft(submittedDraft);
      return;
    }
    if (activeSubmitMode === "blocked") {
      return;
    }
    if (activeSubmitMode === "steer") {
      if (actions.steerMessage === undefined) {
        throw new Error("Composer action steerMessage is required for active-run steering.");
      }
      const result = await actions.steerMessage(input);
      if (result) {
        recordAcceptedSubmission({
          attachments: submittedAttachments,
          input,
          userMessage: result.userMessage,
        });
      }
      clearDraftIfUnchanged(submittedDraft);
      clearAttachmentsIfUnchanged(submittedAttachments);
      return;
    }
    if (actions.sendMessage === undefined) {
      throw new Error("Composer action sendMessage is required to send a new message.");
    }
    const result = await actions.sendMessage(input);
    if (result) {
      recordAcceptedSubmission({
        attachments: submittedAttachments,
        input,
        userMessage: result.userMessage,
      });
    }
    clearDraftIfUnchanged(submittedDraft);
    clearAttachmentsIfUnchanged(submittedAttachments);
  }

  async function executeSlashDraft(submittedDraft: string) {
    const execution = await slashCommandExecutionPlan({
      commands,
      confirmReplacement: (message) => window.confirm(message),
      currentGoal: viewModel.goal,
      draft: submittedDraft,
      loadCommands: loadCommandDescriptorsForExecution,
      selectedIndex: selectedSuggestionIndex,
      shouldReloadCommands: commandDescriptorsNeedLoad({
        commandListContextKey,
        commandListKey,
        commands,
      }),
    });
    if (!execution) {
      return;
    }
    setCommands(execution.commands);
    const pendingGoalObjective = execution.pendingGoalObjective;
    if (pendingGoalObjective) {
      setModelPicker(null);
      clearDraftIfUnchanged(submittedDraft);
    }
    const result = await executeCommandWithDraftRecovery(
      execution.commandText,
      execution.options,
      pendingGoalObjective,
      submittedDraft,
    );
    if (result.result.action === "model_picker") {
      setModelPicker(result);
      if (!pendingGoalObjective) {
        clearDraftIfUnchanged(submittedDraft);
      }
    } else if (result.result.action === "goal_editor") {
      setModelPicker(null);
      replaceDraftIfUnchanged(submittedDraft, result.result.composerDraft);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setModelPicker(null);
      if (!pendingGoalObjective) {
        clearDraftIfUnchanged(submittedDraft);
      }
    }
  }

  async function executeCommandWithDraftRecovery(
    commandText: string,
    options: ChatCommandExecutionOptions | undefined,
    pendingGoalObjective: string | null,
    submittedDraft: string,
  ) {
    try {
      if (commandActions === undefined) {
        throw new Error("Composer command actions are required to execute slash commands.");
      }
      return await commandActions.executeCommand(
        commandText,
        options,
        pendingGoalObjective ? { pendingGoalObjective } : undefined,
      );
    } catch (error) {
      if (pendingGoalObjective) {
        replaceDraftIfUnchanged("", submittedDraft);
      }
      throw error;
    }
  }

  async function loadCommandDescriptorsForExecution() {
    if (commandListContextKey === "") {
      return emptyCommandDescriptors;
    }
    if (listCommands === undefined) {
      throw new Error("Composer command action listCommands is required to load slash commands.");
    }
    const result = await listCommands();
    const loadedCommands = result?.commands ?? emptyCommandDescriptors;
    setCommands(loadedCommands);
    setCommandListKey(commandListContextKey);
    return loadedCommands;
  }

  function completeCommand() {
    const completion = completionForCommandState(commandState, selectedSuggestionIndex);
    applyCommandCompletion(completion);
  }

  function handleCommandPaletteKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = commandPaletteKeyAction(event, {
      paletteVisible: commandPaletteVisible,
      slashDraft,
      suggestionCount: commandState.suggestions.length,
    });
    switch (action) {
      case "dismiss":
        event.preventDefault();
        setPaletteDismissed(true);
        return true;
      case "next":
        event.preventDefault();
        setSelectedSuggestionIndex((index) => (index + 1) % commandState.suggestions.length);
        return true;
      case "previous":
        event.preventDefault();
        setSelectedSuggestionIndex(
          (index) =>
            (index + commandState.suggestions.length - 1) % commandState.suggestions.length,
        );
        return true;
      case "complete":
        event.preventDefault();
        completeCommand();
        return true;
      case "none":
        return false;
    }
  }

  function applyCommandCompletion(completion: CommandCompletionEdit | null) {
    if (!completion) {
      return;
    }
    updateDraft(completion.value);
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(completion.selectionStart, completion.selectionEnd);
    });
  }

  async function pickCommandSuggestion(suggestion: CommandSuggestionRow) {
    if (!suggestion.available || !suggestion.completion) {
      return;
    }
    applyCommandCompletion(suggestion.completion);
  }

  async function queueDraft() {
    const submittedDraft = draft;
    const submittedAttachments = attachments;
    const prompt = submittedDraft.trim();
    const input = chatInputFromDraft(prompt, submittedAttachments, attachmentImageInputsById);
    if (
      !canQueueComposerDraft({
        attaching,
        disabled,
        input,
        running,
        runPresentation,
        sessionAvailable: session !== null,
        submitting: submittingRef.current,
        supportsAttachments,
      })
    ) {
      return;
    }
    if (slashDraft) {
      return;
    }
    submittingRef.current = true;
    try {
      focusComposerSoon();
      if (actions.queueMessage === undefined) {
        return;
      }
      const result = await actions.queueMessage(input);
      if (result) {
        recordAcceptedSubmission({
          attachments: submittedAttachments,
          input,
          userMessage: result.userMessage,
        });
      }
      clearDraftIfUnchanged(submittedDraft);
      clearAttachmentsIfUnchanged(submittedAttachments);
      focusComposerSoon();
    } catch {
      focusComposerSoon();
    } finally {
      submittingRef.current = false;
    }
  }

  async function sendImmediateSteering() {
    const submittedDraft = draft;
    const submittedAttachments = attachments;
    const prompt = submittedDraft.trim();
    const input = chatInputFromDraft(prompt, submittedAttachments, attachmentImageInputsById);
    if (!canSubmitImmediateSteering(input, prompt)) {
      return;
    }
    submittingRef.current = true;
    try {
      if (actions.sendSteeringImmediately === undefined) {
        return;
      }
      await actions.sendSteeringImmediately(chatInputHasContent(input) ? input : undefined);
      clearDraftIfUnchanged(submittedDraft);
      clearAttachmentsIfUnchanged(submittedAttachments);
    } catch {
      focusComposerSoon();
    } finally {
      submittingRef.current = false;
    }
  }

  function canSubmitImmediateSteering(input: ChatInput, prompt: string) {
    return (
      session !== null &&
      !submittingRef.current &&
      actions.sendSteeringImmediately !== undefined &&
      canSendImmediateSteeringComposerDraft({
        attaching,
        disabled,
        draftText: prompt,
        hasImmediateSteeringContent: chatInputHasContent(input),
        hasPendingSteering,
        runPresentation,
        running,
        sendSteeringImmediately: actions.sendSteeringImmediately,
        slashDraft,
        supportsAttachments,
      })
    );
  }

  async function attachFromPicker() {
    if (!canAttachImages()) {
      return;
    }
    const attachmentContext = attachmentContextRef.current;
    const remaining = maxComposerImageAttachments - attachments.length;
    setAttaching(true);
    setAttachmentError(null);
    try {
      if (attachmentActions === undefined) {
        return;
      }
      const created = await attachmentActions.createImageAttachmentsFromPicker(remaining);
      if (attachmentContextRef.current === attachmentContext) {
        appendAttachments(created);
      }
    } catch (error) {
      if (attachmentContextRef.current === attachmentContext) {
        setAttachmentError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (attachmentContextRef.current === attachmentContext) {
        setAttaching(false);
      }
    }
  }

  async function attachFiles(fileList: FileList | File[]) {
    const preflight = composerAttachmentFilePreflight({
      attachmentActions,
      canAttach: canAttachImages(),
      currentAttachmentCount: attachments.length,
      fileList,
    });
    if (preflight.kind === "skip") {
      return;
    }
    if (preflight.kind === "error") {
      setAttachmentError(preflight.error);
      return;
    }
    const attachmentContext = attachmentContextRef.current;
    setAttaching(true);
    setAttachmentError(null);
    try {
      const created = await createImageAttachmentsFromFiles(
        preflight.files,
        preflight.attachmentActions.createImageAttachmentFromBytes,
      );
      if (attachmentContextRef.current === attachmentContext) {
        appendAttachments(created.attachments);
        setAttachmentError(created.error);
      }
    } catch (error) {
      if (attachmentContextRef.current === attachmentContext) {
        setAttachmentError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (attachmentContextRef.current === attachmentContext) {
        setAttaching(false);
      }
    }
  }

  function canAttachImages() {
    return (
      session !== null &&
      attachmentActions !== undefined &&
      !disabled &&
      supportsImages &&
      !submittingRef.current &&
      !attaching &&
      attachments.length < maxComposerImageAttachments
    );
  }

  function appendAttachments(nextAttachments: ImageAttachment[]) {
    if (nextAttachments.length === 0) {
      return;
    }
    promptHistory.exitBrowsing();
    setAttachments((current) => {
      if (current.length + nextAttachments.length > maxComposerImageAttachments) {
        setAttachmentError(`A message can include up to ${maxComposerImageAttachments} images.`);
        return current;
      }
      setAttachmentImageInputsById((currentInputs) => ({
        ...currentInputs,
        ...Object.fromEntries(
          nextAttachments.map((attachment) => [
            attachment.id,
            { attachmentId: attachment.id, detail: null },
          ]),
        ),
      }));
      return [...current, ...nextAttachments];
    });
  }

  function removeAttachment(attachmentId: string) {
    promptHistory.exitBrowsing();
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    setAttachmentImageInputsById((current) => {
      const next = { ...current };
      delete next[attachmentId];
      return next;
    });
  }

  async function openModelPicker() {
    if (
      session === null ||
      modelActions === undefined ||
      disabled ||
      running ||
      submittingRef.current
    ) {
      return;
    }
    submittingRef.current = true;
    try {
      const result = await modelActions.openCodexModelPicker();
      if (result.result.action === "model_picker") {
        clearPermissionPicker();
        setModelPicker(result);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } finally {
      submittingRef.current = false;
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (handleCommandPaletteKeyDown(event)) {
      return;
    }
    if (
      promptHistory.handleKeyDown(
        event,
        {
          attachments,
          imageInputsByAttachmentId: attachmentImageInputsById,
          text: draft,
        },
        modelPickerOpen || permissionPickerOpen,
      )
    ) {
      return;
    }
    handleComposerKeyDown(event, {
      canQueue: actions.queueMessage !== undefined,
      canStop: runPresentation.canStop && actions.stopActiveRun !== undefined,
      completeCommand,
      draftEmpty: draftText === "",
      dismissPicker,
      hasPendingSteering,
      pickerOpen: modelPickerOpen || permissionPickerOpen,
      queueDraft,
      running,
      sendDraft,
      sendImmediateSteering,
      slashDraft,
      stopRun: actions.stopActiveRun ?? missingComposerStopAction,
    });
  }

  return (
    <ComposerFrame
      acceptsPrompt={acceptsPrompt}
      attachmentActionsAvailable={attachmentActions !== undefined}
      attachmentError={attachmentError}
      attachments={attachments}
      attaching={attaching}
      canAttachImages={canAttachImages()}
      canSend={canSend}
      canSendImmediately={canSendImmediately}
      commandActionsAvailable={commandActions !== undefined}
      commandListError={commandListError}
      commandListPending={commandListPending}
      commandListStatus={viewModel.commandListStatus}
      commandPaletteVisible={commandPaletteVisible}
      commandState={commandState}
      disabled={disabled}
      draft={draft}
      formClassName={formClassName}
      frameClassName={frameClassName}
      handleTextareaKeyDown={handleTextareaKeyDown}
      modelActionsAvailable={modelActions !== undefined}
      modelPicker={modelPicker}
      modelPickerDisabled={modelPickerDisabled}
      operation={viewModel.operation}
      permissionActionsAvailable={permissionActions !== undefined}
      permissionConfirmation={permissionConfirmation}
      permissionPicker={permissionPicker}
      permissionPickerDisabled={permissionPickerDisabled}
      placeholder={placeholder}
      queueDraft={actions.queueMessage === undefined ? undefined : queueDraft}
      readOnlySettings={readOnlySettings}
      retryActiveRunLiveness={actions.retryActiveRunLiveness}
      runPresentation={runPresentation}
      running={running}
      selected={selected}
      session={session}
      selectedSuggestionIndex={selectedSuggestionIndex}
      sendDraft={sendDraft}
      sendImmediateSteering={
        actions.sendSteeringImmediately === undefined ? undefined : sendImmediateSteering
      }
      stopActiveRun={actions.stopActiveRun}
      supportsImages={supportsImages}
      textareaRef={textareaRef}
      updateDraft={updateDraft}
      onAttachFiles={attachFiles}
      onAttachFromPicker={attachFromPicker}
      onCancelPermissionConfirmation={cancelPermissionConfirmation}
      onConfirmPermissionSelection={confirmPermissionSelection}
      onDismissModelPicker={dismissModelPicker}
      onOpenModelPicker={openModelPicker}
      onOpenPermissionPicker={openPermissionPicker}
      onPickCommandSuggestion={pickCommandSuggestion}
      onPickModel={executeModelSelection}
      onPickPermissionPreset={executePermissionSelection}
      onPickReasoningEffort={executeReasoningEffortSelection}
      onRemoveAttachment={removeAttachment}
    />
  );

  function updateDraft(nextDraft: string) {
    promptHistory.exitBrowsing();
    if (!submittingRef.current) {
      restoreComposerFocusRef.current = false;
    }
    setDraft(nextDraft);
    setPaletteDismissed(false);
    if (
      commandActions !== undefined &&
      isSlashDraft(nextDraft) &&
      viewModel.commandListStatus === "failed"
    ) {
      setCommandListKey("");
      setCommandListRequestKey("");
    }
    if (!isSlashDraft(nextDraft)) {
      setModelPicker(null);
    }
  }

  function clearDraftIfUnchanged(submittedDraft: string) {
    replaceDraftIfUnchanged(submittedDraft, "");
  }

  function clearAttachmentsIfUnchanged(submittedAttachments: ImageAttachment[]) {
    const submittedIds = submittedAttachments.map((attachment) => attachment.id).join("\n");
    setAttachments((current) => {
      if (current.map((attachment) => attachment.id).join("\n") !== submittedIds) {
        return current;
      }
      setAttachmentImageInputsById({});
      return [];
    });
  }

  function recordAcceptedSubmission({
    attachments: submittedAttachments,
    input,
    userMessage,
  }: AcceptedComposerSubmission) {
    promptHistory.recordAcceptedSubmission(userMessage, input, submittedAttachments);
  }

  function replaceDraftIfUnchanged(submittedDraft: string, replacement: string) {
    setDraft((current) => (current === submittedDraft ? replacement : current));
  }

  function applyPromptHistoryDraft(historyDraft: ComposerPromptHistoryDraft) {
    restoreComposerFocusRef.current = false;
    setDraft(historyDraft.text);
    setAttachments(historyDraft.attachments);
    setAttachmentImageInputsById(historyDraft.imageInputsByAttachmentId);
    setPaletteDismissed(false);
    setModelPicker(null);
  }

  function dismissModelPicker() {
    setModelPicker(null);
    textareaRef.current?.focus();
  }

  function dismissPicker() {
    setModelPicker(null);
    clearPermissionState();
    textareaRef.current?.focus();
  }

  function focusComposerSoon() {
    setFocusRequest((request) => request + 1);
    focusComposer();
    for (const delayMs of [0, 25, 100, 250, 500, 1000, 2000]) {
      window.setTimeout(focusComposer, delayMs);
    }
  }

  function focusComposer() {
    const textarea = textareaRef.current;
    if (!textarea || textarea.disabled) {
      return;
    }
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      active !== textarea
    ) {
      restoreComposerFocusRef.current = false;
      return;
    }
    textarea.focus();
  }

  async function executeModelSelection(model: ChatModelOption) {
    if (session === null || modelActions === undefined || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await modelActions.setCodexModel(model.model);
      setModelPicker(null);
    } finally {
      submittingRef.current = false;
    }
  }

  async function executeReasoningEffortSelection(effort: ChatReasoningEffortOption) {
    if (session === null || modelActions === undefined || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await modelActions.setCodexReasoningEffort(effort.effort);
      setModelPicker(null);
    } finally {
      submittingRef.current = false;
    }
  }
}

export const Composer = memo(ComposerComponent, composerPropsEqual);

function composerPropsEqual(previous: ComposerProps, next: ComposerProps) {
  return (
    composerActionPropsEqual(previous.actions, next.actions) &&
    composerScalarPropsEqual(previous, next) &&
    runPresentationPropsEqual(previous.runPresentation, next.runPresentation) &&
    composerViewModelPropsEqual(previous.viewModel, next.viewModel)
  );
}
