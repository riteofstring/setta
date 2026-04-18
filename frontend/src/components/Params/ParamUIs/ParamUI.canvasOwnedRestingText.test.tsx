import {
  CANVAS_OWNED_SECTION_SHELL_ID,
  DICT_CANVAS_OWNED_SECTION_SHELL_ID,
  GLOBAL_VARIABLES_CANVAS_OWNED_SECTION_SHELL_ID,
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
    canvasOwnedRestingText?: boolean;
    dummyCodeClassName: string;
    language: string;
  }) => {
    mocks.textInputProps(props);
    return <div data-testid="text-input" data-language={props.language} />;
  },
}));

vi.mock("./ButtonInput", () => ({
  ButtonInputConfigForParam: () => null,
}));

vi.mock("./ColorPickerInput", () => ({
  ColorPickerInputConfigForParam: () => null,
}));

vi.mock("./ConfiguredParamInputs", () => ({
  ConfiguredColorPickerInput: () => null,
  ConfiguredDropdownInput: () => null,
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
  SwitchInput: () => null,
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
        sectionId="settings-section__textBlockSectionDefault"
        paramInfoId="settings-codeobj__dictSectionDefault__dictSectionDefault__styleColor"
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
});
