import type { ChatInput } from "@generated/backend";

import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import type { ComposerActions, ComposerViewModel } from "./chat-composer-contract";
import { composerCanSteer, type ActiveRunSubmitMode } from "./chat-composer-liveness";
import {
  canSendComposerDraft,
  canSendImmediateSteeringDraft,
  composerAttachmentsSupported,
  composerSlashDraft,
  immediateSteeringHasContent,
} from "./chat-composer-state";
import { validateComposerAttachmentFiles } from "./chat-composer-attachments";

export function composerCommandListContextKey(
  commandActions: ComposerActions["commands"],
  session: ComposerViewModel["session"],
) {
  if (commandActions === undefined) {
    return "";
  }
  return session?.commandListContextKey ?? "";
}

export function composerSessionId(session: ComposerViewModel["session"]) {
  return session?.id ?? "";
}

export function composerSessionSupportsImages(session: ComposerViewModel["session"]) {
  return session?.supportsImages ?? true;
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
  session: ComposerViewModel["session"],
  disabled: boolean,
  running: boolean,
) {
  return modelActions === undefined || session === null || disabled || running;
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

export function canSendCurrentComposerDraft({
  attaching,
  disabled,
  draftText,
  hasAttachments,
  submitActionAvailable,
  supportsAttachments,
}: {
  attaching: boolean;
  disabled: boolean;
  draftText: string;
  hasAttachments: boolean;
  submitActionAvailable: boolean;
  supportsAttachments: boolean;
}) {
  if (!submitActionAvailable) {
    return false;
  }
  return canSendComposerDraft({
    attaching,
    disabled,
    draftText,
    hasAttachments,
    supportsAttachments,
  });
}

export function composerSubmitActionAvailable({
  commandActions,
  mode,
  onSendPrompt,
  sendMessage,
  slashDraft,
  steerMessage,
}: {
  commandActions: ComposerActions["commands"];
  mode: ActiveRunSubmitMode;
  onSendPrompt: ((input: ChatInput) => Promise<void>) | undefined;
  sendMessage: ComposerActions["sendMessage"];
  slashDraft: boolean;
  steerMessage: ComposerActions["steerMessage"];
}) {
  if (onSendPrompt !== undefined) {
    return true;
  }
  if (slashDraft) {
    return commandActions !== undefined;
  }
  switch (mode) {
    case "blocked":
      return false;
    case "send":
      return sendMessage !== undefined;
    case "steer":
      return steerMessage !== undefined;
  }
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
