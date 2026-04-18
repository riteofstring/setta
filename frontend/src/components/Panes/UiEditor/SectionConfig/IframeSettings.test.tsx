/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getCurrIFrameSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createIFrameSectionImpl,
  createProjectConfig,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IframeSettings } from "./IframeSettings";

type RenderedIframeSettings = {
  host: HTMLDivElement;
  root: Root;
};

async function renderIframeSettings(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<IframeSettings sectionId={sectionId} />);
  });
  return { host, root } satisfies RenderedIframeSettings;
}

function seedIframeSection(code: string) {
  const sectionId = "iframe-section";
  const variantId = "iframe-variant";
  const implId = "iframe-impl";

  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "IFrame",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        impl: implId,
      }),
    };
    state.sectionImpls = {
      [implId]: createIFrameSectionImpl({
        id: implId,
        code,
      }),
    };
    state.previewSectionVariantMap = {};
  });

  return sectionId;
}

describe("IframeSettings", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("writes valid iframe HTML through the current effective section contract", async () => {
    const sectionId = seedIframeSection(
      "<iframe src='https://before.example'></iframe>",
    );
    const { host, root } = await renderIframeSettings(sectionId);

    try {
      const textarea = host.querySelector("textarea");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("Expected iframe settings textarea");
      }

      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        if (!setValue) {
          throw new Error("Expected HTMLTextAreaElement value setter");
        }
        setValue.call(
          textarea,
          "<iframe src='https://after.example' title='after'></iframe>",
        );
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(
        getCurrIFrameSectionImpl(useProjectState.getState(), sectionId).code,
      ).toBe("<iframe src='https://after.example' title='after'></iframe>");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rejects invalid iframe HTML without mutating the owner state", async () => {
    const initialCode = "<iframe src='https://before.example'></iframe>";
    const sectionId = seedIframeSection(initialCode);
    const { host, root } = await renderIframeSettings(sectionId);

    try {
      const textarea = host.querySelector("textarea");
      if (!(textarea instanceof HTMLTextAreaElement)) {
        throw new Error("Expected iframe settings textarea");
      }

      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        if (!setValue) {
          throw new Error("Expected HTMLTextAreaElement value setter");
        }
        setValue.call(textarea, "<div>not an iframe</div>");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(host.textContent).toContain("Input must contain an iframe tag");
      expect(
        getCurrIFrameSectionImpl(useProjectState.getState(), sectionId).code,
      ).toBe(initialCode);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
