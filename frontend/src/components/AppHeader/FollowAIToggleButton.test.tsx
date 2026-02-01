import { renderToStaticMarkup } from "react-dom/server";
import { useAIFollow } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FollowAIToggleButton } from "./FollowAIToggleButton";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

describe("FollowAIToggleButton", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders enabled state styling when follow is active", () => {
    useAIFollow.setState({ enabled: true });
    syncStoreInitialState(useAIFollow);

    const markup = renderToStaticMarkup(<FollowAIToggleButton />);

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("text-blue-600");
  });

  it("renders muted styling when follow is inactive", () => {
    useAIFollow.setState({ enabled: false });
    syncStoreInitialState(useAIFollow);

    const markup = renderToStaticMarkup(<FollowAIToggleButton />);

    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("text-setta-600");
  });
});
