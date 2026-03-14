import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAIStore } from "./aiStores";

describe("AI store dictation mode persistence", () => {
  beforeEach(() => {
    resetProjectStores();
    useAIStore.persist.clearStorage();
  });

  afterEach(() => {
    resetProjectStores();
    useAIStore.persist.clearStorage();
  });

  it("persists project chat dictation mode in local storage", () => {
    useAIStore.setState({ projectChatDictationMode: "provider" });

    const persisted = useAIStore.persist
      .getOptions()
      .storage?.getItem("setta_ai_data");
    expect(persisted).not.toBeNull();
    const parsed = (
      typeof persisted === "string" ? JSON.parse(persisted) : persisted
    ) as {
      state?: { projectChatDictationMode?: string };
    };
    expect(parsed.state?.projectChatDictationMode).toBe("provider");
  });
});
