import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import { commandDescriptorContextKey } from "../stores/chat-store-command-cache";
import type { ComposerActions, ComposerViewModel } from "./chat-composer-contract";
import { composerCanSteer } from "./chat-composer-liveness";
import {
  canSendImmediateSteeringDraft,
  composerAttachmentsSupported,
  composerSlashDraft,
  immediateSteeringHasContent,
  selectedConversationWorkspaceId,
} from "./chat-composer-state";
import { validateComposerAttachmentFiles } from "./chat-composer-attachments";

export function composerCommandListContextKey(
  commandActions: ComposerActions["commands"],
  running: boolean,
  selectedConversation: ComposerViewModel["selectedConversation"],
) {
  if (commandActions === undefined) {
    return "";
  }
  return commandDescriptorContextKey({
    active: running,
    selectedConversation,
    workspaceId: selectedConversationWorkspaceId(selectedConversation),
  });
}

export function composerSlashDraftEnabled(
  commandActions: ComposerActions["commands"],
  draft: string,
  hasAttachments: boolean,
) {
  return commandActions !== undefined && composerSlashDraft(draft, hasAttachments);
}

export function composerDraftSupportsAttachments(
  attachmentActions: ComposerActions["attachments"],
  hasAttachments: boolean,
  supportsImages: boolean,
) {
  if (!composerAttachmentsSupported(hasAttachments, supportsImages)) {
    return false;
  }
  return !hasAttachments || attachmentActions !== undefined;
}

export function composerModelPickerDisabled(
  modelActions: ComposerActions["modelSettings"],
  selectedConversation: ComposerViewModel["selectedConversation"],
  disabled: boolean,
  running: boolean,
) {
  return modelActions === undefined || selectedConversation === null || disabled || running;
}

export function canSendImmediateSteeringComposerDraft({
  attaching,
  disabled,
  draftText,
  hasImmediateSteeringContent,
  hasPendingSteering,
  runPresentation,
  running,
  sendSteeringImmediately,
  slashDraft,
  supportsAttachments,
}: {
  attaching: boolean;
  disabled: boolean;
  draftText: string;
  hasImmediateSteeringContent: boolean;
  hasPendingSteering: boolean;
  runPresentation: ActiveRunPresentation;
  running: boolean;
  sendSteeringImmediately: ComposerActions["sendSteeringImmediately"];
  slashDraft: boolean;
  supportsAttachments: boolean;
}) {
  return canSendImmediateSteeringDraft({
    attaching,
    disabled,
    draftText,
    hasPendingSteering: immediateSteeringHasContent(
      hasPendingSteering,
      hasImmediateSteeringContent,
    ),
    running: composerCanSteer(running, runPresentation) && sendSteeringImmediately !== undefined,
    slashDraft,
    supportsAttachments,
  });
}

type ComposerAttachmentFilePreflight =
  | {
      kind: "ready";
      attachmentActions: NonNullable<ComposerActions["attachments"]>;
      files: File[];
    }
  | { kind: "error"; error: string }
  | { kind: "skip" };

export function composerAttachmentFilePreflight({
  attachmentActions,
  canAttach,
  currentAttachmentCount,
  fileList,
}: {
  attachmentActions: ComposerActions["attachments"];
  canAttach: boolean;
  currentAttachmentCount: number;
  fileList: FileList | File[];
}): ComposerAttachmentFilePreflight {
  if (!canAttach || attachmentActions === undefined) {
    return { kind: "skip" };
  }
  const validation = validateComposerAttachmentFiles(fileList, currentAttachmentCount);
  if (validation.error !== null) {
    return { kind: "error", error: validation.error };
  }
  if (validation.files.length === 0) {
    return { kind: "skip" };
  }
  return { attachmentActions, files: validation.files, kind: "ready" };
}
