/* @vitest-environment jsdom */

import { useReactFlow } from "forks/xyflow/core/store";
import initialReactFlowState from "forks/xyflow/core/store/initialState";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import Controls, { shouldShowWatchCodePortalControl } from "./Controls";

describe("shouldShowWatchCodePortalControl", () => {
  it("hides the Watch Code control in deployment mode", () => {
    expect(
      shouldShowWatchCodePortalControl({
        isDeploymentMode: true,
      }),
    ).toBe(false);
  });

  it("shows the Watch Code control outside deployment mode", () => {
    expect(
      shouldShowWatchCodePortalControl({
        isDeploymentMode: false,
      }),
    ).toBe(true);
  });
});

describe("Controls zoom buttons", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    useReactFlow.setState({
      ...initialReactFlowState,
      transform: [0, 0, 1],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
    useReactFlow.setState({ ...initialReactFlowState });
  });

  it("updates the zoom button disabled state as the viewport zoom crosses bounds", async () => {
    useSettings.setState((state) => ({
      gui: {
        ...state.gui,
        maxZoom: 2,
        minZoom: 0.5,
      },
    }));

    await act(async () => {
      root.render(createElement(Controls));
    });

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 2] });
    });

    const zoomInButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="zoom in"]',
    );
    const zoomOutButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="zoom out"]',
    );

    expect(zoomInButton?.disabled).toBe(true);
    expect(zoomOutButton?.disabled).toBe(false);

    await act(async () => {
      useReactFlow.setState({ transform: [0, 0, 0.5] });
    });

    expect(zoomInButton?.disabled).toBe(false);
    expect(zoomOutButton?.disabled).toBe(true);
  });

  it("updates the fit view button active styling when fitViewOnInit changes", async () => {
    await act(async () => {
      root.render(createElement(Controls));
    });

    const fitViewButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="fit view"]',
    );
    expect(fitViewButton?.className).toContain("text-setta-400");

    await act(async () => {
      useReactFlow.setState({ fitViewOnInit: true });
    });

    expect(fitViewButton?.className).toContain("bg-blue-500");
    expect(fitViewButton?.className).toContain("text-white");
  });
});
