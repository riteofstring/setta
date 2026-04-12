import { renderToStaticMarkup } from "react-dom/server";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
  createCore,
  createProjectConfig,
  createTextBlockSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodeBlock, TextBlock } from "./TextBlock";

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function seedTextBlockSection({
  format,
  text,
  masterFontSizePx,
}: {
  format: TextBlockFormatEnum;
  text: string;
  masterFontSizePx: number;
}) {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });
  const sectionCore = createCore({
    id: sectionId,
    name: "TextBlock",
    variants: [variantId],
    defaultVariant: variantId,
  });
  const sectionVariant = createVariant({
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
  });
  const sectionImpl = createTextBlockSectionImpl({
    id: implId,
    text,
    format,
    textDisplayMode: TextBlockDisplayModeEnum.Render,
    masterFontSizePx,
  });

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
  });
  syncStoreInitialState(useProjectState);
  return sectionId;
}

describe("TextBlock typography scale", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("applies markdown typography css vars derived from master size", () => {
    const sectionId = seedTextBlockSection({
      format: TextBlockFormatEnum.Markdown,
      text: "# Heading\n\nBody",
      masterFontSizePx: 18,
    });
    const markup = renderToStaticMarkup(<TextBlock sectionId={sectionId} />);

    expect(markup).toContain("--setta-textblock-body-size:18px");
    expect(markup).toContain("--setta-textblock-h1-size:36px");
    expect(markup).toContain(
      "prose-h1:text-[length:var(--setta-textblock-h1-size)]",
    );
  });

  it("applies plain text font-size from master size", () => {
    const sectionId = seedTextBlockSection({
      format: TextBlockFormatEnum.Plaintext,
      text: "plain output",
      masterFontSizePx: 22,
    });
    const markup = renderToStaticMarkup(<TextBlock sectionId={sectionId} />);

    expect(markup).toContain("<pre");
    expect(markup).toContain("font-size:22px");
  });

  it("renders inline and block markdown code with distinct wrappers", () => {
    const inlineMarkup = renderToStaticMarkup(
      <CodeBlock inline className="language-ts extra-class">
        {"const value = 1;"}
      </CodeBlock>,
    );
    const blockMarkup = renderToStaticMarkup(
      <CodeBlock className="language-ts extra-class">
        {"const value = 1;\nconsole.log(value);"}
      </CodeBlock>,
    );

    expect(inlineMarkup).toContain('data-setta-inline-code="true"');
    expect(inlineMarkup).toContain("extra-class");
    expect(inlineMarkup).not.toContain("language-ts");
    expect(blockMarkup).toContain('data-setta-code-block="true"');
    expect(blockMarkup).toContain("extra-class");
    expect(blockMarkup).not.toContain("language-ts");
  });
});
