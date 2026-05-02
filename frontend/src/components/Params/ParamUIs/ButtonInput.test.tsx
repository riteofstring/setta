import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockConfig = vi.hoisted(
  () =>
    ({
      label: "Trigger",
      actionMode: undefined,
      requestMethod: undefined,
      requestUrl: "",
      requestHeaderKey: "",
      requestHeaderValue: "",
      requestBody: "",
    }) as Record<string, unknown>,
);

vi.mock("openapi/http", () => ({
  updateParamImplConfig: vi.fn(),
}));

vi.mock("@setta/app-subsystem-frontend-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@setta/app-subsystem-frontend-sdk")>();
  return {
    ...actual,
    callOpenAPI: vi.fn(),
  };
});

vi.mock("state/actions/sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate: vi.fn(),
  getCurrProjectConfigId: vi.fn(() => "project-1"),
  setCurrEffectiveCodeObjImplValue: vi.fn(),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({ canEditStructure: true }),
}));

vi.mock("state/hooks/uiTypes", () => ({
  useParamCodeObjUIConfig: () => mockConfig,
}));

vi.mock("utils/settaApiPresets", () => ({
  SETTA_API_PRESETS: [{ label: "Create thing", route: "/create-thing" }],
  formatSettaApiBody: (route: string) =>
    route === "/create-thing" ? '{\n  "route": "/create-thing"\n}' : "",
}));

vi.mock("utils/generatedTypes", async () => {
  const actual = await vi.importActual<typeof import("utils/generatedTypes")>(
    "utils/generatedTypes",
  );
  return {
    ...actual,
    ButtonParamUIConfig: {
      defaultActionMode: actual.ButtonActionModeEnum.HTTP_REQUEST,
      defaultRequestMethod: actual.HTTPRequestMethodEnum.HEAD,
      actionModeOptions: [
        {
          value: actual.ButtonActionModeEnum.SETTA_API,
          label: "Setta first",
        },
        {
          value: actual.ButtonActionModeEnum.HTTP_REQUEST,
          label: "HTTP second",
        },
        {
          value: actual.ButtonActionModeEnum.WEBSOCKET_LISTENER,
          label: "WS third",
        },
      ],
      requestMethodOptions: [
        {
          value: actual.HTTPRequestMethodEnum.OPTIONS,
          label: "OPTIONS first",
        },
        {
          value: actual.HTTPRequestMethodEnum.HEAD,
          label: "HEAD second",
        },
      ],
    },
  };
});

import { ButtonInput, ButtonInputConfigForParam } from "./ButtonInput";

describe("ButtonInputConfigForParam", () => {
  it("marks action button surfaces as GPU flow interactive nodrag regions", () => {
    const markup = renderToStaticMarkup(
      <ButtonInput
        label="Run"
        onClick={() => undefined}
        wrapperClassName="fixture-wrapper"
        buttonClassName="fixture-button"
      />,
    );

    expect(markup).toContain('data-gpu-flow-interactive="true"');
    expect(markup).toContain("nodrag nopan fixture-wrapper");
    expect(markup).toContain("nodrag nopan fixture-button");
  });

  it("renders button mode and method options from the generated Go-owned config", () => {
    const markup = renderToStaticMarkup(
      <ButtonInputConfigForParam sectionId="section-1" paramInfoId="param-1" />,
    );

    expect(markup).toContain("HTTP second");
    expect(markup).toContain("OPTIONS first");
    expect(markup).toContain("HEAD second");
    expect(markup).toContain("Method");
    expect(markup.indexOf("Setta first")).toBeLessThan(
      markup.indexOf("HTTP second"),
    );
    expect(markup.indexOf("HTTP second")).toBeLessThan(
      markup.indexOf("WS third"),
    );
    expect(markup.indexOf("OPTIONS first")).toBeLessThan(
      markup.indexOf("HEAD second"),
    );
  });
});
