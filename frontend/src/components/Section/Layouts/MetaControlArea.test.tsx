/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  currentButtonConfig: {
    type: "ButtonParam",
    actionMode: "SETTA_API",
    requestMethod: "POST",
    requestUrl: "",
    requestHeaderKey: "",
    requestHeaderValue: "",
    requestBody: "",
  },
  getEmptySpacePosition: vi.fn(() => ({ x: 120, y: 240 })),
  post: vi.fn(),
  routeSetParamEnteredValue: vi.fn(),
  sendRealtimeDependencyEvent: vi.fn(),
  sendRealtimeSectionLiteral: vi.fn(),
  useProjectStateSetState: vi.fn(),
}));

vi.mock("components/Section/Layouts/MetaControl/MetaControlNode", async () => {
  const React = await import("react");
  return {
    MetaControlContent: ({ onAction }: { onAction?: () => void }) =>
      React.createElement(
        "button",
        {
          "data-testid": "meta-control-action",
          onClick: onAction,
        },
        "Action",
      ),
  };
});

vi.mock("state/definitions", () => {
  const useProjectState = Object.assign(
    (selector: (state: unknown) => unknown) => selector({}),
    { setState: mocked.useProjectStateSetState },
  );
  return { useProjectState };
});

vi.mock("state/actions/sectionInfos", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("state/actions/sectionInfos")
  >();
  return {
    ...actual,
    dispatchOptimisticProjectStateUpdate: vi.fn(),
    getCurrCodeObjVariantIfPresent: vi.fn(() => ({ id: "code-variant-1" })),
    getCurrEffectiveCodeObjImpl: vi.fn(() => ({ type: "ButtonParam" })),
    getCurrEffectiveCodeObjImplIfPresent: vi.fn(
      () => mocked.currentButtonConfig,
    ),
    getCurrEffectiveCodeObjImplWithTypeGuardIfPresent: vi.fn(
      () => mocked.currentButtonConfig,
    ),
    getCurrEffectiveCodeObjImplWithTypeGuard: vi.fn(
      () => mocked.currentButtonConfig,
    ),
    getCurrEffectiveSectionImplOfType: vi.fn(() => ({
      metaControlParamId: "param-1",
      showSectionTitle: false,
    })),
    getCurrProjectConfigId: vi.fn(() => "project-alpha"),
    getCurrSectionVariantId: vi.fn(() => "section-variant-1"),
    getParamDisplayNameIfPresent: vi.fn(() => "Run"),
    getSectionCore: vi.fn(() => ({ name: "Section" })),
    setCurrEffectiveCodeObjImplValue: vi.fn(),
  };
});

vi.mock("state/actions/sections/createSections", () => ({
  getEmptySpacePosition: mocked.getEmptySpacePosition,
}));

vi.mock("state/actions/websocketReceive", () => ({
  sendRealtimeDependencyEvent: mocked.sendRealtimeDependencyEvent,
  sendRealtimeSectionLiteral: mocked.sendRealtimeSectionLiteral,
}));

vi.mock("state/hooks/utils", () => ({
  useLocalPendingValue: (value: string) => [value, vi.fn()],
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_set_param_entered_value: mocked.routeSetParamEnteredValue,
}));

vi.mock("utils/requestTransport", () => ({
  post: mocked.post,
}));

import { GoHTTPRouteHelpers } from "utils/generatedRoutes";
import {
  ButtonActionModeEnum,
  HTTPRequestMethodEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { MetaControlArea } from "./MetaControlArea";

type RenderedMetaControlArea = {
  host: HTMLDivElement;
  root: Root;
};

async function renderMetaControlArea() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<MetaControlArea sectionId="section-1" />);
  });

  return { host, root } satisfies RenderedMetaControlArea;
}

describe("MetaControlArea Setta API button actions", () => {
  beforeEach(() => {
    mocked.currentButtonConfig = {
      type: "ButtonParam",
      actionMode: "SETTA_API",
      requestMethod: "POST",
      requestUrl: "",
      requestHeaderKey: "",
      requestHeaderValue: "",
      requestBody: "",
    };
    mocked.getEmptySpacePosition.mockClear();
    mocked.getEmptySpacePosition.mockReturnValue({ x: 120, y: 240 });
    mocked.post.mockReset();
    mocked.sendRealtimeDependencyEvent.mockReset();
    mocked.sendRealtimeSectionLiteral.mockReset();
    mocked.routeSetParamEnteredValue.mockReset();
    mocked.useProjectStateSetState.mockReset();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("posts custom Setta API routes through the low-level post boundary", async () => {
    mocked.currentButtonConfig.requestUrl = "  /customRoute  ";
    mocked.currentButtonConfig.requestBody = '{"alpha":1,"beta":"two"}';

    const { host, root } = await renderMetaControlArea();

    try {
      const actionButton = host.querySelector<HTMLButtonElement>(
        '[data-testid="meta-control-action"]',
      );
      if (!(actionButton instanceof HTMLButtonElement)) {
        throw new Error("Expected MetaControlContent action button");
      }

      await act(async () => {
        actionButton.click();
      });

      expect(mocked.post).toHaveBeenCalledWith("/customRoute", {
        alpha: 1,
        beta: "two",
      });
      expect(mocked.sendRealtimeDependencyEvent).not.toHaveBeenCalled();
      expect(mocked.sendRealtimeSectionLiteral).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("merges preset defaults before posting Setta API actions", async () => {
    mocked.currentButtonConfig.requestUrl =
      GoHTTPRouteHelpers.createTopLevelSection();
    mocked.currentButtonConfig.requestBody = "";

    const { host, root } = await renderMetaControlArea();

    try {
      const actionButton = host.querySelector<HTMLButtonElement>(
        '[data-testid="meta-control-action"]',
      );
      if (!(actionButton instanceof HTMLButtonElement)) {
        throw new Error("Expected MetaControlContent action button");
      }

      await act(async () => {
        actionButton.click();
      });

      expect(mocked.post).toHaveBeenCalledWith(
        GoHTTPRouteHelpers.createTopLevelSection(),
        {
          projectConfigId: "project-alpha",
          implType: SectionTypeEnum.TextBlock,
          controlCodeObjType: null,
          implOverrides: {
            type: SectionTypeEnum.TextBlock,
            text: "Hello",
          },
          position: { x: 120, y: 240 },
        },
      );
      expect(mocked.sendRealtimeDependencyEvent).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("does not post blank Setta API routes", async () => {
    mocked.currentButtonConfig.requestUrl = "   ";
    mocked.currentButtonConfig.requestBody = '{"alpha":1}';

    const { host, root } = await renderMetaControlArea();

    try {
      const actionButton = host.querySelector<HTMLButtonElement>(
        '[data-testid="meta-control-action"]',
      );
      if (!(actionButton instanceof HTMLButtonElement)) {
        throw new Error("Expected MetaControlContent action button");
      }

      await act(async () => {
        actionButton.click();
      });

      expect(mocked.post).not.toHaveBeenCalled();
      expect(mocked.sendRealtimeDependencyEvent).not.toHaveBeenCalled();
      expect(mocked.sendRealtimeSectionLiteral).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("omits request bodies for HTTP GET button actions", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocked.currentButtonConfig.actionMode = ButtonActionModeEnum.HTTP_REQUEST;
    mocked.currentButtonConfig.requestMethod = HTTPRequestMethodEnum.GET;
    mocked.currentButtonConfig.requestUrl = "  https://example.com/api  ";
    mocked.currentButtonConfig.requestHeaderKey = "X-Test";
    mocked.currentButtonConfig.requestHeaderValue = "yes";
    mocked.currentButtonConfig.requestBody = '{"ignored":true}';

    const { host, root } = await renderMetaControlArea();

    try {
      const actionButton = host.querySelector<HTMLButtonElement>(
        '[data-testid="meta-control-action"]',
      );
      if (!(actionButton instanceof HTMLButtonElement)) {
        throw new Error("Expected MetaControlContent action button");
      }

      await act(async () => {
        actionButton.click();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/api", {
        method: HTTPRequestMethodEnum.GET,
        headers: { "X-Test": "yes" },
        body: undefined,
      });
      expect(mocked.post).not.toHaveBeenCalled();
      expect(mocked.sendRealtimeDependencyEvent).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("does not fetch for blank HTTP request URLs", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocked.currentButtonConfig.actionMode = ButtonActionModeEnum.HTTP_REQUEST;
    mocked.currentButtonConfig.requestMethod = HTTPRequestMethodEnum.POST;
    mocked.currentButtonConfig.requestUrl = "   ";
    mocked.currentButtonConfig.requestBody = '{"ignored":true}';

    const { host, root } = await renderMetaControlArea();

    try {
      const actionButton = host.querySelector<HTMLButtonElement>(
        '[data-testid="meta-control-action"]',
      );
      if (!(actionButton instanceof HTMLButtonElement)) {
        throw new Error("Expected MetaControlContent action button");
      }

      await act(async () => {
        actionButton.click();
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mocked.post).not.toHaveBeenCalled();
      expect(mocked.sendRealtimeDependencyEvent).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("omits request bodies for HTTP HEAD button actions", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocked.currentButtonConfig.actionMode = ButtonActionModeEnum.HTTP_REQUEST;
    mocked.currentButtonConfig.requestMethod = HTTPRequestMethodEnum.HEAD;
    mocked.currentButtonConfig.requestUrl = "https://example.com/head";
    mocked.currentButtonConfig.requestBody = '{"ignored":true}';

    const { host, root } = await renderMetaControlArea();

    try {
      const actionButton = host.querySelector<HTMLButtonElement>(
        '[data-testid="meta-control-action"]',
      );
      if (!(actionButton instanceof HTMLButtonElement)) {
        throw new Error("Expected MetaControlContent action button");
      }

      await act(async () => {
        actionButton.click();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/head", {
        method: HTTPRequestMethodEnum.HEAD,
        headers: undefined,
        body: undefined,
      });
      expect(mocked.post).not.toHaveBeenCalled();
      expect(mocked.sendRealtimeDependencyEvent).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
