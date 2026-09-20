import { describe, expect, it } from "vitest";
import { appendPlaygroundWindowDiagnosticLine } from "./PlaygroundWindowInteractionDiagnostics";

describe("playground window interaction diagnostic retention", () => {
  it("retains every entry beyond the former 200-event boundary", () => {
    const lines: string[] = [];

    for (let sequence = 0; sequence < 205; sequence += 1) {
      appendPlaygroundWindowDiagnosticLine(
        lines,
        { event: "pointermove", sequence },
        "2026-08-28T20:00:00.000Z",
      );
    }

    expect(lines).toHaveLength(205);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ sequence: 0 });
    expect(JSON.parse(lines.at(-1) ?? "{}")).toMatchObject({ sequence: 204 });
  });
});
