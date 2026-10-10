import { describe, expect, it } from "vitest";
import { readDisplayOutput } from "./displayOutput";

const note = {
  id: "notes",
  kind: "markdown",
  title: "Notes",
  caption: "",
  text: "A useful result",
};
const frame = (panels: unknown[]) =>
  `SETTA_DISPLAY ${JSON.stringify({ version: 1, panels })}`;

describe("Python visual output", () => {
  it("keeps valid panels and ordinary logs when another panel is malformed", () => {
    const result = readDisplayOutput(
      `starting\n${frame([
        note,
        {
          id: "image",
          kind: "image",
          title: "Map",
          caption: "",
          image: "https://example.com/tracker.png",
        },
        {
          id: "table",
          kind: "table",
          title: "Scores",
          caption: "",
          columns: ["Name", "Score"],
          rows: [
            ["Scout", 12],
            ["Hauler", 9],
          ],
        },
      ])}\nfinished`,
    );
    expect(result.panels.map((panel) => panel.id)).toEqual(["notes", "table"]);
    expect(result.log).toBe("starting\nfinished");
    expect(result.warnings).toHaveLength(1);
  });

  it("rejects ambiguous names, mismatched rows, and non-image content without losing a good panel", () => {
    const result = readDisplayOutput(
      frame([
        { ...note, id: "__proto__" },
        {
          ...note,
          id: "table",
          kind: "table",
          columns: ["One"],
          rows: [[1, 2]],
        },
        {
          id: "image",
          kind: "image",
          title: "Unsafe",
          caption: "",
          image: "data:text/html;base64,PHNjcmlwdD4=",
        },
        note,
        note,
      ]),
    );
    expect(result.panels).toEqual([note]);
    expect(result.warnings).toHaveLength(4);
  });

  it("uses the final complete display frame and explains missing results", () => {
    expect(
      readDisplayOutput(
        `${frame([note])}\n${frame([{ ...note, text: "Updated" }])}`,
      ).panels[0],
    ).toMatchObject({ text: "Updated" });
    expect(() =>
      readDisplayOutput("Try adjusting the recipe: invalid color"),
    ).toThrow("without visual results");
    expect(() => readDisplayOutput(frame([]))).toThrow("previous results");
  });
});
