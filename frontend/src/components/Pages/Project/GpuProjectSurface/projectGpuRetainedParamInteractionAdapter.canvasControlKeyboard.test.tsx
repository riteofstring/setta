/* @vitest-environment jsdom */

import { createGpuRetainedRowContentScene } from "gpuFlow/retainedContentScene";
import { act } from "react";
import { useTypeErrors } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  getRetainedControlHit,
  retainedContentInteractionHit,
  retainedContentTestScene,
} from "testUtils/projectGpuRetainedParamInteractionFixtures";
import {
  seedRotaryParamProjectState,
  seedSliderParamProjectState,
} from "testUtils/projectGpuRetainedParamInteractionParamFixtures.test.support";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callOpenAPIMock: vi.fn(async () => ({
    data: null,
    hasResponse: true,
    status: 200,
  })),
  paramInputActivationClick: vi.fn(),
  paramInputActivationMouseDown: vi.fn(),
  paramInputActivationPointerDown: vi.fn(),
  paramInputActivationPointerUp: vi.fn(),
  paramInputRenderMode: {
    current: "native-color-input" as
      | "button-role-div"
      | "combobox-input"
      | "explicit-button-role-target"
      | "explicit-switch-role-target"
      | "explicit-activation-target"
      | "mousedown-activation"
      | "native-color-input"
      | "plain-button"
      | "pointer-activation"
      | "switch-role-button"
      | "textarea"
      | "text-input"
      | "time-input",
  },
  paramInputProps: vi.fn(),
  requestAnimationFrameMock: vi.fn(),
  cancelAnimationFrameMock: vi.fn(),
  setParamEnteredValueMock: vi.fn((args: object) => ({
    args,
    route: "setParamEnteredValue",
  })),
}));

vi.mock("components/Params/ParamItems/ParamInput", async () => {
  const { createMockParamInput } = await import(
    "testUtils/projectGpuMockParamInput.test.support"
  );

  return { ParamInput: createMockParamInput(mocks) };
});

vi.mock("openapi/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openapi/http")>();
  return {
    ...actual,
    setParamEnteredValue: mocks.setParamEnteredValueMock,
  };
});

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: mocks.callOpenAPIMock,
  };
});

import {
  handleProjectGpuRetainedParamCanvasControlKeyDown,
  handleProjectGpuRetainedParamCanvasControlWheel,
} from "./projectGpuRetainedParamCanvasControlInput";

describe("project GPU retained param canvas control keyboard adjustments", () => {
  beforeEach(() => {
    resetProjectStores();
    mocks.requestAnimationFrameMock.mockImplementation(
      (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    );
    vi.stubGlobal("requestAnimationFrame", mocks.requestAnimationFrameMock);
    vi.stubGlobal("cancelAnimationFrame", mocks.cancelAnimationFrameMock);
    mocks.callOpenAPIMock.mockReset();
    mocks.callOpenAPIMock.mockImplementation(async () => ({
      data: null,
      hasResponse: true,
      status: 200,
    }));
    mocks.paramInputProps.mockClear();
    mocks.paramInputActivationClick.mockClear();
    mocks.paramInputActivationMouseDown.mockClear();
    mocks.paramInputActivationPointerDown.mockClear();
    mocks.paramInputActivationPointerUp.mockClear();
    mocks.paramInputRenderMode.current = "native-color-input";
    mocks.requestAnimationFrameMock.mockClear();
    mocks.cancelAnimationFrameMock.mockClear();
    mocks.setParamEnteredValueMock.mockClear();
    useTypeErrors.setState({ errors: {}, userRequested: false });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    resetProjectStores();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("commits retained ranged control keyboard adjustments from canvas", async () => {
    seedSliderParamProjectState("4");
    vi.useFakeTimers();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "4",
            kind: "slider",
            rendererFamily: "slider",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 4,
          },
          controlKind: "slider",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = getRetainedControlHit(retainedScene);

    try {
      expect(
        handleProjectGpuRetainedParamCanvasControlKeyDown({
          activeParamCanvasControl: {
            hitRecordId: controlHit.id,
            paramInfoId: "param-1",
            sectionId: "section-1",
            surfaceId: "section-1:param-content:unpinned",
          },
          event: { code: "ArrowRight", key: "ArrowRight" },
          scene: retainedContentTestScene(retainedScene),
        }),
      ).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.paramInputProps).not.toHaveBeenCalled();
      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: "5",
        },
      });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  it("commits retained ranged control wheel adjustments from canvas", async () => {
    seedRotaryParamProjectState("5");
    vi.useFakeTimers();
    const onActiveParamCanvasControlChange = vi.fn();
    const retainedScene = createGpuRetainedRowContentScene({
      controlWidth: 112,
      id: "section-1:param-content:unpinned",
      ownerSectionId: "section-1",
      rowHeight: 28,
      rows: [
        {
          control: {
            defaultDisplayValue: "0",
            displayValue: "5",
            kind: "rotary",
            rendererFamily: "rotary",
            commitPolicy: "preview-commit",
            max: 10,
            min: 0,
            step: 1,
            value: 5,
          },
          controlKind: "rotary",
          depth: 0,
          id: "param-1",
          label: "Param 1",
        },
      ],
      scrollOffset: { x: 0, y: 0 },
      viewportRect: { height: 28, width: 180, x: 0, y: 0 },
    });
    const controlHit = getRetainedControlHit(retainedScene);

    try {
      expect(
        handleProjectGpuRetainedParamCanvasControlWheel({
          event: { deltaX: 0, deltaY: -40 },
          hit: retainedContentInteractionHit(retainedScene, controlHit),
          onActiveParamCanvasControlChange,
        }),
      ).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });

      expect(mocks.paramInputProps).not.toHaveBeenCalled();
      expect(onActiveParamCanvasControlChange).toHaveBeenCalledWith({
        hitRecordId: controlHit.id,
        paramInfoId: "param-1",
        sectionId: "section-1",
        surfaceId: "section-1:param-content:unpinned",
      });
      expect(mocks.setParamEnteredValueMock).toHaveBeenCalledWith({
        body: {
          frontendOpId: expect.any(String),
          paramInfoId: "param-1",
          projectConfigId: "project-1",
          sectionId: "section-1",
          sectionVariantId: "section-1-variant",
          value: "6",
        },
      });
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
