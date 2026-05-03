/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import {
  CodeObjTypeEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  DropzoneModeEnum,
  TextParamInputUITypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: {
    sectionImpl: {
      configLanguage: "python",
      isFrozen: false,
    },
    codeObjImpl: {
      type: "TextParam",
      defaultVal: "",
    } as Record<string, unknown>,
    isSelectingParams: false,
    isDeploymentMode: false,
    canEditParams: true,
    waitingForResult: false,
  },
  textInputProps: vi.fn(),
  dateTimeProps: vi.fn(),
  sliderProps: vi.fn(),
  rotaryProps: vi.fn(),
  switchProps: vi.fn(),
  colorPickerProps: vi.fn(),
  dropdownProps: vi.fn(),
  dropzoneProps: vi.fn(),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImplWithTypeGuardIfPresent: () =>
    mocks.state.sectionImpl,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent: () =>
    mocks.state.codeObjImpl,
}));

vi.mock("state/definitions", () => ({
  useMisc: (selector: (state: { isSelectingParams: boolean }) => unknown) =>
    selector({ isSelectingParams: mocks.state.isSelectingParams }),
  useProjectState: (selector: (state: object) => unknown) => selector({}),
  useShareSession: (
    selector: (state: { isDeploymentMode: boolean }) => unknown,
  ) => selector({ isDeploymentMode: mocks.state.isDeploymentMode }),
}));

vi.mock("state/hooks/lsp", () => ({
  useTextFieldWaitingForLSPResult: () => mocks.state.waitingForResult,
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({ canEditParams: mocks.state.canEditParams }),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    shouldShowPasswordReveal: ({ hasSecret }: { hasSecret: boolean }) =>
      hasSecret,
  };
});

vi.mock("components/Utils/CodeMirror/TextInputCodeMirror", () => ({
  TextInputCodeMirror: (props: {
    defaultVal: string;
    isDisabled: boolean;
    language: string;
    tooltipParentDivId?: string | null;
  }) => {
    mocks.textInputProps(props);
    return (
      <div
        data-testid="text-input"
        data-default-val={props.defaultVal}
        data-disabled={String(props.isDisabled)}
        data-language={props.language}
        data-tooltip-parent={props.tooltipParentDivId ?? ""}
      />
    );
  },
}));

vi.mock("./ConfiguredParamInputs", () => ({
  ConfiguredColorPickerInput: (props: { isDisabled: boolean }) => {
    mocks.colorPickerProps(props);
    return (
      <div
        data-testid="color-picker-input"
        data-disabled={String(props.isDisabled)}
      />
    );
  },
  ConfiguredDropdownInput: (props: { isDisabled: boolean }) => {
    mocks.dropdownProps(props);
    return (
      <div
        data-testid="dropdown-input"
        data-disabled={String(props.isDisabled)}
      />
    );
  },
  ConfiguredRotaryInput: (props: {
    isDisabled: boolean;
    onChange: (value: number) => void;
    onCommit?: (value: number) => void;
  }) => {
    mocks.rotaryProps(props);
    return (
      <div
        data-testid="rotary-input"
        data-disabled={String(props.isDisabled)}
      />
    );
  },
  ConfiguredSliderInput: (props: {
    isDisabled: boolean;
    onChange: (value: number) => void;
    onCommit?: (value: number) => void;
  }) => {
    mocks.sliderProps(props);
    return (
      <div
        data-testid="slider-input"
        data-disabled={String(props.isDisabled)}
      />
    );
  },
}));

vi.mock("./DropzoneInput", () => ({
  DropzoneInput: (props: {
    isDisabled: boolean;
    maxAttachments: number | null;
    mode: string;
    placeholder?: string;
  }) => {
    mocks.dropzoneProps(props);
    return (
      <div
        data-testid="dropzone-input"
        data-disabled={String(props.isDisabled)}
        data-max-attachments={
          props.maxAttachments === null ? "" : String(props.maxAttachments)
        }
        data-mode={props.mode}
        data-placeholder={props.placeholder ?? ""}
      />
    );
  },
  DropzoneInputConfigForParam: () => null,
}));

vi.mock("./PasswordInput", () => ({
  PasswordInput: (props: { isDisabled: boolean; placeholder?: string }) => (
    <input
      data-testid="password-input"
      disabled={props.isDisabled}
      placeholder={props.placeholder}
    />
  ),
}));

vi.mock("./SwitchInput", () => ({
  SwitchInput: (props: { isDisabled: boolean }) => {
    mocks.switchProps(props);
    return (
      <div
        data-testid="switch-input"
        data-disabled={String(props.isDisabled)}
      />
    );
  },
}));

vi.mock("./TextParamInput", () => ({
  DateParamInputConfigForParam: () => null,
  TextParamDateTimeInput: (props: {
    dateCalendarWeekStart: string;
    dateControlMode: string;
    dateDisplayFormat: string;
    dateIncludesTime: boolean;
    dateSelectionMode: string;
    isDisabled: boolean;
    uiType: string;
  }) => {
    mocks.dateTimeProps(props);
    return (
      <div
        data-testid="date-time-input"
        data-date-calendar-week-start={props.dateCalendarWeekStart}
        data-date-control-mode={props.dateControlMode}
        data-date-display-format={props.dateDisplayFormat}
        data-date-includes-time={String(props.dateIncludesTime)}
        data-date-selection-mode={props.dateSelectionMode}
        data-disabled={String(props.isDisabled)}
        data-ui-type={props.uiType}
      />
    );
  },
  TimeParamInputConfigForParam: () => null,
}));

vi.mock("./ButtonInput", () => ({
  ButtonInputConfigForParam: () => null,
}));

vi.mock("./ColorPickerInput", () => ({
  ColorPickerInputConfigForParam: () => null,
}));

vi.mock("./DropdownInput", () => ({
  DropdownInputConfigForParam: () => null,
}));

vi.mock("./SliderInput", () => ({
  SliderInputConfigForParam: () => null,
}));

import { ParamUI } from "./ParamUI";

type RenderedParamUI = {
  host: HTMLDivElement;
  root: Root;
};

async function renderParamUI(
  props: Partial<ComponentProps<typeof ParamUI>> = {},
): Promise<RenderedParamUI> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <ParamUI
        sectionId="section-1"
        paramInfoId="param-1"
        value=""
        onChange={() => undefined}
        {...props}
      />,
    );
  });

  return { host, root };
}

async function cleanupRenderedParamUI(rendered: RenderedParamUI) {
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

describe("ParamUI", () => {
  beforeEach(() => {
    mocks.state.sectionImpl = {
      configLanguage: "python",
      isFrozen: false,
    };
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };
    mocks.state.isSelectingParams = false;
    mocks.state.isDeploymentMode = false;
    mocks.state.canEditParams = true;
    mocks.state.waitingForResult = false;
    mocks.textInputProps.mockReset();
    mocks.dateTimeProps.mockReset();
    mocks.sliderProps.mockReset();
    mocks.rotaryProps.mockReset();
    mocks.switchProps.mockReset();
    mocks.colorPickerProps.mockReset();
    mocks.dropdownProps.mockReset();
    mocks.dropzoneProps.mockReset();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders code params through the text input path and disables them in deployment mode", async () => {
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.CodeParam,
      defaultVal: "print('hello')",
    };
    mocks.state.isDeploymentMode = true;

    const rendered = await renderParamUI({ value: "print('value')" });

    try {
      const textInput = rendered.host.querySelector(
        '[data-testid="text-input"]',
      );
      expect(textInput?.getAttribute("data-language")).toBe("python");
      expect(textInput?.getAttribute("data-default-val")).toBe(
        "print('hello')",
      );
      expect(textInput?.getAttribute("data-disabled")).toBe("true");
      expect(textInput?.getAttribute("data-tooltip-parent")).toBe(
        CODEMIRROR_TOOLTIP_PARENT_ID,
      );
      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupRenderedParamUI(rendered);
    }
  });

  it("forwards a retained CodeMirror tooltip parent override to text inputs", async () => {
    const rendered = await renderParamUI({
      tooltipParentDivId: "retained-codemirror-tooltips",
    });

    try {
      const textInput = rendered.host.querySelector(
        '[data-testid="text-input"]',
      );
      expect(textInput?.getAttribute("data-tooltip-parent")).toBe(
        "retained-codemirror-tooltips",
      );
      expect(mocks.textInputProps).toHaveBeenCalledWith(
        expect.objectContaining({
          tooltipParentDivId: "retained-codemirror-tooltips",
        }),
      );
    } finally {
      await cleanupRenderedParamUI(rendered);
    }
  });

  it("forwards date param settings to the date-time input", async () => {
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.DateParam,
      defaultVal: "",
      dateDisplayFormat: DateDisplayFormatEnum.us,
      dateControlMode: DateControlModeEnum.calendar,
      dateSelectionMode: DateSelectionModeEnum.multiple,
      dateCalendarWeekStart: DateCalendarWeekStartEnum.monday,
      dateIncludesTime: true,
    };

    const rendered = await renderParamUI({ value: "2026-12-31T09:30" });

    try {
      const dateTimeInput = rendered.host.querySelector(
        '[data-testid="date-time-input"]',
      );
      expect(dateTimeInput?.getAttribute("data-ui-type")).toBe(
        TextParamInputUITypeEnum.date,
      );
      expect(dateTimeInput?.getAttribute("data-date-display-format")).toBe(
        DateDisplayFormatEnum.us,
      );
      expect(dateTimeInput?.getAttribute("data-date-control-mode")).toBe(
        DateControlModeEnum.calendar,
      );
      expect(dateTimeInput?.getAttribute("data-date-selection-mode")).toBe(
        DateSelectionModeEnum.multiple,
      );
      expect(dateTimeInput?.getAttribute("data-date-calendar-week-start")).toBe(
        DateCalendarWeekStartEnum.monday,
      );
      expect(dateTimeInput?.getAttribute("data-date-includes-time")).toBe(
        "true",
      );
    } finally {
      await cleanupRenderedParamUI(rendered);
    }
  });

  it("shows the reveal action and saved placeholder for password params with a stored secret", async () => {
    const onRevealPassword = vi.fn();
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.PasswordParam,
      defaultVal: "",
      hasSecret: true,
    };

    const rendered = await renderParamUI({
      onRevealPassword,
      value: "",
    });

    try {
      const passwordInput = rendered.host.querySelector(
        '[data-testid="password-input"]',
      ) as HTMLInputElement | null;
      const revealButton = rendered.host.querySelector(
        'button[title="Reveal saved password"]',
      ) as HTMLButtonElement | null;
      expect(passwordInput?.placeholder).toBe("Saved");
      expect(revealButton?.textContent).toBe("Reveal");

      revealButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(onRevealPassword).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupRenderedParamUI(rendered);
    }
  });

  it("forwards dropzone settings to the dropzone input", async () => {
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.DropzoneParam,
      defaultVal: "",
      mode: DropzoneModeEnum.STATELESS,
      maxAttachments: 3,
      placeholder: "Drop files here",
    };

    const rendered = await renderParamUI();

    try {
      const dropzoneInput = rendered.host.querySelector(
        '[data-testid="dropzone-input"]',
      );
      expect(dropzoneInput?.getAttribute("data-mode")).toBe(
        DropzoneModeEnum.STATELESS,
      );
      expect(dropzoneInput?.getAttribute("data-max-attachments")).toBe("3");
      expect(dropzoneInput?.getAttribute("data-placeholder")).toBe(
        "Drop files here",
      );
      expect(dropzoneInput?.getAttribute("data-disabled")).toBe("false");
    } finally {
      await cleanupRenderedParamUI(rendered);
    }
  });

  it("keeps slider live updates out of the backend commit path", async () => {
    const onChange = vi.fn();
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.SliderParam,
      defaultVal: "0",
    };

    const rendered = await renderParamUI({ onChange, value: "1" });

    try {
      const sliderProps = mocks.sliderProps.mock.calls[0]?.[0] as
        | {
            onChange: (value: number) => void;
            onCommit?: (value: number) => void;
          }
        | undefined;
      expect(sliderProps).toBeDefined();

      sliderProps?.onChange(4);
      sliderProps?.onCommit?.(6);

      expect(onChange.mock.calls).toEqual([
        [4, { skipBackendUpdate: true }],
        [6],
      ]);
    } finally {
      await cleanupRenderedParamUI(rendered);
    }
  });

  it("keeps rotary live updates out of the backend commit path", async () => {
    const onChange = vi.fn();
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.RotaryParam,
      defaultVal: "0",
    };

    const rendered = await renderParamUI({ onChange, value: "1" });

    try {
      const rotaryProps = mocks.rotaryProps.mock.calls[0]?.[0] as
        | {
            onChange: (value: number) => void;
            onCommit?: (value: number) => void;
          }
        | undefined;
      expect(rotaryProps).toBeDefined();

      rotaryProps?.onChange(2);
      rotaryProps?.onCommit?.(8);

      expect(onChange.mock.calls).toEqual([
        [2, { skipBackendUpdate: true }],
        [8],
      ]);
    } finally {
      await cleanupRenderedParamUI(rendered);
    }
  });
});
