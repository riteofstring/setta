import type { ByteRangeV2 } from "./generatedContract";

const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length;
}

export function isUtf8Boundary(value: string, byteOffset: number): boolean {
  if (byteOffset < 0 || byteOffset > utf8ByteLength(value)) {
    return false;
  }
  let offset = 0;
  if (offset === byteOffset) {
    return true;
  }
  for (const character of value) {
    offset += utf8ByteLength(character);
    if (offset === byteOffset) {
      return true;
    }
    if (offset > byteOffset) {
      return false;
    }
  }
  return false;
}

export function sliceByByteRange(
  value: string,
  range: ByteRangeV2,
): string | undefined {
  let utf8Offset = 0;
  let start = -1;
  let end = -1;
  let utf16Offset = 0;
  for (const character of value) {
    if (utf8Offset === range.start) {
      start = utf16Offset;
    }
    if (utf8Offset === range.end) {
      end = utf16Offset;
    }
    utf8Offset += utf8ByteLength(character);
    utf16Offset += character.length;
  }
  if (utf8Offset === range.start) {
    start = utf16Offset;
  }
  if (utf8Offset === range.end) {
    end = utf16Offset;
  }
  if (start < 0 || end < start) {
    return undefined;
  }
  return value.slice(start, end);
}
