import { conversationRouteDecisionKindValues } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { directorRouteReceiptText, directorSubmitIntent } from "./director-view-submit";

describe("submitting to the current view", () => {
  /*
   * A user typing at a running workstream may mean "change what you are doing"
   * or "do this next", and the router chooses. A silent wrong guess is worse
   * than the old design's inability to guess at all, so every outcome the
   * router can reach has to be sayable — and say something different.
   */
  test("names every routing outcome distinctly", () => {
    const said = conversationRouteDecisionKindValues.map((kind) =>
      directorRouteReceiptText(kind, "Release notes"),
    );

    expect(new Set(said).size).toBe(conversationRouteDecisionKindValues.length);
    for (const sentence of said) {
      expect(sentence).toContain("Release notes");
      expect(sentence.trim()).not.toBe("");
    }
  });

  test("distinguishes steering a run from queueing behind it", () => {
    expect(directorRouteReceiptText("steer_parent_turn", "Voice capture")).toBe(
      "Steered “Voice capture”.",
    );
    expect(directorRouteReceiptText("queue_parent_turn", "Voice capture")).toBe(
      "Queued behind the run in “Voice capture”.",
    );
  });

  test("keeps the Director's own view on the intent it has always dispatched", () => {
    expect(directorSubmitIntent("start the release notes")).toEqual({
      cancelRun: null,
      createWorkstream: null,
      kind: "submit",
      moveSelection: null,
      resolveApproval: null,
      resolveResourceRequest: null,
      selectWorkstream: null,
      submit: { modality: "text", text: "start the release notes" },
    });
  });
});
