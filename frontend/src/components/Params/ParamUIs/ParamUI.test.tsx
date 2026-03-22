/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParamUI } from "./ParamUI";

type MockProjectState = {
  sectionImpl: {
    configLanguage: string;
    isFrozen: boolean;
  };
  codeObjImpl: {
    type: string;
    defaultVal: string;
    hasSecret?: boolean;
  };
};

const hoisted = vi.hoisted(() => ({
  mockProjectState: {
    sectionImpl: {
      configLanguage: "json",
      isFrozen: false,
    },
    codeObjImpl: {
      type: "TextParam",
      defaultVal: "",
      hasSecret: false,
    },
  } as MockProjectState,
  waitingForResultMock: vi.fn(() => false),
}));

vi.mock("state/definitions", () => ({
  useMisc: (selector: (state: { isSelectingParams: boolean }) => unknown) =>
    selector({ isSelectingParams: false }),
  useProjectState: (selector: (state: MockProjectState) => unknown) =>
    selector(hoisted.mockProjectState),
  useShareSession: (selector: (state: { isDeploymentMode: boolean }) => unknown) =>
    selector({ isDeploymentMode: false }),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditParams: true,
  }),
}));

vi.mock("state/hooks/lsp", () => ({
  useTextFieldWaitingForLSPResult: hoisted.waitingForResultMock,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveCodeObjImplWithTypeGuard: (state: MockProjectState) =>
    state.codeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard: (state: MockProjectState) =>
    state.sectionImpl,
}));

vi.mock("components/Utils/CodeMirror/TextInputCodeMirror", () => ({
  TextInputCodeMirror: (props: { value: string }) => (
    <div data-testid="text-input-codemirror">{props.value}</div>
  ),
}));

vi.mock("./ConfiguredParamInputs", () => ({
  ConfiguredColorPickerInput: () => null,
  ConfiguredDropdownInput: () => null,
  ConfiguredRotaryInput: () => null,
  ConfiguredSliderInput: () => null,
}));

vi.mock("./ButtonInput", () => ({
  ButtonInputConfigForParam: () => null,
}));

vi.mock("./ColorPickerInput", () => ({
  ColorPickerInputConfigForParam: () => null,
}));

vi.mock("./DropdownInput", () => ({
  DropdownInputConfigForParam: () => null,
  DropdownInput: () => null,
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

vi.mock("utils/paramValue", () => ({
  shouldShowPasswordReveal: () => false,
}));

vi.mock("utils/focusManager", () => ({
  focusOnSection: () => undefined,
}));

describe("ParamUI text-family fast path", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    hoisted.waitingForResultMock.mockReset();
    hoisted.waitingForResultMock.mockReturnValue(false);
    hoisted.mockProjectState.sectionImpl.configLanguage = "json";
    hoisted.mockProjectState.sectionImpl.isFrozen = false;
    hoisted.mockProjectState.codeObjImpl.type = "TextParam";
    hoisted.mockProjectState.codeObjImpl.defaultVal = "";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.clearAllMocks();
  });

  it("skips the LSP waiting subscription for non-python text rows", async () => {
    await act(async () => {
      root.render(
        createElement(ParamUI, {
          sectionId: "section-1",
          paramInfoId: "param-1",
          value: "42",
          onChange: () => undefined,
        }),
      );
    });

    expect(
      host.querySelector('[data-testid="text-input-codemirror"]')?.textContent,
    ).toContain("42");
    expect(hoisted.waitingForResultMock).not.toHaveBeenCalled();
    expect(host.querySelector(".gg-spinner")).toBeNull();
  });

  it("keeps the waiting indicator wired for python text rows", async () => {
    hoisted.mockProjectState.sectionImpl.configLanguage = "python";
    hoisted.waitingForResultMock.mockReturnValue(true);

    await act(async () => {
      root.render(
        createElement(ParamUI, {
          sectionId: "section-1",
          paramInfoId: "param-1",
          value: "42",
          onChange: () => undefined,
        }),
      );
    });

    expect(hoisted.waitingForResultMock).toHaveBeenCalledWith({
      sectionId: "section-1",
      paramInfoId: "param-1",
    });
    expect(host.querySelector(".gg-spinner")).not.toBeNull();
  });
});
