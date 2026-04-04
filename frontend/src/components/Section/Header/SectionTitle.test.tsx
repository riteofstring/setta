/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

const routeSetSectionNameMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_set_section_name: (...args: unknown[]) => routeSetSectionNameMock(...args),
}));

import {
  useShareSession,
  useProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { SectionTitle } from "./SectionTitle";

describe("SectionTitle", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    routeSetSectionNameMock.mockReset();
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: {
          "section-a": "variant-a",
          "section-b": "variant-b",
        },
        topLevelSections: {
          "section-a": { x: 0, y: 0, zIndex: 0, w: null, h: null },
          "section-b": { x: 1, y: 0, zIndex: 1, w: null, h: null },
        },
      });
      state.sections = {
        "section-a": createCore({
          id: "section-a",
          name: "Alpha",
          variants: ["variant-a"],
          defaultVariant: "variant-a",
        }),
        "section-b": createCore({
          id: "section-b",
          name: "Beta",
          variants: ["variant-b"],
          defaultVariant: "variant-b",
        }),
      };
      state.sectionVariants = {
        "variant-a": createVariant({
          id: "variant-a",
          impl: "impl-a",
        }),
        "variant-b": createVariant({
          id: "variant-b",
          impl: "impl-b",
        }),
      };
      state.sectionImpls = {
        "impl-a": createUserDefaultChatSectionImpl({
          id: "impl-a",
        }),
        "impl-b": createUserDefaultChatSectionImpl({
          id: "impl-b",
        }),
      };
      state.previewSectionVariantMap = {};
    });

    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  it("submits duplicate section names to the backend and shows the backend error", async () => {
    routeSetSectionNameMock.mockResolvedValue({
      data: { detail: "Duplicate sibling name." },
      hasResponse: true,
      status: 400,
    });

    await act(async () => {
      root.render(
        <SectionTitle
          sectionId="section-a"
          titleProps={{
            editing: "editing-title",
            notEditing: "fixed-title",
            fixed: "fixed-title",
          }}
        />,
      );
    });

    const title = host.querySelector("p");
    expect(title?.textContent).toBe("Alpha");

    await act(async () => {
      title?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      title?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
    });

    const input = host.querySelector("input");
    expect(input).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "Beta");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      (input as HTMLInputElement).focus();
      (input as HTMLInputElement).blur();
    });

    expect(routeSetSectionNameMock).toHaveBeenCalledTimes(1);
    expect(routeSetSectionNameMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectConfigId: "project-1",
        sectionId: "section-a",
        name: "Beta",
        frontendOpId: expect.any(String),
      }),
    );
    expect(host.textContent).toContain("Duplicate sibling name.");
    expect(useProjectState.getState().sections["section-a"]?.name).toBe("Alpha");
    expect(useProjectState.getState().projectConfig.id).toBe("project-1");
  });
});
