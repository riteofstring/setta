export function truncateTextPreview(text: string, limit: number, marker = "") {
  if (limit <= 0) {
    return text;
  }
  const codePoints = Array.from(text);
  if (codePoints.length <= limit) {
    return text;
  }
  return codePoints.slice(0, limit).join("").trimEnd() + marker;
}
