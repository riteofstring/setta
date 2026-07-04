import type {
  ChatCommandExecuteResult,
  ChatPermissionPresetID,
  ImageAttachment,
  ChatModelOption,
  ChatReasoningEffortOption,
} from "@generated/backend";
import { ImagePlus } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";

import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import { cn } from "../lib/utils";
import { CommandPalette } from "./chat-command-palette";
import type { CommandSuggestionRow } from "./chat-command-composer-controller";
import {
  ComposerButton,
  ModelPickerButton,
  PermissionConfirmationDialog,
  PermissionPickerButton,
  VoiceInputUnavailableButton,
} from "./chat-composer-controls";
import {
  AttachmentStrip,
  dragHasImageFile,
  clipboardHasImageFile,
} from "./chat-composer-attachments";
import { ComposerPlaceholder, composerTextareaLabel } from "./chat-composer-helpers";
import { attachmentButtonTitle } from "./chat-composer-state";
import { chatReadableColumnAttributes, chatReadableColumnClass } from "./chat-layout";
import { Textarea } from "./ui/textarea";
import type { ComposerSessionViewModel } from "./chat-composer-contract";

type CommandPaletteProps = Parameters<typeof CommandPalette>[0];
type PermissionPickerButtonProps = Parameters<typeof PermissionPickerButton>[0];

export interface ComposerFrameProps {
  acceptsPrompt: boolean;
  attachmentActionsAvailable: boolean;
  attachmentError: string | null;
  attachments: ImageAttachment[];
  attaching: boolean;
  canAttachImages: boolean;
  canSend: boolean;
  canSendImmediately: boolean;
  commandActionsAvailable: boolean;
  commandListError: string | null;
  commandListPending: boolean;
  commandListStatus: CommandPaletteProps["commandListStatus"];
  commandPaletteVisible: boolean;
  commandState: CommandPaletteProps["commandState"];
  disabled: boolean;
  draft: string;
  formClassName?: string;
  frameClassName?: string;
  handleTextareaKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  modelActionsAvailable: boolean;
  modelPicker: ChatCommandExecuteResult | null;
  modelPickerDisabled: boolean;
  operation: string | null;
  permissionActionsAvailable: boolean;
  permissionConfirmation: Parameters<typeof PermissionConfirmationDialog>[0]["preset"];
  permissionPicker: PermissionPickerButtonProps["permissionPicker"];
  permissionPickerDisabled: boolean;
  placeholder: string;
  queueDraft?: () => Promise<void>;
  retryActiveRunLiveness?: () => Promise<void>;
  runPresentation: ActiveRunPresentation;
  running: boolean;
  selected: boolean;
  session: ComposerSessionViewModel | null;
  selectedSuggestionIndex: number;
  sendDraft: () => Promise<void>;
  sendImmediateSteering?: () => Promise<void>;
  stopActiveRun?: () => Promise<void>;
  supportsImages: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  updateDraft: (draft: string) => void;
  onAttachFiles: (fileList: FileList | File[]) => Promise<void>;
  onAttachFromPicker: () => Promise<void>;
  onCancelPermissionConfirmation: () => void;
  onConfirmPermissionSelection: () => Promise<void>;
  onDismissModelPicker: () => void;
  onOpenModelPicker: () => Promise<void>;
  onOpenPermissionPicker: () => Promise<void>;
  onPickCommandSuggestion: (suggestion: CommandSuggestionRow) => Promise<void>;
  onPickModel: (model: ChatModelOption) => Promise<void>;
  onPickPermissionPreset: (preset: ChatPermissionPresetID) => Promise<void>;
  onPickReasoningEffort: (effort: ChatReasoningEffortOption) => Promise<void>;
  onRemoveAttachment: (attachmentId: string) => void;
}

export function ComposerFrame(props: ComposerFrameProps) {
  return (
    <>
      <form
        className={cn("workspace-chat-pane-surface px-3 pt-1 pb-1.5", props.formClassName)}
        data-testid="chat-composer"
        onDragOver={(event) => {
          if (props.attachmentActionsAvailable && dragHasImageFile(event.dataTransfer)) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          if (!props.attachmentActionsAvailable || !dragHasImageFile(event.dataTransfer)) {
            return;
          }
          event.preventDefault();
          void props.onAttachFiles(event.dataTransfer.files);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void props.sendDraft();
        }}
      >
        <div {...chatReadableColumnAttributes} className={cn("relative", chatReadableColumnClass)}>
          <div
            className={cn(
              "min-w-0 rounded-sm border border-border bg-card/90 px-2 py-1.5 shadow-lg shadow-black/15",
              props.frameClassName,
            )}
          >
            <div className="relative min-w-0">
              <ComposerPlaceholder
                selected={props.selected}
                visible={props.draft === "" && props.placeholder === ""}
              />
              <ComposerPaletteSlot {...props} />
              <Textarea
                aria-label={composerTextareaLabel(props.acceptsPrompt)}
                className="relative z-10 max-h-28 min-h-8 min-w-0 resize-none border-0 bg-transparent px-0 py-0 text-xs leading-4 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-0 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={props.disabled}
                onChange={(event) => props.updateDraft(event.target.value)}
                onKeyDown={props.handleTextareaKeyDown}
                onPaste={(event) => {
                  if (
                    !props.attachmentActionsAvailable ||
                    !clipboardHasImageFile(event.clipboardData)
                  ) {
                    return;
                  }
                  event.preventDefault();
                  void props.onAttachFiles(event.clipboardData.files);
                }}
                placeholder={props.placeholder}
                ref={props.textareaRef}
                rows={2}
                value={props.draft}
              />
            </div>
            <AttachmentStrip
              attachments={props.attachments}
              error={props.attachmentError}
              onRemove={props.onRemoveAttachment}
            />
            <div className="mt-1 flex min-w-0 items-center justify-between gap-1.5">
              <ComposerLeftControls {...props} />
              <ComposerRightControls {...props} />
            </div>
          </div>
        </div>
      </form>
      <PermissionConfirmationDialog
        onCancel={props.onCancelPermissionConfirmation}
        onConfirm={() => void props.onConfirmPermissionSelection()}
        preset={props.permissionConfirmation}
      />
    </>
  );
}

function ComposerPaletteSlot(props: ComposerFrameProps) {
  if (!props.commandActionsAvailable && !props.modelActionsAvailable) {
    return null;
  }
  return (
    <CommandPalette
      commandListStatus={props.commandListStatus}
      commandListError={props.commandListError}
      commandListPending={props.commandListPending}
      commandState={props.commandState}
      draft={props.draft}
      modelPicker={props.modelPicker}
      onPickSuggestion={(suggestion) => void props.onPickCommandSuggestion(suggestion)}
      onDismissModelPicker={props.onDismissModelPicker}
      onPickModel={(model) => void props.onPickModel(model)}
      onPickReasoningEffort={(effort) => void props.onPickReasoningEffort(effort)}
      paletteVisible={props.commandPaletteVisible}
      selectedSuggestionIndex={props.selectedSuggestionIndex}
    />
  );
}

function ComposerLeftControls(props: ComposerFrameProps) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {props.permissionActionsAvailable ? (
        <PermissionPickerButton
          disabled={props.permissionPickerDisabled}
          onOpen={() => void props.onOpenPermissionPicker()}
          onSelect={(preset) => void props.onPickPermissionPreset(preset)}
          permissionPicker={props.permissionPicker}
          permissionLabel={props.session?.permissionLabel ?? "Ask for approval"}
          running={props.running}
          selected={props.selected}
        />
      ) : null}
      {props.attachmentActionsAvailable ? (
        <button
          aria-label="Attach image"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!props.canAttachImages}
          onClick={() => void props.onAttachFromPicker()}
          title={attachmentButtonTitle(props.supportsImages, props.attaching)}
          type="button"
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ComposerRightControls(props: ComposerFrameProps) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {props.modelActionsAvailable ? (
        <ModelPickerButton
          disabled={props.modelPickerDisabled}
          modelLabel={props.session?.modelLabel ?? "Model"}
          modelPicker={props.modelPicker}
          onOpen={() => void props.onOpenModelPicker()}
          reasoningLabel={props.session?.reasoningLabel ?? "Reasoning"}
          running={props.running}
          selected={props.selected}
        />
      ) : null}
      <VoiceInputUnavailableButton />
      <ComposerButton
        canSend={props.canSend}
        canSendImmediately={props.canSendImmediately}
        operation={props.operation}
        queueDraft={props.queueDraft}
        retryActiveRunLiveness={props.retryActiveRunLiveness}
        running={props.running}
        runPresentation={props.runPresentation}
        sendImmediateSteering={props.sendImmediateSteering}
        stopActiveRun={props.stopActiveRun}
      />
    </div>
  );
}
