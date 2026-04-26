/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrSectionVariantId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  createCore,
  createDictSectionImpl,
  createNestedParamCodeObjImpl,
  createPasswordParamCodeObjImpl,
  createProjectConfig,
  createTextParamCodeObjImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClearValues } from "./ClearValues";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const clearValueMocks = vi.hoisted(() => ({
  setParamEnteredValueMock: vi.fn(),
}));

vi.mock("components/Utils/atoms/menubar/menudropdownitem", () => ({
  MenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("openapi/http", () => ({
  setParamEnteredValue: clearValueMocks.setParamEnteredValueMock,
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: <T,>(value: T) => value,
  };
});

type SeededSectionState = {
  passwordParamId: string;
  rootParamId: string;
  sectionId: string;
  textParamId: string;
};

function renderComponent(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  act(() => {
    root.render(<ClearValues sectionId={sectionId} />);
  });

  return { host, root };
}

function seedDictSectionState(): SeededSectionState {
  const sectionId = "dict-section";
  const sectionVariantId = "dict-variant";
  const sectionImplId = "dict-impl";
  const rootParamId = "root-param";
  const rootParamVariantId = "root-param-variant";
  const rootParamImplId = "root-param-impl";
  const textParamId = "text-param";
  const textParamVariantId = "text-param-variant";
  const textParamImplId = "text-param-impl";
  const passwordParamId = "password-param";
  const passwordParamVariantId = "password-param-variant";
  const passwordParamImplId = "password-param-impl";

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Dict",
        variants: [sectionVariantId],
        defaultVariant: sectionVariantId,
      }),
    };
    state.sectionVariants = {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        impl: sectionImplId,
      }),
    };
    state.sectionImpls = {
      [sectionImplId]: createDictSectionImpl({
        id: sectionImplId,
        type: SectionTypeEnum.Dict,
        codeObjVariantMap: {
          [rootParamId]: rootParamVariantId,
          [textParamId]: textParamVariantId,
          [passwordParamId]: passwordParamVariantId,
        },
        topLevelParamId: rootParamId,
      }),
    };
    state.codeObjs = {
      [rootParamId]: createCore({
        id: rootParamId,
        name: "Root",
        variants: [rootParamVariantId],
        defaultVariant: rootParamVariantId,
      }),
      [textParamId]: createCore({
        id: textParamId,
        name: "Text",
        variants: [textParamVariantId],
        defaultVariant: textParamVariantId,
      }),
      [passwordParamId]: createCore({
        id: passwordParamId,
        name: "Password",
        variants: [passwordParamVariantId],
        defaultVariant: passwordParamVariantId,
      }),
    };
    state.codeObjVariants = {
      [rootParamVariantId]: createVariant({
        id: rootParamVariantId,
        impl: rootParamImplId,
      }),
      [textParamVariantId]: createVariant({
        id: textParamVariantId,
        impl: textParamImplId,
      }),
      [passwordParamVariantId]: createVariant({
        id: passwordParamVariantId,
        impl: passwordParamImplId,
      }),
    };
    state.codeObjImpls = {
      [rootParamImplId]: createNestedParamCodeObjImpl({
        id: rootParamImplId,
        type: CodeObjTypeEnum.NestedParam,
        children: [textParamId, passwordParamId],
      }),
      [textParamImplId]: createTextParamCodeObjImpl({
        id: textParamImplId,
        type: CodeObjTypeEnum.TextParam,
        value: "hello world",
      }),
      [passwordParamImplId]: createPasswordParamCodeObjImpl({
        id: passwordParamImplId,
        type: CodeObjTypeEnum.PasswordParam,
        value: "super-secret",
      }),
    };
  });

  return {
    passwordParamId,
    rootParamId,
    sectionId,
    textParamId,
  };
}

describe("ClearValues", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    resetProjectStores();
    clearValueMocks.setParamEnteredValueMock.mockReset();
    clearValueMocks.setParamEnteredValueMock.mockImplementation((args) => ({
      status: 200,
      hasResponse: true,
      data: null,
      ...args,
    }));
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
    resetProjectStores();
  });

  it("clears childless current-section params through the owner route and skips nested parents", async () => {
    const { rootParamId, sectionId, textParamId, passwordParamId } =
      seedDictSectionState();
    const sectionVariantId = getCurrSectionVariantId(
      useProjectState.getState(),
      sectionId,
    );
    ({ host, root } = renderComponent(sectionId));

    await act(async () => {
      host?.querySelector("button")?.click();
      await Promise.resolve();
    });

    expect(clearValueMocks.setParamEnteredValueMock).toHaveBeenCalledTimes(2);
    expect(clearValueMocks.setParamEnteredValueMock).toHaveBeenCalledWith({
      body: expect.objectContaining({
        projectConfigId: "project-1",
        sectionId,
        sectionVariantId,
        paramInfoId: textParamId,
        value: "",
      }),
    });
    expect(clearValueMocks.setParamEnteredValueMock).toHaveBeenCalledWith({
      body: expect.objectContaining({
        projectConfigId: "project-1",
        sectionId,
        sectionVariantId,
        paramInfoId: passwordParamId,
        value: "",
      }),
    });

    const state = useProjectState.getState();
    const textImpl = getCurrEffectiveCodeObjImpl(
      state,
      sectionId,
      textParamId,
    ) as {
      value?: string;
    };
    const passwordImpl = getCurrEffectiveCodeObjImpl(
      state,
      sectionId,
      passwordParamId,
    ) as {
      value?: string;
    };
    const rootImpl = getCurrEffectiveCodeObjImpl(
      state,
      sectionId,
      rootParamId,
    ) as {
      type?: string;
    };

    expect(textImpl.value).toBe("");
    expect(passwordImpl.value).toBe("super-secret");
    expect(rootImpl.type).toBe(CodeObjTypeEnum.NestedParam);
  });
});
