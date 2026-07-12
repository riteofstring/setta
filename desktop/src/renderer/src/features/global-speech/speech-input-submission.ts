export function canonicalSpeechInputTimestamp(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    throw new Error("speech input timestamp is invalid");
  }
  return value
    .toISOString()
    .replace(/\.([0-9]*?[1-9])?0+Z$/, (_match, digits?: string) => (digits ? `.${digits}Z` : "Z"));
}
