import { renderToStaticMarkup } from "react-dom/server";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderIcon } from "./HeaderIcon";

function createIcon(name: string) {
  return ({ className }: { className?: string }) => (
    <svg data-icon={name} className={className} />
  );
}

let mockCodeLanguage = CodeLanguageEnum.python;
let mockSectionType = SectionTypeEnum.Code;
let mockTextBlockFormat = TextBlockFormatEnum.Plaintext;
let mockListElementIdx = 3;
let mockIsYouTube = false;
let mockIsTwitter = false;

vi.mock("assets/icons/s-logo-only-og.svg?react", () => ({
  default: createIcon("SettaSLogo"),
}));

vi.mock("react-icons/bi", () => ({
  BiPaint: createIcon("BiPaint"),
}));

vi.mock("react-icons/fa", () => ({
  FaMarkdown: createIcon("FaMarkdown"),
  FaTerminal: createIcon("FaTerminal"),
  FaYoutube: createIcon("FaYoutube"),
}));

vi.mock("react-icons/fa6", () => ({
  FaChartPie: createIcon("FaChartPie"),
  FaLayerGroup: createIcon("FaLayerGroup"),
  FaSquareXTwitter: createIcon("FaSquareXTwitter"),
}));

vi.mock("react-icons/fi", () => ({
  FiColumns: createIcon("FiColumns"),
  FiFlag: createIcon("FiFlag"),
  FiGitMerge: createIcon("FiGitMerge"),
  FiPlay: createIcon("FiPlay"),
}));

vi.mock("react-icons/go", () => ({
  GoDotFill: createIcon("GoDotFill"),
}));

vi.mock("react-icons/io5", () => ({
  IoChatbox: createIcon("IoChatbox"),
}));

vi.mock("react-icons/md", () => ({
  MdViewKanban: createIcon("MdViewKanban"),
}));

vi.mock("react-icons/pi", () => ({
  PiTextTFill: createIcon("PiTextTFill"),
}));

vi.mock("react-icons/ri", () => ({
  RiGlobalFill: createIcon("RiGlobalFill"),
}));

vi.mock("react-icons/si", () => ({
  SiGnubash: createIcon("SiGnubash"),
  SiJavascript: createIcon("SiJavascript"),
  SiJson: createIcon("SiJson"),
  SiMarkdown: createIcon("SiMarkdown"),
  SiPython: createIcon("SiPython"),
  SiToml: createIcon("SiToml"),
  SiTypescript: createIcon("SiTypescript"),
  SiYaml: createIcon("SiYaml"),
}));

vi.mock("react-icons/tb", () => ({
  TbAdjustmentsHorizontal: createIcon("TbAdjustmentsHorizontal"),
  TbFolderFilled: createIcon("TbFolderFilled"),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: ({ title }: { title?: string }) => ({
    "data-tooltip-content": title ?? "",
  }),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => ({
    type: mockSectionType,
    codeLanguage: mockCodeLanguage,
  }),
  getCurrEffectiveSectionImplOfType: () => ({
    format: mockTextBlockFormat,
  }),
  getSectionType: () => mockSectionType,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: object) => unknown) =>
    selector({
      sections: {
        "section-1": {
          social: {},
        },
      },
    }),
}));

vi.mock("state/hooks/sectionVariants", () => ({
  useListElementIdx: () => mockListElementIdx,
}));

vi.mock("state/hooks/social", () => ({
  linkIsTwitter: () => mockIsTwitter,
  linkIsYouTube: () => mockIsYouTube,
}));

describe("HeaderIcon", () => {
  beforeEach(() => {
    mockCodeLanguage = CodeLanguageEnum.python;
    mockSectionType = SectionTypeEnum.Code;
    mockTextBlockFormat = TextBlockFormatEnum.Plaintext;
    mockListElementIdx = 3;
    mockIsYouTube = false;
    mockIsTwitter = false;
  });

  it("renders list-element badges before section-type icons", () => {
    const markup = renderToStaticMarkup(
      <HeaderIcon
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Chat}
        isInOtherProjectConfigs={false}
        isListElement
      />,
    );

    expect(markup).toContain("[3]");
    expect(markup).not.toContain('data-icon="IoChatbox"');
  });

  it("uses the current code language icon for code sections", () => {
    mockSectionType = SectionTypeEnum.Code;
    mockCodeLanguage = CodeLanguageEnum.typescript;

    const markup = renderToStaticMarkup(
      <HeaderIcon
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Code}
        isInOtherProjectConfigs={false}
        isListElement={false}
      />,
    );

    expect(markup).toContain('data-icon="SiTypescript"');
    expect(markup).toContain("text-setta-300");
  });

  it("reuses the Setta logo renderer for generated Python sections", () => {
    const codeMarkup = renderToStaticMarkup(
      <HeaderIcon
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.GenPythonCode}
        isInOtherProjectConfigs={false}
        isListElement={false}
      />,
    );
    const metadataMarkup = renderToStaticMarkup(
      <HeaderIcon
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.GenPythonMetadata}
        isInOtherProjectConfigs={false}
        isListElement={false}
      />,
    );

    expect(codeMarkup).toContain('data-icon="SettaSLogo"');
    expect(metadataMarkup).toContain('data-icon="SettaSLogo"');
  });

  it("keeps provider-specific social icons routed through the social helper", () => {
    mockIsYouTube = true;
    const youtubeMarkup = renderToStaticMarkup(
      <HeaderIcon
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Social}
        isInOtherProjectConfigs={false}
        isListElement={false}
      />,
    );

    mockIsYouTube = false;
    mockIsTwitter = true;
    const twitterMarkup = renderToStaticMarkup(
      <HeaderIcon
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Social}
        isInOtherProjectConfigs={false}
        isListElement={false}
      />,
    );

    expect(youtubeMarkup).toContain('data-icon="FaYoutube"');
    expect(twitterMarkup).toContain('data-icon="FaSquareXTwitter"');
  });

  it("applies themed classes through the shared renderer table", () => {
    const markup = renderToStaticMarkup(
      <HeaderIcon
        sectionId="section-1"
        sectionTypeName={SectionTypeEnum.Browser}
        isInOtherProjectConfigs={false}
        isListElement={false}
        hasSectionStyleTheme
      />,
    );

    expect(markup).toContain('data-icon="TbFolderFilled"');
    expect(markup).toContain("var(--setta-section-style-muted-text)");
  });
});
