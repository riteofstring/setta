export type DropzoneAttachment = {
  id: string;
  kind: "file" | "text";
  name: string;
  size: number | null;
};

export type DropzonePolicy = {
  maxAttachments: number | null;
  maxFileBytes: number;

  maxTotalBytes: number | null;

  allowedMimePrefixes: ReadonlyArray<string>;
};

export type DropzoneAcceptedResult =
  | {
      kind: "files";

      files: ReadonlyArray<File>;
    }
  | {
      kind: "text";
      text: string;
    };

export type DropzoneFileRejectionReason =
  "attachment-count" | "file-size" | "mime-type" | "total-size";

export type DropzoneFileRejection = {
  kind: "file";
  file: File;
  reason: DropzoneFileRejectionReason;
};

export type DropzoneTextRejection = {
  kind: "text";
  text: string;
  reason: "attachment-count" | "total-size";
};

export type DropzoneRejection = DropzoneFileRejection | DropzoneTextRejection;

export type DropzoneServerPickerRequest = {
  remainingSlots: number | null;
};

export type DropzoneValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  controlId: string;
  attachments: ReadonlyArray<DropzoneAttachment>;
  policy: DropzonePolicy;

  onAccepted: (result: DropzoneAcceptedResult) => void;
  onRejected: (rejections: ReadonlyArray<DropzoneRejection>) => void;
  onServerFilePickerRequest?: (request: DropzoneServerPickerRequest) => void;
  onAttachmentRemove?: (attachmentId: string) => void;
  placeholder?: string;
  pending?: boolean;
  errorMessage?: string;
  disabled?: boolean;
};
