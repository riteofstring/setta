import { describe, expect, it, vi } from "vitest";

import {
  drawGpuRetainedContentDropzoneControl,
  getGpuRetainedContentDropzoneSecondaryText,
} from "./retainedContentDropzoneCanvas";
import { getGpuRetainedContentDropzoneAttachmentLayouts } from "./retainedContentDropzoneLayout";
import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";

describe("retained content dropzone canvas", () => {
  it("draws attachment summary text for stateful dropzone controls", () => {
    const ctx = createCanvasContextRecorder();
    const control = dropzoneControl({
      attachments: [
        {
          id: "artifact-a",
          kind: "file",
          name: "input.csv",
          sizeLabel: "2 KB",
        },
        { id: "text-a", kind: "text", name: "notes.txt", sizeLabel: null },
      ],
      canAttachMore: false,
      label: "2 attachments",
      remainingSlots: 0,
    });

    drawGpuRetainedContentDropzoneControl({
      control,
      ctx,
      rect: { height: 28, width: 220, x: 0, y: 0 },
      state: undefined,
    });

    expect(ctx.fillText).toHaveBeenCalledWith(
      "2 attachments",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.fillText).toHaveBeenCalledWith(
      "input.csv - 2 KB +1",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.fillText).toHaveBeenCalledWith(
      "input.csv",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(ctx.fillText).toHaveBeenCalledWith(
      "notes.txt",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(
      getGpuRetainedContentDropzoneAttachmentLayouts({
        control,
        rect: { height: 28, width: 220, x: 0, y: 0 },
      }),
    ).toEqual([
      {
        attachment: {
          id: "artifact-a",
          kind: "file",
          name: "input.csv",
          sizeLabel: "2 KB",
        },
        attachmentIndex: 0,
        deleteRect: { height: 12, width: 12, x: 139, y: 8 },
        rect: { height: 16, width: 52, x: 102, y: 6 },
      },
      {
        attachment: {
          id: "text-a",
          kind: "text",
          name: "notes.txt",
          sizeLabel: null,
        },
        attachmentIndex: 1,
        deleteRect: { height: 12, width: 12, x: 195, y: 8 },
        rect: { height: 16, width: 52, x: 158, y: 6 },
      },
    ]);
  });

  it("summarizes empty dropzone capacity for closed canvas displays", () => {
    expect(
      getGpuRetainedContentDropzoneSecondaryText(
        dropzoneControl({
          attachments: [],
          canAttachMore: true,
          label: "Drop a file here",
          remainingSlots: 2,
        }),
      ),
    ).toBe("2 slots left");
    expect(
      getGpuRetainedContentDropzoneSecondaryText(
        dropzoneControl({
          attachments: [],
          canAttachMore: false,
          label: "Drop a file here",
          remainingSlots: 0,
        }),
      ),
    ).toBe("Attachment limit reached");
  });
});

function dropzoneControl(
  overrides: Partial<
    Extract<GpuRetainedContentControlDescriptor, { kind: "dropzone" }>
  > = {},
): Extract<GpuRetainedContentControlDescriptor, { kind: "dropzone" }> {
  return {
    attachments: [],
    canAttachMore: true,
    defaultDisplayValue: "",
    displayValue: "",
    kind: "dropzone",
    label: "Drop a file here",
    maxAttachments: null,
    mode: "STATEFUL",
    placeholder: "Drop a file here",
    remainingSlots: null,
    rendererFamily: "dropzone",
    commitPolicy: "native-island",
    ...overrides,
  };
}

function createCanvasContextRecorder(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineCap: "butt",
    lineJoin: "miter",
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    roundRect: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
