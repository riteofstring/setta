/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCore,
  createProjectConfig,
  createTextBlockSectionImpl,
  createVariant,
  SectionTypeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { clampTextBlockMasterFontSize } from "utils/textBlockTypography";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextBlockSettings } from "./TextBlockSettings";

const routeDocstringToMarkdownMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_docstring_to_markdown: (...args: unknown[]) =>
    routeDocstringToMarkdownMock(...args),
  route_set_text_block_heading_as_section_name: vi.fn(),
  route_set_text_block_master_font_size: vi.fn(),
  route_set_text_block_meta_control_style: vi.fn(),
}));

vi.mock("components/Params/ParamUIs/SwitchInput", () => ({
  SwitchInput: ({
    value,
    onChange,
    isDisabled,
  }: {
    value: boolean | string;
    onChange: (value: boolean) => void;
    isDisabled?: boolean;
  }) => (
    <button
      data-testid="mock-switch-input"
      disabled={isDisabled}
      onClick={() => onChange(!(value === true || value === "true"))}
    />
  ),
}));

type RenderedTextBlockSettings = {
  host: HTMLDivElement;
  root: Root;
};

async function renderTextBlockSettings(
  sectionId: string,
): Promise<RenderedTextBlockSettings> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<TextBlockSettings sectionId={sectionId} />);
  });

  return { host, root };
}

function seedTextBlockSection({
  sectionId = "text-block-section",
  variantId = "text-block-variant",
  implId = "text-block-impl",
  text = "Summary line.\n\nArgs:\n    x: value\n",
}: {
  sectionId?: string;
  variantId?: string;
  implId?: string;
  text?: string;
}) {
  useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
    });
    state.sections = {
      [sectionId]: createCore({
        id: sectionId,
        name: "Notes",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    };
    state.sectionVariants = {
      [variantId]: createVariant({
        id: variantId,
        name: "Variant",
        impl: implId,
        nonPresetImpls: [],
      }),
    };
    state.sectionImpls = {
      [implId]: createTextBlockSectionImpl({
        ...{
          text,
          format: TextBlockFormatEnum.Plaintext,
        },
        ...{
          id: implId,
        },
      }),
    };
    state.previewSectionVariantMap = {};
  });

  return { sectionId, implId, text };
}

describe("clampTextBlockMasterFontSize", () => {
  it("clamps values into the supported font-size range", () => {
    expect(clampTextBlockMasterFontSize(2)).toBe(8);
    expect(clampTextBlockMasterFontSize(19)).toBe(19);
    expect(clampTextBlockMasterFontSize(99)).toBe(48);
  });

  it("falls back to default font size when input is not finite", () => {
    expect(clampTextBlockMasterFontSize(Number.NaN)).toBe(14);
    expect(clampTextBlockMasterFontSize(Number.POSITIVE_INFINITY)).toBe(14);
  });
});

describe("TextBlockSettings", () => {
  beforeEach(() => {
    resetProjectStores();
    routeDocstringToMarkdownMock.mockReset();
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("converts docstring text through the Go helper when enabling markdown", async () => {
    const convertedMarkdown = "Summary line.\n\n#### Args\n\n- `x`: value\n";
    routeDocstringToMarkdownMock.mockResolvedValue({
      data: convertedMarkdown,
      status: 200,
      hasResponse: true,
    });
    const { sectionId, text } = seedTextBlockSection({});

    const { host, root } = await renderTextBlockSettings(sectionId);

    try {
      const markdownToggle = host.querySelectorAll<HTMLButtonElement>(
        '[data-testid="mock-switch-input"]',
      )[0];
      if (!(markdownToggle instanceof HTMLButtonElement)) {
        throw new Error("Expected markdown toggle");
      }

      await act(async () => {
        markdownToggle.click();
      });

      // Enabling markdown should run the Go-owned conversion helper first, then
      // persist the converted text into the live section impl.
      expect(routeDocstringToMarkdownMock).toHaveBeenCalledWith({
        docstring: text,
      });
      expect(
        getCurrEffectiveSectionImplOfType(
          useProjectState.getState(),
          sectionId,
          SectionTypeEnum.TextBlock,
        ),
      ).toMatchObject({
        format: TextBlockFormatEnum.Markdown,
        text: convertedMarkdown,
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("preserves the original text when conversion fails but still toggles markdown format", async () => {
    const originalText = "Not a supported docstring format";
    routeDocstringToMarkdownMock.mockResolvedValue({
      data: { detail: "Unknown docstring format." },
      status: 400,
      hasResponse: true,
    });
    const { sectionId } = seedTextBlockSection({ text: originalText });

    const { host, root } = await renderTextBlockSettings(sectionId);

    try {
      const markdownToggle = host.querySelectorAll<HTMLButtonElement>(
        '[data-testid="mock-switch-input"]',
      )[0];
      if (!(markdownToggle instanceof HTMLButtonElement)) {
        throw new Error("Expected markdown toggle");
      }

      await act(async () => {
        markdownToggle.click();
      });

      // The current product behavior is fail-open: a rejected conversion keeps
      // the original text but still flips the text block into markdown mode.
      expect(routeDocstringToMarkdownMock).toHaveBeenCalledWith({
        docstring: originalText,
      });
      expect(
        getCurrEffectiveSectionImplOfType(
          useProjectState.getState(),
          sectionId,
          SectionTypeEnum.TextBlock,
        ),
      ).toMatchObject({
        format: TextBlockFormatEnum.Markdown,
        text: originalText,
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
