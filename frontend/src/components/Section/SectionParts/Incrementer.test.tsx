/* @vitest-environment jsdom */
import {
  createChildSectionsViaIncrementer,
  deleteChildSectionsViaDecrementer,
} from "openapi/http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createListRootSectionImpl,
  createProjectConfig,
  SectionTypeEnum,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Incrementer } from "./Incrementer";
vi.mock("openapi/http", async () => {
  const actual = await import("openapi/http");
  return {
    ...actual,
    createChildSectionsViaIncrementer: vi.fn(async () => ({
      data: { sectionIds: ["child-created"] },
      response: new Response(`{"sectionIds":["child-created"]}`, {
        status: 200,
      }),
      status: 200,
    })),
    deleteChildSectionsViaDecrementer: vi.fn(async () => ({
      data: { sectionIds: ["child-created"] },
      response: new Response(`{"sectionIds":["child-created"]}`, {
        status: 200,
      }),
      status: 200,
    })),
  };
});
const mockedRouteCreateChildSectionsViaIncrementer = vi.mocked(
  createChildSectionsViaIncrementer,
);
const mockedRouteDeleteChildSectionsViaDecrementer = vi.mocked(
  deleteChildSectionsViaDecrementer,
);
type RenderedIncrementer = {
  host: HTMLDivElement;
  root: Root;
};
async function renderIncrementer(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<Incrementer isRoot sectionId={sectionId} />);
  });
  return { host, root } satisfies RenderedIncrementer;
}
describe("Incrementer", () => {
  const sectionId = "list-root-section";
  const variantId = "list-root-variant";
  const implId = "list-root-impl";
  const sectionCore: Core = {
    id: sectionId,
    name: "ListRoot",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const sectionVariant: Variant = {
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  beforeEach(() => {
    resetProjectStores();
    mockedRouteCreateChildSectionsViaIncrementer.mockClear();
    mockedRouteDeleteChildSectionsViaDecrementer.mockClear();
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
      shareSessionId: null,
      sessionRunCount: 0,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = {
        [implId]: createListRootSectionImpl({
          id: implId,
          defaultChildSectionType: SectionTypeEnum.Dict,
        }),
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
    });
  });
  afterEach(() => {
    resetProjectStores();
    mockedRouteCreateChildSectionsViaIncrementer.mockClear();
    mockedRouteDeleteChildSectionsViaDecrementer.mockClear();
    document.body.innerHTML = "";
  });
  it("posts incrementer add and delete actions through the canonical endpoints", async () => {
    const { host, root } = await renderIncrementer(sectionId);
    try {
      const input = host.querySelector<HTMLInputElement>("input");
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("Expected incrementer input");
      }
      const buttons = host.querySelectorAll<HTMLButtonElement>("button");
      if (buttons.length !== 2) {
        throw new Error(
          `Expected 2 incrementer buttons, got ${buttons.length}`,
        );
      }
      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (!setValue) {
          throw new Error("Expected HTMLInputElement value setter");
        }
        setValue.call(input, "2");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        buttons[1].click();
      });
      expect(mockedRouteCreateChildSectionsViaIncrementer).toHaveBeenCalledWith(
        {
          projectConfigId: "project-1",
          calledBy: sectionId,
          implType: SectionTypeEnum.Dict,
          numChildren: 2,
        },
      );
      await act(async () => {
        buttons[0].click();
      });
      expect(mockedRouteDeleteChildSectionsViaDecrementer).toHaveBeenCalledWith(
        {
          projectConfigId: "project-1",
          calledBy: sectionId,
          numChildren: 2,
        },
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
