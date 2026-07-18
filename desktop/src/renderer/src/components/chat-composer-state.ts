import type { ChatCommandExecuteResult } from "@generated/backend";

import { isSlashDraft } from "./chat-composer-helpers";

export function composerDisabled(
  disabledOverride: boolean | undefined,
  selected: boolean,
  busy: boolean,
) {
  if (disabledOverride !== undefined) {
    return disabledOverride;
  }
  return !selected || busy;
}

export function isModelPickerOpen(modelPicker: ChatCommandExecuteResult | null) {
  return modelPicker?.result.action === "model_picker";
}

export function canSendComposerDraft({
  attaching,
  disabled,
  draftText,
  hasAttachments,
  supportsAttachments,
}: {
  attaching: boolean;
  disabled: boolean;
  draftText: string;
  hasAttachments: boolean;
  supportsAttachments: boolean;
}) {
  return !disabled && !attaching && supportsAttachments && (draftText !== "" || hasAttachments);
}

export function canSendImmediateSteeringDraft({
  disabled,
  draftText,
  attaching,
  hasPendingSteering,
  running,
  slashDraft,
  supportsAttachments,
}: {
  attaching: boolean;
  disabled: boolean;
  draftText: string;
  hasPendingSteering: boolean;
  running: boolean;
  slashDraft: boolean;
  supportsAttachments: boolean;
}) {
  return (
    running &&
    !disabled &&
    !attaching &&
    !slashDraft &&
    supportsAttachments &&
    (draftText !== "" || hasPendingSteering)
  );
}

export function composerSlashDraft(draft: string, hasAttachments: boolean) {
  return !hasAttachments && isSlashDraft(draft);
}

export function immediateSteeringHasContent(hasPendingSteering: boolean, hasAttachments: boolean) {
  return hasPendingSteering || hasAttachments;
}

export function composerAttachmentsSupported(hasAttachments: boolean, supportsImages: boolean) {
  return !hasAttachments || supportsImages;
}

export function attachmentButtonTitle(supportsImages: boolean, attaching: boolean) {
  if (!supportsImages) {
    return "Selected model does not support images";
  }
  return attaching ? "Attaching image" : "Attach image";
}
