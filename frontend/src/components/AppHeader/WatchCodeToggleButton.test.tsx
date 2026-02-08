import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WatchCodeToggleButton } from "./WatchCodeToggleButton";

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

function setProjectConfig(watchCodeEnabled: boolean) {
  const projectConfig = createProjectConfig({
    id: "project-1",
    watchCodeEnabled,
  });
  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
  });
  syncStoreInitialState(useProjectState);
}

describe("WatchCodeToggleButton", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    syncStoreInitialState(useShareSession);
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders the disabled state with hover styling", () => {
    setProjectConfig(false);

    const markup = renderToStaticMarkup(<WatchCodeToggleButton />);

    expect(markup).toContain("Disabled");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("rounded-md");
    expect(markup).toContain("hover:bg-setta-50");
  });

  it("renders the enabled state with hover styling", () => {
    setProjectConfig(true);

    const markup = renderToStaticMarkup(<WatchCodeToggleButton />);

    expect(markup).toContain("Enabled");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("hover:bg-blue-100");
  });
});
