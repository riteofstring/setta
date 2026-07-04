import type {
  ChatCommandDescriptor,
  ChatCommandExecuteResult,
  ChatImageInput,
  ChatInput,
  ImageAttachment,
  ChatModelOption,
  ChatReasoningEffortOption,
} from "@generated/backend";
import { ImagePlus } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { chatInputFromDraft, chatInputHasContent } from "../lib/chat-input";
import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import { cn } from "../lib/utils";
import { commandDescriptorContextKey } from "../stores/chat-store-command-cache";
import { CommandPalette } from "./chat-command-palette";
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
import {
  ComposerButton,
  handleComposerKeyDown,
  ModelPickerButton,
  PermissionConfirmationDialog,
  PermissionPickerButton,
  VoiceInputUnavailableButton,
} from "./chat-composer-controls";
import {
  AttachmentStrip,
  clipboardHasImageFile,
  createImageAttachmentsFromFiles,
  dragHasImageFile,
  maxComposerImageAttachments,
  validateComposerAttachmentFiles,
} from "./chat-composer-attachments";
import {
  commandPaletteShouldOpen,
  commandPaletteKeyAction,
  composerAcceptsPrompt,
  ComposerPlaceholder,
  composerTextareaLabel,
  isSlashDraft,
} from "./chat-composer-helpers";
import {
  activeRunSubmitMode,
  canQueueComposerDraft,
  composerCanSteer,
  composerSendDisabled,
} from "./chat-composer-liveness";
import {
  attachmentButtonTitle,
  canSendComposerDraft,
  canSendImmediateSteeringDraft,
  composerAttachmentsSupported,
  composerDisabled,
  composerSlashDraft,
  immediateSteeringHasContent,
  isModelPickerOpen,
  selectedConversationSupportsImages,
  selectedConversationWorkspaceId,
} from "./chat-composer-state";
import { useComposerPromptHistory, type ComposerPromptHistoryDraft } from "./chat-composer-history";
import { useComposerPermissionPicker } from "./chat-composer-permission";
import { composerChatPropsEqual } from "./chat-composer-props";
import type { ChatView } from "./chat-panel";
import { chatReadableColumnAttributes, chatReadableColumnClass } from "./chat-layout";
import { Textarea } from "./ui/textarea";

export { modelPickerOptionSelected, reasoningEffortOptionSelected } from "./chat-composer-controls";
export { CommandPalette } from "./chat-command-palette";
export { commandSuggestions } from "./chat-composer-helpers";

const emptyCommandDescriptors: ChatCommandDescriptor[] = [];

interface ComposerProps {
  busy: boolean;
  chat: ChatView;
  disabled?: boolean;
  formClassName?: string;
  frameClassName?: string;
  onSendPrompt?: (input: ChatInput) => Promise<void>;
  placeholder?: string;
  running: boolean;
  runPresentation: ActiveRunPresentation;
}

function ComposerComponent({
  busy,
  chat,
  disabled: disabledOverride,
  formClassName,
  frameClassName,
  onSendPrompt,
  placeholder = "",
  running,
  runPresentation,
}: ComposerProps) {
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
  const selectedConversation = chat.selectedConversation;
  const selected = selectedConversation !== null;
  const selectedConversationId = selectedConversation?.id ?? "";
  const attachmentContextRef = useRef(selectedConversationId);
  const commandListContextKey = commandDescriptorContextKey({
    active: running,
    selectedConversation,
    workspaceId: selectedConversationWorkspaceId(selectedConversation),
  });
  const listCommands = chat.listCommands;
  const acceptsPrompt = composerAcceptsPrompt(selected, onSendPrompt !== undefined);
  const disabled = composerDisabled(disabledOverride, acceptsPrompt, busy);
  const hasAttachments = attachments.length > 0;
  const slashDraft = composerSlashDraft(draft, hasAttachments);
  const draftText = draft.trim();
  const commandState = useMemo(() => commandComposerState(draft, commands), [commands, draft]);
  const commandListPending = commandListPendingForDraft({
    commandListContextKey,
    commandListKey,
    commandListRequestKey,
    commandListStatus: chat.commandListStatus,
    slashDraft,
  });
  const commandListError = commandListErrorForDraft(
    slashDraft,
    chat.commandListStatus,
    chat.commandListError,
  );
  const hasPendingSteering = chat.pendingSteeringMessageIds.length > 0;
  const modelPickerOpen = isModelPickerOpen(modelPicker);
  const commandPaletteVisible = commandPaletteShouldOpen(
    slashDraft,
    paletteDismissed,
    modelPickerOpen,
  );
  const supportsImages = selectedConversationSupportsImages(selectedConversation);
  const supportsAttachments = composerAttachmentsSupported(hasAttachments, supportsImages);
  const canSend = canSendComposerDraft({
    attaching,
    disabled: composerSendDisabled(disabled, running, runPresentation),
    draftText,
    hasAttachments,
    supportsAttachments,
  });
  const canSendImmediately = canSendImmediateSteeringDraft({
    attaching,
    disabled,
    draftText,
    hasPendingSteering: immediateSteeringHasContent(hasPendingSteering, hasAttachments),
    running: composerCanSteer(running, runPresentation),
    slashDraft,
    supportsAttachments,
  });
  const modelPickerDisabled = selectedConversation === null || disabled || running;
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
    chat,
    clearModelPicker: () => setModelPicker(null),
    disabled,
    focusComposer,
    running,
    setDraft,
    submittingRef,
  });
  const promptHistory = useComposerPromptHistory({
    applyDraft: applyPromptHistoryDraft,
    conversationId: selectedConversationId,
    listHistory: chat.listComposerPromptHistory,
    maxAttachments: maxComposerImageAttachments,
    setDiagnostic: setAttachmentError,
    textareaRef,
  });

  useEffect(() => {
    attachmentContextRef.current = selectedConversationId;
    setAttachments([]);
    setAttachmentImageInputsById({});
    setAttachmentError(null);
    setAttaching(false);
    setModelPicker(null);
    clearPermissionState();
  }, [selectedConversationId]);

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
  }, [chat.activeRun?.id, disabled, running]);

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
      (chat.selectedConversation !== null || onSendPrompt !== undefined) &&
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
    const activeSubmit = activeRunSubmitMode(running, runPresentation);
    if (activeSubmit === "blocked") {
      return;
    }
    if (activeSubmit === "steer") {
      const result = await chat.steerMessage(input);
      if (result) {
        promptHistory.recordAcceptedSubmission(result.userMessage, input, submittedAttachments);
      }
      clearDraftIfUnchanged(submittedDraft);
      clearAttachmentsIfUnchanged(submittedAttachments);
      return;
    }
    const result = await chat.sendMessage(input);
    if (result) {
      promptHistory.recordAcceptedSubmission(result.userMessage, input, submittedAttachments);
    }
    clearDraftIfUnchanged(submittedDraft);
    clearAttachmentsIfUnchanged(submittedAttachments);
  }

  async function executeSlashDraft(submittedDraft: string) {
    const execution = await slashCommandExecutionPlan({
      commands,
      confirmReplacement: (message) => window.confirm(message),
      currentGoal: chat.goal,
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
    options: Parameters<ChatView["executeCommand"]>[1],
    pendingGoalObjective: string | null,
    submittedDraft: string,
  ) {
    try {
      return await chat.executeCommand(
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
        selectedConversation: chat.selectedConversation,
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
      const result = await chat.queueMessage(input);
      if (result) {
        promptHistory.recordAcceptedSubmission(result.userMessage, input, submittedAttachments);
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
      await chat.sendSteeringImmediately(chatInputHasContent(input) ? input : undefined);
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
      chat.selectedConversation !== null &&
      !submittingRef.current &&
      canSendImmediateSteeringDraft({
        attaching,
        disabled,
        draftText: prompt,
        hasPendingSteering: hasPendingSteering || chatInputHasContent(input),
        running: composerCanSteer(running, runPresentation),
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
      const created = await chat.createImageAttachmentsFromPicker(remaining);
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
    if (!canAttachImages()) {
      return;
    }
    const attachmentContext = attachmentContextRef.current;
    const { error, files } = validateComposerAttachmentFiles(fileList, attachments.length);
    if (error !== null) {
      setAttachmentError(error);
      return;
    }
    if (files.length === 0) {
      return;
    }
    setAttaching(true);
    setAttachmentError(null);
    try {
      const created = await createImageAttachmentsFromFiles(
        files,
        chat.createImageAttachmentFromBytes,
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
      chat.selectedConversation !== null &&
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
    if (!chat.selectedConversation || disabled || running || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      const result = await chat.openCodexModelPicker();
      if (result.result.action === "model_picker") {
        clearPermissionPicker();
        setModelPicker(result);
        setDraft("");
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <>
      <form
        className={cn("workspace-chat-pane-surface px-3 pt-1 pb-1.5", formClassName)}
        data-testid="chat-composer"
        onDragOver={(event) => {
          if (dragHasImageFile(event.dataTransfer)) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          if (!dragHasImageFile(event.dataTransfer)) {
            return;
          }
          event.preventDefault();
          void attachFiles(event.dataTransfer.files);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void sendDraft();
        }}
      >
        <div {...chatReadableColumnAttributes} className={cn("relative", chatReadableColumnClass)}>
          <div
            className={cn(
              "min-w-0 rounded-sm border border-border bg-card/90 px-2 py-1.5 shadow-lg shadow-black/15",
              frameClassName,
            )}
          >
            <div className="relative min-w-0">
              <ComposerPlaceholder
                selected={selected}
                visible={draft === "" && placeholder === ""}
              />
              <CommandPalette
                commandListStatus={chat.commandListStatus}
                commandListError={commandListError}
                commandListPending={commandListPending}
                commandState={commandState}
                draft={draft}
                modelPicker={modelPicker}
                onPickSuggestion={(suggestion) => {
                  void pickCommandSuggestion(suggestion);
                }}
                onDismissModelPicker={dismissModelPicker}
                onPickModel={(model) => {
                  void executeModelSelection(model);
                }}
                onPickReasoningEffort={(effort) => {
                  void executeReasoningEffortSelection(effort);
                }}
                paletteVisible={commandPaletteVisible}
                selectedSuggestionIndex={selectedSuggestionIndex}
              />
              <Textarea
                aria-label={composerTextareaLabel(acceptsPrompt)}
                className="relative z-10 max-h-28 min-h-8 min-w-0 resize-none border-0 bg-transparent px-0 py-0 text-xs leading-4 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                onChange={(event) => updateDraft(event.target.value)}
                onKeyDown={(event) => {
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
                    canStop: runPresentation.canStop,
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
                    stopRun: chat.stopActiveRun,
                  });
                }}
                onPaste={(event) => {
                  if (!clipboardHasImageFile(event.clipboardData)) {
                    return;
                  }
                  event.preventDefault();
                  void attachFiles(event.clipboardData.files);
                }}
                placeholder={placeholder}
                ref={textareaRef}
                rows={2}
                value={draft}
              />
            </div>
            <AttachmentStrip
              attachments={attachments}
              error={attachmentError}
              onRemove={removeAttachment}
            />
            <div className="mt-1 flex min-w-0 items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1">
                <PermissionPickerButton
                  disabled={permissionPickerDisabled}
                  onOpen={() => void openPermissionPicker()}
                  onSelect={(preset) => {
                    void executePermissionSelection(preset);
                  }}
                  permissionPicker={permissionPicker}
                  running={running}
                  selectedConversation={chat.selectedConversation}
                />
                <button
                  aria-label="Attach image"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canAttachImages()}
                  onClick={() => void attachFromPicker()}
                  title={attachmentButtonTitle(supportsImages, attaching)}
                  type="button"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex min-w-0 items-center gap-1">
                <ModelPickerButton
                  disabled={modelPickerDisabled}
                  modelPicker={modelPicker}
                  onOpen={() => void openModelPicker()}
                  running={running}
                  selectedConversation={chat.selectedConversation}
                />
                <VoiceInputUnavailableButton />
                <ComposerButton
                  canSend={canSend}
                  chat={chat}
                  canSendImmediately={canSendImmediately}
                  queueDraft={queueDraft}
                  running={running}
                  runPresentation={runPresentation}
                  sendImmediateSteering={sendImmediateSteering}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
      <PermissionConfirmationDialog
        onCancel={cancelPermissionConfirmation}
        onConfirm={() => void confirmPermissionSelection()}
        preset={permissionConfirmation}
      />
    </>
  );

  function updateDraft(nextDraft: string) {
    promptHistory.exitBrowsing();
    if (!submittingRef.current) {
      restoreComposerFocusRef.current = false;
    }
    setDraft(nextDraft);
    setPaletteDismissed(false);
    if (isSlashDraft(nextDraft) && chat.commandListStatus === "failed") {
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
    if (!chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await chat.setCodexModel(model.model);
      setDraft("");
      setModelPicker(null);
    } finally {
      submittingRef.current = false;
    }
  }

  async function executeReasoningEffortSelection(effort: ChatReasoningEffortOption) {
    if (!chat.selectedConversation || disabled || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    try {
      await chat.setCodexReasoningEffort(effort.effort);
      setDraft("");
      setModelPicker(null);
    } finally {
      submittingRef.current = false;
    }
  }
}

export const Composer = memo(ComposerComponent, composerPropsEqual);

function composerPropsEqual(previous: ComposerProps, next: ComposerProps) {
  return (
    previous.busy === next.busy &&
    previous.disabled === next.disabled &&
    previous.formClassName === next.formClassName &&
    previous.frameClassName === next.frameClassName &&
    previous.onSendPrompt === next.onSendPrompt &&
    previous.placeholder === next.placeholder &&
    previous.running === next.running &&
    composerChatPropsEqual(previous.chat, next.chat)
  );
}
