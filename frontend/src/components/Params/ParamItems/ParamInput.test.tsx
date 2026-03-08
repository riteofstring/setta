/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParamInput } from "./ParamInput";

const { routeGetPasswordParamValue } = vi.hoisted(() => ({
  routeGetPasswordParamValue: vi.fn(),
}));

vi.mock("utils/generatedGoEndpoints", () => ({
  route_get_password_param_value: routeGetPasswordParamValue,
}));

type RenderedParamInput = {
  host: HTMLDivElement;
  root: Root;
};

function seedPasswordParamState() {
  const sectionId = "section-1";
  const sectionVariantId = "section-variant-1";
  const sectionImplId = "section-impl-1";
  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

  useProjectState.setState({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: sectionVariantId },
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: "Section",
        variants: [sectionVariantId],
        defaultVariant: sectionVariantId,
      }),
    },
    sectionVariants: {
      [sectionVariantId]: createVariant({
        id: sectionVariantId,
        name: "Section Variant",
        impl: sectionImplId,
        nonPresetImpls: [],
      }),
    },
    sectionImpls: {
      [sectionImplId]: createCallableSectionImpl(
        createUserDefaultCallableSectionImpl(),
        {
          id: sectionImplId,
          codeObjVariantMap: { [paramId]: paramVariantId },
        },
      ),
    },
    codeObjs: {
      [paramId]: createCore({
        id: paramId,
        name: "Password",
        displayName: "",
        variants: [paramVariantId],
        defaultVariant: paramVariantId,
      }),
    },
    codeObjVariants: {
      [paramVariantId]: createVariant({
        id: paramVariantId,
        name: "Param Variant",
        impl: paramImplId,
        nonPresetImpls: [],
      }),
    },
    codeObjImpls: {
      [paramImplId]: {
        ...createCodeParamCodeObjImpl(createUserDefaultCodeParamCodeObjImpl(), {
          id: paramImplId,
          name: "Password",
          value: "",
        }),
        type: CodeObjTypeEnum.PasswordParam,
        hasSecret: true,
      },
    },
    previewSectionVariantMap: {},
  });
}

async function renderParamInput(): Promise<RenderedParamInput> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<ParamInput sectionId="section-1" paramInfoId="param-1" />);
  });

  return { host, root };
}

describe("ParamInput", () => {
  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    routeGetPasswordParamValue.mockReset();
    routeGetPasswordParamValue.mockResolvedValue({
      status: 200,
      data: { value: "topsecret" },
      hasResponse: true,
    });
    seedPasswordParamState();
  });

  afterEach(async () => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("reveals saved password values through the Go-generated helper", async () => {
    const { host, root } = await renderParamInput();

    try {
      const revealButton = host.querySelector<HTMLButtonElement>(
        'button[title="Reveal saved password"]',
      );
      const input = host.querySelector<HTMLInputElement>(
        'input[placeholder="Saved"]',
      );

      expect(revealButton).not.toBeNull();
      expect(input?.value).toBe("");

      await act(async () => {
        revealButton?.click();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(routeGetPasswordParamValue).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId: "section-1",
        paramInfoId: "param-1",
      });
      expect(input?.value).toBe("topsecret");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
