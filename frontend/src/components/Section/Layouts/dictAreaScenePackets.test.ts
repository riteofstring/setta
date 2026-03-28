import { describe, expect, it } from "vitest";
import { buildBenchmarkDictAreaScenePacket } from "./dictAreaScenePackets";

describe("buildBenchmarkDictAreaScenePacket", () => {
  it("builds deterministic benchmark shell packets for the dict/param canary path", () => {
    // Preserve the first node-visual packet contract on the canary path:
    // the benchmark dict-area shell and static rows should come from typed packets.
    expect(
      buildBenchmarkDictAreaScenePacket({
        hideUnpinnedParams: false,
        inputPortCount: 2,
        outputPortCount: 1,
        pinnedRows: [
          {
            depth: 0,
            id: "group-a",
            isParent: true,
            label: "Pinned Group",
          },
          {
            depth: 1,
            id: "value-a",
            isParent: false,
            label: "Pinned Value",
          },
        ],
        unpinnedRows: [
          {
            depth: 0,
            id: "value-b",
            isParent: false,
            label: "Unpinned Value",
          },
        ],
      }),
    ).toEqual({
      edgeSummary: {
        inputPortCount: 2,
        outputPortCount: 1,
      },
      paramAreas: [
        {
          grow: false,
          id: "pinned",
          rowCount: 2,
          rows: [
            {
              depth: 0,
              id: "group-a",
              kind: "group",
              label: "Pinned Group",
            },
            {
              depth: 1,
              id: "value-a",
              kind: "value",
              label: "Pinned Value",
            },
          ],
          title: "Pinned Params",
        },
        {
          grow: true,
          id: "unpinned",
          rowCount: 1,
          rows: [
            {
              depth: 0,
              id: "value-b",
              kind: "value",
              label: "Unpinned Value",
            },
          ],
          title: "Params",
        },
      ],
    });
  });

  it("omits the unpinned packet area when the section hides unpinned params", () => {
    expect(
      buildBenchmarkDictAreaScenePacket({
        hideUnpinnedParams: true,
        inputPortCount: 0,
        outputPortCount: 0,
        pinnedRows: [],
        unpinnedRows: [
          {
            depth: 0,
            id: "value-a",
            isParent: false,
            label: "Ignored",
          },
        ],
      }).paramAreas,
    ).toEqual([
      {
        grow: false,
        id: "pinned",
        rowCount: 0,
        rows: [],
        title: "Pinned Params",
      },
    ]);
  });
});
