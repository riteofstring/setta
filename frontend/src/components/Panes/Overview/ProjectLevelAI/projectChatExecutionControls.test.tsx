/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { EngineTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveProjectChatExecutionControlVisibility,
  resolveProjectChatPermissionModeForEngine,
  useProjectChatExecutionControls,
} from "./projectChatExecutionControls";

function ExecutionControlsHarness({
  engineType,
  engineConfigId,
  isExternalEngine,
  externalEngineAvailable,
  hasLLMConfig,
  onPermissionModeChange,
}: {
  engineType: EngineTypeEnum | null;
  engineConfigId: string | null;
  isExternalEngine: boolean;
  externalEngineAvailable: boolean;
  hasLLMConfig: boolean;
  onPermissionModeChange?: (nextPermissionMode: string) => void;
}) {
  const {
    executionSettings,
    executionControlHandlers,
    showPermissionExecutionControl,
    showSearchExecutionControl,
  } = useProjectChatExecutionControls({
    engineType,
    engineConfigId,
    isExternalEngine,
    externalEngineAvailable,
    hasLLMConfig,
    onPermissionModeChange,
  });

  return (
    <div
      data-testid="execution-controls"
      data-permission-mode={executionSettings.permissionMode}
      data-search-enabled={String(executionSettings.searchEnabled)}
      data-show-permission={String(showPermissionExecutionControl)}
      data-show-search={String(showSearchExecutionControl)}
    >
      <button
        type="button"
        onClick={() => executionControlHandlers.onPermissionModeChange("yolo")}
      >
        Set YOLO
      </button>
      <button
        type="button"
        onClick={() => executionControlHandlers.onSearchEnabledChange(false)}
      >
        Disable Search
      </button>
    </div>
  );
}

describe("projectChatExecutionControls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("normalizes permission mode when the engine ownership changes", () => {
    expect(
      resolveProjectChatPermissionModeForEngine({
        currentPermissionMode: "minimal",
        isExternalEngine: true,
      }),
    ).toBe("config_toml_custom");
    expect(
      resolveProjectChatPermissionModeForEngine({
        currentPermissionMode: "config_toml_custom",
        isExternalEngine: false,
      }),
    ).toBe("minimal");
    expect(
      resolveProjectChatPermissionModeForEngine({
        currentPermissionMode: "yolo",
        isExternalEngine: false,
      }),
    ).toBe("yolo");
  });

  it("only exposes execution controls when the active engine can honor them", () => {
    expect(
      resolveProjectChatExecutionControlVisibility({
        engineConfigId: "engine-1",
        isExternalEngine: false,
        externalEngineAvailable: true,
        hasLLMConfig: true,
      }),
    ).toEqual({
      canConfigureExecutionSettings: true,
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
    });
    expect(
      resolveProjectChatExecutionControlVisibility({
        engineConfigId: "engine-1",
        isExternalEngine: true,
        externalEngineAvailable: false,
        hasLLMConfig: true,
      }),
    ).toEqual({
      canConfigureExecutionSettings: false,
      showPermissionExecutionControl: false,
      showSearchExecutionControl: false,
    });
  });

  it("syncs permission mode and preserves search state across engine transitions", () => {
    const permissionModeChanges = vi.fn();

    act(() => {
      root.render(
        <ExecutionControlsHarness
          engineType={EngineTypeEnum.setta_llm}
          engineConfigId="engine-1"
          isExternalEngine={false}
          externalEngineAvailable={true}
          hasLLMConfig={true}
          onPermissionModeChange={permissionModeChanges}
        />,
      );
    });

    const controls = container.querySelector(
      '[data-testid="execution-controls"]',
    ) as HTMLDivElement;
    const buttons = Array.from(container.querySelectorAll("button"));

    expect(controls.dataset.permissionMode).toBe("minimal");
    expect(controls.dataset.searchEnabled).toBe("true");
    expect(permissionModeChanges).toHaveBeenLastCalledWith("minimal");

    act(() => {
      buttons[1]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(controls.dataset.searchEnabled).toBe("false");

    act(() => {
      root.render(
        <ExecutionControlsHarness
          engineType={EngineTypeEnum.external_agent}
          engineConfigId="engine-1"
          isExternalEngine={true}
          externalEngineAvailable={true}
          hasLLMConfig={true}
          onPermissionModeChange={permissionModeChanges}
        />,
      );
    });

    expect(controls.dataset.permissionMode).toBe("config_toml_custom");
    expect(controls.dataset.searchEnabled).toBe("false");
    expect(permissionModeChanges).toHaveBeenLastCalledWith(
      "config_toml_custom",
    );
  });
});
