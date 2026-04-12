/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const respondExternalAgentQuestionMock = vi.fn();

vi.mock("state/actions/ai", () => ({
  respondExternalAgentQuestion: (...args: unknown[]) =>
    respondExternalAgentQuestionMock(...args),
}));

import { buildQuestionKey, OTHER_OPTION_VALUE } from "./questionCardModel";
import { useQuestionCardState } from "./questionCardState";

type HarnessProps = {
  resolvedAnswers?: Record<string, string> | null;
};

type QuestionCardStateSnapshot = ReturnType<typeof useQuestionCardState>;

const questions = [
  {
    header: "Color",
    question: "Pick a color",
    multiSelect: false,
    options: [{ label: "Blue" }, { label: "Other" }],
  },
  {
    header: "Tags",
    question: "Pick tags",
    multiSelect: true,
    options: [{ label: "Fast" }, { label: "Reliable" }, { label: "Other" }],
  },
];

let latestState: QuestionCardStateSnapshot | null = null;

function Harness({ resolvedAnswers = null }: HarnessProps) {
  latestState = useQuestionCardState({
    toolCallId: "question-card-1",
    questions,
    resolvedAnswers,
  });
  return null;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useQuestionCardState", () => {
  let host: HTMLDivElement;
  let root: Root;

  async function renderHarness(props: HarnessProps = {}) {
    await act(async () => {
      root.render(<Harness {...props} />);
    });
  }

  function getState(): QuestionCardStateSnapshot {
    if (!latestState) {
      throw new Error("Expected question card state.");
    }
    return latestState;
  }

  beforeEach(() => {
    latestState = null;
    respondExternalAgentQuestionMock.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
  });

  it("syncs resolved answers into selections and summary navigation", async () => {
    await renderHarness();

    expect(getState().answered).toBe(false);
    expect(getState().activeIndex).toBe(0);
    expect(getState().lastTabIndex).toBe(2);

    await renderHarness({
      resolvedAnswers: {
        "Pick a color": "Magenta",
        "Pick tags": "Fast, Custom",
      },
    });

    expect(getState().answered).toBe(true);
    expect(getState().activeIndex).toBe(2);
    expect(getState().displayedAnswers).toEqual({
      "Pick a color": "Magenta",
      "Pick tags": "Fast, Custom",
    });
    expect(getState().selections).toEqual({
      [buildQuestionKey(0)]: [OTHER_OPTION_VALUE],
      [buildQuestionKey(1)]: ["Fast", OTHER_OPTION_VALUE],
    });
    expect(getState().otherValues).toEqual({
      [buildQuestionKey(0)]: "Magenta",
      [buildQuestionKey(1)]: "Custom",
    });
  });

  it("submits answers and marks the card answered after a successful response", async () => {
    respondExternalAgentQuestionMock.mockResolvedValue(true);

    await renderHarness();

    await act(async () => {
      getState().handleToggle(questions[0], buildQuestionKey(0), {
        value: "Blue",
        label: "Blue",
        isOther: false,
      });
      getState().handleToggle(questions[1], buildQuestionKey(1), {
        value: "Reliable",
        label: "Reliable",
        isOther: false,
      });
    });

    expect(getState().canSubmit).toBe(true);

    await act(async () => {
      await getState().handleSubmit();
    });
    await flushMicrotasks();

    expect(respondExternalAgentQuestionMock).toHaveBeenCalledWith(
      "question-card-1",
      {
        "Pick a color": "Blue",
        "Pick tags": "Reliable",
      },
    );
    expect(getState().answered).toBe(true);
    expect(getState().activeIndex).toBe(2);
    expect(getState().displayedAnswers).toEqual({
      "Pick a color": "Blue",
      "Pick tags": "Reliable",
    });
    expect(getState().pending).toBe(false);
    expect(getState().error).toBeNull();
  });

  it("reports backend submission failures without recording submitted answers", async () => {
    respondExternalAgentQuestionMock.mockResolvedValue(false);

    await renderHarness();

    await act(async () => {
      getState().handleToggle(questions[0], buildQuestionKey(0), {
        value: "Blue",
        label: "Blue",
        isOther: false,
      });
      getState().handleToggle(questions[1], buildQuestionKey(1), {
        value: "Reliable",
        label: "Reliable",
        isOther: false,
      });
    });

    expect(getState().canSubmit).toBe(true);

    await act(async () => {
      await getState().handleSubmit();
    });

    expect(getState().answered).toBe(false);
    expect(getState().displayedAnswers).toBeNull();
    expect(getState().error).toBe("Failed to send answers.");
    expect(getState().pending).toBe(false);
  });
});
