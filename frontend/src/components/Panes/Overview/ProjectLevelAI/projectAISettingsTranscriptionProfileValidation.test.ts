import { TranscriptionProfileUIConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveTranscriptionChunkMsForSave } from "./projectAISettingsTranscriptionProfiles";

describe("resolveTranscriptionChunkMsForSave", () => {
  it("uses canonical chunk size for file mode even when draft chunk is invalid", () => {
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionProfileUIConfig.transportModes.file,
        chunkMsInput: "bad-value",
      }),
    ).toBe(TranscriptionProfileUIConfig.defaultChunkMs);
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionProfileUIConfig.transportModes.file,
        chunkMsInput: "50",
      }),
    ).toBe(TranscriptionProfileUIConfig.defaultChunkMs);
  });

  it("accepts valid chunk values for non-file transport modes", () => {
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionProfileUIConfig.transportModes.realtime,
        chunkMsInput: String(TranscriptionProfileUIConfig.minChunkMs),
      }),
    ).toBe(TranscriptionProfileUIConfig.minChunkMs);
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionProfileUIConfig.transportModes.auto,
        chunkMsInput: String(TranscriptionProfileUIConfig.maxChunkMs),
      }),
    ).toBe(TranscriptionProfileUIConfig.maxChunkMs);
  });

  it("rejects invalid chunk values for non-file transport modes", () => {
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionProfileUIConfig.transportModes.realtime,
        chunkMsInput: String(TranscriptionProfileUIConfig.minChunkMs - 1),
      }),
    ).toBeNull();
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionProfileUIConfig.transportModes.auto,
        chunkMsInput: String(TranscriptionProfileUIConfig.maxChunkMs + 1),
      }),
    ).toBeNull();
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionProfileUIConfig.transportModes.auto,
        chunkMsInput: "abc",
      }),
    ).toBeNull();
  });
});
