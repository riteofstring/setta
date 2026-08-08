type AttachmentLimit = {
  maxFiles: number | null;
  disabled: boolean;
};

export function resolveAttachmentLimit(value: number): AttachmentLimit {
  if (!Number.isFinite(value)) {
    return { maxFiles: 0, disabled: true };
  }
  if (value === 0) {
    return { maxFiles: 0, disabled: true };
  }
  if (value < 0) {
    return { maxFiles: null, disabled: false };
  }
  return { maxFiles: value, disabled: false };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[index]}`;
}
