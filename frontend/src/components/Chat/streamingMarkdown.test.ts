import { describe, expect, it } from "vitest";
import {
  reconcileAnimatedStreamingCharacters,
  splitStreamingMarkdownText,
} from "./streamingMarkdown";

describe("streaming markdown helpers", () => {
  it("commits complete lines and keeps only the unfinished line in the animated tail", () => {
    const segments = splitStreamingMarkdownText(
      ["Intro", "", "## Core Purpose", "", "- Build apps", "Cur"].join("\n"),
    );

    expect(segments.committedMarkdown).toBe(
      ["Intro", "", "## Core Purpose", "", "- Build apps"].join("\n") + "\n",
    );
    expect(segments.activeTailText).toBe("Cur");
    expect(segments.committedLineCount).toBe(5);
  });

  it("keeps the whole value in the animated tail when no complete line exists yet", () => {
    const segments = splitStreamingMarkdownText("## Cor");

    expect(segments.committedMarkdown).toBe("");
    expect(segments.activeTailText).toBe("## Cor");
    expect(segments.committedLineCount).toBe(0);
  });

  it("animates only appended tail characters during append-only streaming", () => {
    const initial = reconcileAnimatedStreamingCharacters([], "Plan", 0);
    const next = reconcileAnimatedStreamingCharacters(
      initial.characters.map(({ id, value }) => ({
        id,
        value,
      })),
      "Plan more",
      initial.nextId,
    );

    expect(next.characters.map((character) => character.value).join("")).toBe(
      "Plan more",
    );
    expect(
      next.characters.slice(0, 4).every((character) => !character.animate),
    ).toBe(true);
    expect(
      next.characters.slice(4).every((character) => character.animate),
    ).toBe(true);
  });

  it("rebuilds without fade markers when the stream text is replaced", () => {
    const initial = reconcileAnimatedStreamingCharacters([], "Plan more", 0);
    const replacement = reconcileAnimatedStreamingCharacters(
      initial.characters.map(({ id, value }) => ({
        id,
        value,
      })),
      "Replaced",
      initial.nextId,
    );

    expect(
      replacement.characters.every((character) => !character.animate),
    ).toBe(true);
    expect(
      replacement.characters.map((character) => character.value).join(""),
    ).toBe("Replaced");
  });
});
