import {
  BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CANVAS_OWNED_SECTION_SHELL_ID,
  CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
  LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
  STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
  TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
} from "forks/xyflow/core/container/sectionShellCanvasOwnership";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeObjTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    graphSurfaceImplementation: "legacy-dom" as
      | "canvas-shell-underlay"
      | "legacy-dom",
  },
  dropdownProps: vi.fn(),
  colorPickerProps: vi.fn(),
  switchProps: vi.fn(),
  textInputProps: vi.fn(),
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

vi.mock("forks/xyflow/core/container/graphSurfaceImplementation", () => ({
  useGraphSurfaceImplementation: () => mocks.state.graphSurfaceImplementation,
}));

vi.mock("utils/paramValue", () => ({
  shouldShowPasswordReveal: () => false,
}));

vi.mock("components/Utils/CodeMirror/TextInputCodeMirror", () => ({
  TextInputCodeMirror: (props: {
    canvasOwnedUnderline?: boolean;
    canvasOwnedRestingText?: boolean;
    dummyCodeClassName: string;
    language: string;
  }) => {
    mocks.textInputProps(props);
    return (
      <div
        data-testid="text-input"
        data-language={props.language}
        data-canvas-owned-underline={
          props.canvasOwnedUnderline ? "true" : undefined
        }
      />
    );
  },
}));

vi.mock("./ButtonInput", () => ({
  ButtonInputConfigForParam: () => null,
}));

vi.mock("./ColorPickerInput", () => ({
  ColorPickerInputConfigForParam: () => null,
}));

vi.mock("./ConfiguredParamInputs", () => ({
  ConfiguredColorPickerInput: (props: {
    lightweightActivator?: boolean;
  }) => {
    mocks.colorPickerProps(props);
    return <div data-testid="color-picker-input" />;
  },
  ConfiguredDropdownInput: (props: {
    canvasOwnedRestingInput?: boolean;
  }) => {
    mocks.dropdownProps(props);
    return <div data-testid="dropdown-input" />;
  },
  ConfiguredRotaryInput: () => null,
  ConfiguredSliderInput: () => null,
}));

vi.mock("./DropdownInput", () => ({
  DropdownInputConfigForParam: () => null,
}));

vi.mock("./DropzoneInput", () => ({
  DropzoneInput: () => null,
  DropzoneInputConfigForParam: () => null,
}));

vi.mock("./PasswordInput", () => ({
  PasswordInput: () => null,
}));

vi.mock("./SliderInput", () => ({
  SliderInputConfigForParam: () => null,
}));

vi.mock("./SwitchInput", () => ({
  SwitchInput: (props: {
    canvasOwnedTrack?: boolean;
    lightweightActivator?: boolean;
    lightweightRootClassName?: string;
  }) => {
    mocks.switchProps(props);
    return <div data-testid="switch-input" />;
  },
}));

vi.mock("./TextParamInput", () => ({
  DateParamInputConfigForParam: () => null,
  TextParamDateTimeInput: () => null,
  TimeParamInputConfigForParam: () => null,
}));

import { ParamUI } from "./ParamUI";

describe("ParamUI canvas-owned resting text", () => {
  beforeEach(() => {
    mocks.state.sectionImpl = {
      configLanguage: "python",
      isFrozen: false,
    };
    mocks.state.codeObjImpl = {
      type: "TextParam",
      defaultVal: "",
    };
    mocks.state.isSelectingParams = false;
    mocks.state.isDeploymentMode = false;
    mocks.state.canEditParams = true;
    mocks.state.waitingForResult = false;
    mocks.state.graphSurfaceImplementation = "legacy-dom";
    mocks.dropdownProps.mockReset();
    mocks.colorPickerProps.mockReset();
    mocks.switchProps.mockReset();
    mocks.textInputProps.mockReset();
  });

  it.each([
    {
      codeObjType: CodeObjTypeEnum.CodeParam,
      paramInfoId:
        "settings-codeobj__callableSectionDefault__callableSectionDefault__configLanguage",
      value: "python",
    },
    {
      codeObjType: CodeObjTypeEnum.TextParam,
      paramInfoId:
        "settings-codeobj__callableSectionDefault__callableSectionDefault__styleColor",
      value: "null",
    },
    {
      codeObjType: CodeObjTypeEnum.TextAreaParam,
      paramInfoId:
        "settings-codeobj__callableSectionDefault__callableSectionDefault__edgeOutputPorts",
      value: "[]",
    },
  ])(
    "hides text-like canary resting text for $paramInfoId on the canvas path",
    ({ codeObjType, paramInfoId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: codeObjType,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={CANVAS_OWNED_SECTION_SHELL_ID}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it("does not hide non-text params or truly non-owned sections on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.SwitchParam,
      defaultVal: false,
    };

    renderToStaticMarkup(
      <ParamUI
        sectionId={CANVAS_OWNED_SECTION_SHELL_ID}
        paramInfoId="settings-codeobj__callableSectionDefault__callableSectionDefault__hideParams"
        value="false"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).not.toHaveBeenCalled();

    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId="round_lime__callableSectionDefault"
        paramInfoId="round_lime-codeobj__callableSectionDefault__styleColor"
        value="null"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      false,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).not.toContain("opacity-0");
    expect(markup).not.toContain('data-canvas-owned-underline="true"');
  });

  it("hides backend plain text values on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID}
        paramInfoId="settings-codeobj__backend__backend__defaultTerminalShell"
        value="null"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
  });

  it("hides dict canary resting text on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={DICT_CANVAS_OWNED_SECTION_SHELL_ID}
        paramInfoId="settings-codeobj__dictSectionDefault__dictSectionDefault__styleColor"
        value="null"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
  });

  it("hides global variables canary resting text on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID}
        paramInfoId="settings-codeobj__globalVariablesSectionDefault__globalVariablesSectionDefault__styleColor"
        value="null"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
  });

  it("hides section sizing policy resting text on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID}
        paramInfoId="settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__Browser__maxHeight"
        value="100000"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
    expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
  });

  it("hides shortcuts resting text on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={SHORTCUTS_CANVAS_OWNED_RESTING_TEXT_SECTION_ID}
        paramInfoId="settings-codeobj__shortcuts__shortcuts__advancedSearchShortcut"
        value="Mod + P"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
    expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
  });

  it.each([
    {
      paramInfoId:
        "settings-codeobj__stateMachineEndSectionDefault__stateMachineEndSectionDefault__size__height",
      sectionId: "settings-section__stateMachineEndSectionDefault",
      value: "96",
    },
    {
      paramInfoId:
        "settings-codeobj__listRootSectionDefault__listRootSectionDefault__styleColor",
      sectionId: "settings-section__listRootSectionDefault",
      value: "null",
    },
    {
      paramInfoId:
        "settings-codeobj__terminalSectionDefault__terminalSectionDefault__tagColor",
      sectionId: "settings-section__terminalSectionDefault",
      value: "null",
    },
  ])(
    "hides the shared size/style/tag resting-text cluster on $sectionId",
    ({ paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.TextParam,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
        true,
      );
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it.each([
    {
      paramInfoId:
        "settings-codeobj__spreadsheetSectionDefault__spreadsheetSectionDefault__activeSheet",
      sectionId: SPREADSHEET_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "null",
    },
    {
      paramInfoId:
        "settings-codeobj__taskBoardSectionDefault__taskBoardSectionDefault__viewMode",
      sectionId: TASK_BOARD_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "kanban",
    },
    {
      paramInfoId:
        "settings-codeobj__stateMachineStartSectionDefault__stateMachineStartSectionDefault__label",
      sectionId: STATE_MACHINE_START_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "Start",
    },
  ])(
    "hides the untouched top-rank settings text path on $sectionId",
    ({ paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.TextParam,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(
        mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText,
      ).toBe(true);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it("hides draw-section resting text on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={DRAW_CANVAS_OWNED_RESTING_TEXT_SECTION_ID}
        paramInfoId="settings-codeobj__drawSectionDefault__drawSectionDefault__activeLayerIdx"
        value="0"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
    expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
  });

  it("hides chat-section resting text on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={CHAT_CANVAS_OWNED_RESTING_TEXT_SECTION_ID}
        paramInfoId="settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode"
        value="minimal"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
    expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
  });

  it("hides browser-section resting text on the canvas path", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.TextParam,
      defaultVal: "",
    };

    const markup = renderToStaticMarkup(
      <ParamUI
        sectionId={BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID}
        paramInfoId="settings-codeobj__browserSectionDefault__browserSectionDefault__viewMode"
        value="list"
        onChange={() => undefined}
      />,
    );

    expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText).toBe(
      true,
    );
    expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
      true,
    );
    expect(
      mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
    ).toContain("opacity-0");
    expect(markup).toContain('data-canvas-owned-underline="true"');
    expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
  });

  it.each([
    {
      paramInfoId: "settings-codeobj__gui__gui__defaultZoomLevel",
      sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      value: "1",
    },
    {
      paramInfoId:
        "settings-codeobj__textBlockSectionDefault__textBlockSectionDefault__format",
      sectionId: TEXT_BLOCK_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "Plaintext",
    },
  ])(
    "hides the gui/text-block resting-text pair on the canvas path for $sectionId",
    ({ paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.TextParam,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(
        mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText,
      ).toBe(true);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it.each([
    {
      paramInfoId:
        "settings-codeobj__genPythonCodeSectionDefault__genPythonCodeSectionDefault__size__width",
      sectionId: GEN_PYTHON_CODE_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "500",
    },
    {
      paramInfoId:
        "settings-codeobj__genPythonMetadataSectionDefault__genPythonMetadataSectionDefault__size__width",
      sectionId: GEN_PYTHON_METADATA_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "500",
    },
  ])(
    "hides the gen-python resting-text pair on the canvas path for $sectionId",
    ({ paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.TextParam,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(
        mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText,
      ).toBe(true);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it.each([
    {
      codeObjType: CodeObjTypeEnum.CodeParam,
      paramInfoId:
        "settings-codeobj__rotaryParamCodeObjDefault__rotaryParamCodeObjDefault__max",
      sectionId: ROTARY_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "1",
    },
    {
      codeObjType: CodeObjTypeEnum.CodeParam,
      paramInfoId:
        "settings-codeobj__sliderParamCodeObjDefault__sliderParamCodeObjDefault__step",
      sectionId: SLIDER_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "1",
    },
    {
      codeObjType: CodeObjTypeEnum.TextAreaParam,
      paramInfoId:
        "settings-codeobj__dropdownParamCodeObjDefault__dropdownParamCodeObjDefault__choices",
      sectionId: DROPDOWN_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "[]",
    },
    {
      codeObjType: CodeObjTypeEnum.TextParam,
      paramInfoId:
        "settings-codeobj__textParamCodeObjDefault__textParamCodeObjDefault__uiType",
      sectionId: TEXT_PARAM_CODEOBJ_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "plain",
    },
  ])(
    "hides the shared param-codeobj resting-text cluster on the canvas path for $sectionId",
    ({ codeObjType, paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: codeObjType,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(
        mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText,
      ).toBe(true);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it.each([
    {
      paramInfoId:
        "settings-codeobj__buttonParamCodeObjDefault__buttonParamCodeObjDefault__label",
      sectionId: BUTTON_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "Trigger",
    },
    {
      paramInfoId:
        "settings-codeobj__codeSectionDefault__codeSectionDefault__codeLanguage",
      sectionId: CODE_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "python",
    },
    {
      paramInfoId:
        "settings-codeobj__promptSectionDefault__promptSectionDefault__format",
      sectionId: PROMPT_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "Jinja",
    },
    {
      paramInfoId:
        "settings-codeobj__languageServer__languageServer__basedpyright__analysis__diagnosticSeverityOverrides__reportUnknownVariableType",
      sectionId: LANGUAGE_SERVER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "none",
    },
  ])(
    "hides the code-like cluster resting text on the canvas path for $sectionId",
    ({ paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.TextParam,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(
        mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText,
      ).toBe(true);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it.each([
    {
      paramInfoId:
        "settings-codeobj__dateParamCodeObjDefault__dateParamCodeObjDefault__dateDisplayFormat",
      sectionId: DATE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "iso",
    },
    {
      paramInfoId:
        "settings-codeobj__timeParamCodeObjDefault__timeParamCodeObjDefault__timeDisplayFormat",
      sectionId: TIME_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "twenty_four_hour",
    },
  ])(
    "hides the date/time settings pair resting text on the canvas path for $sectionId",
    ({ paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.TextParam,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(
        mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText,
      ).toBe(true);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it.each([
    {
      paramInfoId:
        "settings-codeobj__chatWindowing__chatWindowing__shortcuts__canvasToggle",
      sectionId: CHAT_WINDOWING_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "Shift + Esc",
    },
    {
      paramInfoId:
        "settings-codeobj__dropzoneParamCodeObjDefault__dropzoneParamCodeObjDefault__placeholder",
      sectionId: DROPZONE_PARAM_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "Drop a file here",
    },
    {
      paramInfoId:
        "settings-codeobj__pluginSectionDefault__pluginSectionDefault__size__width",
      sectionId: PLUGIN_SECTION_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
      value: "auto",
    },
  ])(
    "hides the chat-windowing/dropzone/plugin resting-text cluster on the canvas path for $sectionId",
    ({ paramInfoId, sectionId, value }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.TextParam,
        defaultVal: "",
      };

      const markup = renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={() => undefined}
        />,
      );

      expect(mocks.textInputProps).toHaveBeenCalledTimes(1);
      expect(
        mocks.textInputProps.mock.calls[0][0].canvasOwnedRestingText,
      ).toBe(true);
      expect(mocks.textInputProps.mock.calls[0][0].canvasOwnedUnderline).toBe(
        true,
      );
      expect(
        mocks.textInputProps.mock.calls[0][0].dummyCodeClassName,
      ).toContain("opacity-0");
      expect(markup).toContain('data-canvas-owned-underline="true"');
      expect(markup).not.toContain("peer-focus-within/textinput:opacity-100");
    },
  );

  it("uses the canvas-owned resting dropdown path for section sizing policy size-mode controls", () => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.DropdownParam,
      defaultVal: "",
    };

    renderToStaticMarkup(
      <ParamUI
        sectionId={SECTION_SIZING_POLICY_CANVAS_OWNED_RESTING_TEXT_SECTION_ID}
        paramInfoId="settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__CodeCallable__sizeModeHeight"
        value="any"
        onChange={() => undefined}
      />,
    );

    expect(mocks.dropdownProps).toHaveBeenCalledTimes(1);
    expect(mocks.dropdownProps.mock.calls[0][0].canvasOwnedRestingInput).toBe(
      true,
    );
  });

  it.each([
    {
      paramInfoId: "settings-codeobj__gui__gui__selectionMode",
      sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      value: "partial",
    },
    {
      paramInfoId: "settings-codeobj__backend__backend__runSnapshotMode",
      sectionId: BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      value: "ephemeral",
    },
    {
      paramInfoId:
        "settings-codeobj__stateMachineGateSectionDefault__stateMachineGateSectionDefault__gateType",
      sectionId: STATE_MACHINE_GATE_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
      value: "AND",
    },
  ])(
    "uses the canvas-owned resting dropdown path for shared dropdown params in $sectionId",
    ({ paramInfoId, sectionId, value }) => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.DropdownParam,
      defaultVal: "",
    };

    renderToStaticMarkup(
      <ParamUI
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={value}
        onChange={() => undefined}
      />,
    );

    expect(mocks.dropdownProps).toHaveBeenCalledTimes(1);
    expect(mocks.dropdownProps.mock.calls[0][0].canvasOwnedRestingInput).toBe(
      true,
    );
    },
  );

  it.each([
    {
      expectedCanvasOwnedTrack: true,
      expectedLightweightRootClassName: undefined,
      paramInfoId: "settings-codeobj__backend__backend__autosave",
      sectionId: BACKEND_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
    },
    {
      expectedCanvasOwnedTrack: true,
      expectedLightweightRootClassName:
        "section-value justify-self-start self-center",
      paramInfoId:
        "settings-codeobj__browserSectionDefault__browserSectionDefault__aspectRatio",
      sectionId: BROWSER_CANVAS_OWNED_RESTING_TEXT_SECTION_ID,
    },
    {
      expectedCanvasOwnedTrack: true,
      expectedLightweightRootClassName:
        "section-value justify-self-start self-center",
      paramInfoId: "settings-codeobj__gui__gui__leftSidePaneShiftsMap",
      sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
    },
    {
      expectedCanvasOwnedTrack: true,
      expectedLightweightRootClassName:
        "section-value justify-self-start self-center",
      paramInfoId:
        "settings-codeobj__chatSectionDefault__chatSectionDefault__aspectRatio",
      sectionId: "settings-section__chatSectionDefault",
    },
    {
      expectedCanvasOwnedTrack: true,
      expectedLightweightRootClassName:
        "section-value justify-self-start self-center",
      paramInfoId:
        "settings-codeobj__callableSectionDefault__callableSectionDefault__aspectRatio",
      sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
    },
  ])(
    "uses the lightweight switch activator path for switch params on the canvas path in $sectionId",
    ({
      expectedCanvasOwnedTrack,
      expectedLightweightRootClassName,
      paramInfoId,
      sectionId,
    }) => {
    mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
    mocks.state.codeObjImpl = {
      type: CodeObjTypeEnum.SwitchParam,
      defaultVal: false,
    };

    renderToStaticMarkup(
      <ParamUI
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value="false"
        onChange={() => undefined}
      />,
    );

    expect(mocks.switchProps).toHaveBeenCalledTimes(1);
    expect(mocks.switchProps.mock.calls[0][0].lightweightActivator).toBe(true);
    expect(mocks.switchProps.mock.calls[0][0].canvasOwnedTrack).toBe(
      expectedCanvasOwnedTrack,
    );
    expect(mocks.switchProps.mock.calls[0][0].lightweightRootClassName).toBe(
      expectedLightweightRootClassName,
    );
    },
  );

  it.each([
    {
      paramInfoId: "settings-codeobj__gui__gui__sectionStyleColor",
      sectionId: GUI_CANVAS_OWNED_RESTING_DROPDOWN_SECTION_ID,
    },
    {
      paramInfoId:
        "settings-codeobj__callableSectionDefault__callableSectionDefault__styleColor",
      sectionId: CANVAS_OWNED_SECTION_SHELL_ID,
    },
  ])(
    "uses the lightweight color-input activator path for color picker params on the canvas path in $sectionId",
    ({ paramInfoId, sectionId }) => {
      mocks.state.graphSurfaceImplementation = "canvas-shell-underlay";
      mocks.state.codeObjImpl = {
        type: CodeObjTypeEnum.ColorPickerParam,
        defaultVal: "#ffffff",
      };

      renderToStaticMarkup(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value="#000000"
          onChange={() => undefined}
        />,
      );

      expect(mocks.colorPickerProps).toHaveBeenCalledTimes(1);
      expect(mocks.colorPickerProps.mock.calls[0][0].lightweightActivator).toBe(
        true,
      );
    },
  );
});
