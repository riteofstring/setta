import { Buffer } from "node:buffer";

const canonicalBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function isCanonicalWAVBase64(value: string): boolean {
  if (value === "" || value.trim() !== value || !canonicalBase64Pattern.test(value)) {
    return false;
  }
  const audio = Buffer.from(value, "base64");
  return audio.toString("base64") === value && isWAV(audio);
}

function isWAV(audio: Buffer): boolean {
  return hasWAVHeader(audio) && hasDeclaredWAVLength(audio) && hasRequiredWAVChunks(audio);
}

function hasWAVHeader(audio: Buffer): boolean {
  return (
    audio.length >= 12 &&
    audio.toString("ascii", 0, 4) === "RIFF" &&
    audio.toString("ascii", 8, 12) === "WAVE"
  );
}

function hasDeclaredWAVLength(audio: Buffer): boolean {
  const declaredLength = audio.readUInt32LE(4) + 8;
  return declaredLength === audio.length;
}

function hasRequiredWAVChunks(audio: Buffer): boolean {
  let foundFormat = false;
  let foundAudio = false;
  for (let offset = 12; offset < audio.length; ) {
    const chunk = readWAVChunk(audio, offset);
    if (chunk === null) {
      return false;
    }
    foundFormat ||= chunk.type === "fmt " && chunk.length >= 16;
    foundAudio ||= chunk.type === "data" && chunk.length > 0;
    offset = chunk.nextOffset;
  }
  return foundFormat && foundAudio;
}

function readWAVChunk(
  audio: Buffer,
  offset: number,
): { length: number; nextOffset: number; type: string } | null {
  if (audio.length - offset < 8) {
    return null;
  }
  const type = audio.toString("ascii", offset, offset + 4);
  const length = audio.readUInt32LE(offset + 4);
  const start = offset + 8;
  const end = start + length;
  if (end < start || end > audio.length) {
    return null;
  }
  const nextOffset = nextWAVChunkOffset(audio, end, length);
  return nextOffset === null ? null : { length, nextOffset, type };
}

function nextWAVChunkOffset(audio: Buffer, end: number, length: number): number | null {
  if (length % 2 === 0) {
    return end;
  }
  return end < audio.length ? end + 1 : null;
}
