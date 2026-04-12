import { TranscriptionTransportModeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveTranscriptionChunkMsForSave } from "./ProjectAISettings";

describe("resolveTranscriptionChunkMsForSave", () => {
  it("uses canonical chunk size for file mode even when draft chunk is invalid", () => {
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionTransportModeEnum.file,
        chunkMsInput: "bad-value",
      }),
    ).toBe(1200);
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionTransportModeEnum.file,
        chunkMsInput: "50",
      }),
    ).toBe(1200);
  });

  it("accepts valid chunk values for non-file transport modes", () => {
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionTransportModeEnum.realtime,
        chunkMsInput: "300",
      }),
    ).toBe(300);
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionTransportModeEnum.auto,
        chunkMsInput: "10000",
      }),
    ).toBe(10000);
  });

  it("rejects invalid chunk values for non-file transport modes", () => {
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionTransportModeEnum.realtime,
        chunkMsInput: "199",
      }),
    ).toBeNull();
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionTransportModeEnum.auto,
        chunkMsInput: "10001",
      }),
    ).toBeNull();
    expect(
      resolveTranscriptionChunkMsForSave({
        transportMode: TranscriptionTransportModeEnum.auto,
        chunkMsInput: "abc",
      }),
    ).toBeNull();
  });
});
