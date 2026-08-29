export type DropzoneAttachment = {
  // Identity is opaque and host-owned; the package uses it only for rendering and removal.
  id: string;
  kind: "file" | "text";
  name: string;
  size: number | null;
};

export type DropzonePolicy = {
  // `null` is the explicit unlimited form for count and per-result total bytes.
  maxAttachments: number | null;
  maxFileBytes: number;
  // Matches the frozen stateless path: this limit applies to one accepted file batch or one
  // dropped text result, not to the host's already-controlled attachment metadata.
  maxTotalBytes: number | null;
  // Prefix matching is deliberate (`image/` accepts `image/png`); an empty list accepts all.
  allowedMimePrefixes: ReadonlyArray<string>;
};

export type DropzoneAcceptedResult =
  | {
      kind: "files";
      // Raw browser objects cross the seam unchanged. The package never reads their bytes.
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
  // Results are stateless package output. The host decides whether and how to upload, persist,
  // assign identities, or reflect display metadata back through `attachments`.
  onAccepted: (result: DropzoneAcceptedResult) => void;
  onRejected: (rejections: ReadonlyArray<DropzoneRejection>) => void;
  onServerFilePickerRequest?: (request: DropzoneServerPickerRequest) => void;
  onAttachmentRemove?: (attachmentId: string) => void;
  placeholder?: string;
  pending?: boolean;
  errorMessage?: string;
  disabled?: boolean;
};
