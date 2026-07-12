import { describe, expect, test } from "vitest";

import { transcriptSearchMatches } from "./chat-transcript-search";

describe("transcript search", () => {
  test("matches transcript-visible text case-insensitively", () => {
    const matches = transcriptSearchMatches(
      [
        { id: "message_user", text: "Find this" },
        undefined,
        { id: "block_assistant", text: "also find this" },
        { id: "block_quiet", text: "nothing here" },
      ],
      " FIND ",
    );

    expect(matches.map((match) => match.id)).toEqual(["message_user", "block_assistant"]);
  });

  test("returns no matches for an empty query", () => {
    expect(transcriptSearchMatches([{ id: "a", text: "anything" }], "   ")).toEqual([]);
  });
});
