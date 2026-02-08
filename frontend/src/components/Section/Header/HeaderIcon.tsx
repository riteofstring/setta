import SettaSLogo from "assets/icons/s-logo-only-og.svg?react";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { BiPaint } from "react-icons/bi";
import { FaMarkdown, FaTerminal, FaYoutube } from "react-icons/fa";
import { FaChartPie, FaLayerGroup, FaSquareXTwitter } from "react-icons/fa6";
import { GoDotFill } from "react-icons/go";
import { IoChatbox } from "react-icons/io5";
import { PiTextTFill } from "react-icons/pi";
import { RiGlobalFill } from "react-icons/ri";
import {
  SiGnubash,
  SiJavascript,
  SiJson,
  SiMarkdown,
  SiPython,
  SiTypescript,
  SiYaml,
} from "react-icons/si";
import { TbAdjustmentsHorizontal, TbFolderFilled } from "react-icons/tb";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplOfType,
  getSectionType,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useListElementIdx } from "state/hooks/sectionVariants";
import { linkIsTwitter, linkIsYouTube } from "state/hooks/social";
import {
  CodeLanguageEnum,
  SectionType,
  SectionTypeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";

export function HeaderIcon({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isListElement,
  hasSectionStyleTheme = false,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isListElement: boolean;
  hasSectionStyleTheme?: boolean;
}) {
  const themedIconClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)] group-hover/group-section:text-[color:var(--setta-section-style-outline)]"
    : null;

  if (isListElement) {
    return (
      <ListElementIcon
        sectionId={sectionId}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
    );
  }

  if (isInOtherProjectConfigs) {
    return (
      <IsInOtherProjectConfigsIcon
        sectionId={sectionId}
        hasSectionStyleTheme={hasSectionStyleTheme}
      />
    );
  }

  switch (sectionTypeName) {
    case SectionTypeEnum.Code:
      return (
        <CodeLanguageIcon
          sectionId={sectionId}
          classes={
            themedIconClassName ??
            "text-setta-300 group-hover/card-section:text-blue-500 dark:group-hover/card-section:text-[#0084ff] dark:text-setta-500 transition-colors"
          }
        />
      );
    case SectionTypeEnum.GenPythonCode:
      return (
        <SettaSLogo
          className={`h-[16px] w-[16px] transition-colors [&>g>path]:fill-current [&>g>rect]:fill-current ${
            themedIconClassName ??
            "text-setta-300 group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]"
          }`}
        />
      );
    case SectionTypeEnum.GenPythonMetadata:
      return (
        <SettaSLogo
          className={`h-[16px] w-[16px] transition-colors [&>g>path]:fill-current [&>g>rect]:fill-current ${
            themedIconClassName ??
            "text-setta-300 group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]"
          }`}
        />
      );
    case SectionTypeEnum.Terminal:
      return <TerminalIcon hasSectionStyleTheme={hasSectionStyleTheme} />;
    case SectionTypeEnum.GlobalVariables:
      return (
        <RiGlobalFill
          className={
            themedIconClassName ??
            "text-setta-300 transition-colors group-hover/card-section:text-green-500  dark:text-setta-500 "
          }
        />
      );
    case SectionTypeEnum.TextBlock:
      return (
        <TextBlockIcon
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      );
    case SectionTypeEnum.Prompt:
      return <PromptIcon hasSectionStyleTheme={hasSectionStyleTheme} />;
    case SectionTypeEnum.MetaControl:
      return (
        <TbAdjustmentsHorizontal
          className={
            themedIconClassName ??
            "text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]"
          }
        />
      );
    case SectionTypeEnum.Image:
      return (
        <div className="relative">
          <i
            className={
              themedIconClassName
                ? `gg-image absolute inset-0 !scale-50 ${themedIconClassName}`
                : "gg-image absolute inset-0 !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]"
            }
          />
        </div>
      );
    case SectionTypeEnum.Draw:
      return (
        <BiPaint
          className={
            themedIconClassName ??
            "p-0 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] "
          }
        />
      );
    case SectionTypeEnum.IFrame:
      return (
        <div className="relative flex w-2 justify-center">
          <i
            className={
              themedIconClassName
                ? `gg-code-slash !rotate-[14deg] !scale-50 ${themedIconClassName}`
                : "gg-code-slash !rotate-[14deg] !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]"
            }
          />
        </div>
      );
    case SectionTypeEnum.Social:
      return (
        <SocialIcon
          sectionId={sectionId}
          hasSectionStyleTheme={hasSectionStyleTheme}
        />
      );
    case SectionTypeEnum.Group:
      return (
        <FaLayerGroup
          className={
            themedIconClassName
              ? `[&_*]:!scale-120 ${themedIconClassName}`
              : "[&_*]:!scale-120 text-setta-400 transition-colors group-hover/group-section:text-blue-600  dark:text-setta-500 dark:group-hover/group-section:text-[#0084ff]
          "
          }
        />
      );
    case SectionTypeEnum.Chart:
      return (
        <FaChartPie
          className={
            themedIconClassName ??
            "text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]
          "
          }
        />
      );
    case SectionTypeEnum.Chat:
      return (
        <IoChatbox
          className={
            themedIconClassName ??
            "text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]
          "
          }
        />
      );
    case SectionTypeEnum.Browser:
      return (
        <TbFolderFilled
          className={
            themedIconClassName ??
            "text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]
          "
          }
        />
      );
    default:
      return (
        <i
          className={
            themedIconClassName
              ? `gg-menu group/card-section:hover:bg !scale-110 ${themedIconClassName}`
              : "gg-menu group/card-section:hover:bg !scale-110 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] "
          }
        />
      );
  }
}

function IsInOtherProjectConfigsIcon({
  sectionId,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  hasSectionStyleTheme: boolean;
}) {
  const isGroup = useProjectState(
    (x) => getSectionType(sectionId, x) === SectionTypeEnum.Group,
  );

  if (hasSectionStyleTheme) {
    return (
      <i
        className={`gg-link group/card-section:hover:bg text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)] ${
          isGroup ? "-rotate-45 !scale-75" : ""
        }`}
      />
    );
  }

  return (
    <i
      className={`gg-link group/card-section:hover:bg  transition-colors group-hover/card-section:text-pink-500  dark:group-hover/card-section:text-[#ff00ff] ${isGroup ? "-rotate-45 !scale-75 text-purple-600 dark:text-purple-700" : "text-purple-500 dark:text-purple-500"}`}
    />
  );
}

function SocialIcon({
  sectionId,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  hasSectionStyleTheme: boolean;
}) {
  const { isYouTube, isTwitter } = useProjectState((x) => {
    return {
      isYouTube: linkIsYouTube(x.sections[sectionId].social),
      isTwitter: linkIsTwitter(x.sections[sectionId].social),
    };
  }, _.isEqual);

  const themedIconClassName = hasSectionStyleTheme
    ? "fill-current text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)] group-hover/group-section:text-[color:var(--setta-section-style-outline)]"
    : null;

  if (isYouTube) {
    return (
      <FaYoutube
        className={
          themedIconClassName ??
          "fill-setta-300 transition-colors group-hover/card-section:fill-blue-500 dark:fill-setta-500 dark:group-hover/card-section:fill-[#0084ff] "
        }
      />
    );
  } else if (isTwitter) {
    return (
      <FaSquareXTwitter
        className={
          themedIconClassName ??
          "fill-setta-300 transition-colors group-hover/card-section:fill-blue-500 dark:fill-setta-500 dark:group-hover/card-section:fill-[#0084ff] "
        }
      />
    );
  } else {
    return (
      <GoDotFill
        className={
          themedIconClassName ??
          "text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] "
        }
      />
    );
  }
}

function CodeLanguageIcon({ sectionId, classes }) {
  const language = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    if (impl.type === SectionTypeEnum.Code) {
      return impl.codeLanguage;
    } else if (impl.type === SectionTypeEnum.GenPythonCode) {
      return CodeLanguageEnum.python;
    } else {
      throw new Error();
    }
  });
  switch (language) {
    case CodeLanguageEnum.python:
      return <SiPython className={classes} />;
    case CodeLanguageEnum.bash:
      return <SiGnubash className={classes} />;
    case CodeLanguageEnum.javascript:
      return <SiJavascript className={classes} />;
    case CodeLanguageEnum.typescript:
      return <SiTypescript className={classes} />;
    case CodeLanguageEnum.json:
      return <SiJson className={classes} />;
    case CodeLanguageEnum.yaml:
      return <SiYaml className={classes} />;
    case CodeLanguageEnum.markdown:
      return <SiMarkdown className={classes} />;
    case CodeLanguageEnum.plaintext:
      return <PiTextTFill className={classes} />;
    default:
      return <PiTextTFill className={classes} />;
  }
}

function ListElementIcon({
  sectionId,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  hasSectionStyleTheme: boolean;
}) {
  const idx = useListElementIdx(sectionId);
  if (hasSectionStyleTheme) {
    return (
      <p className="group/card-section:hover:bg font-mono text-[9px] tracking-tighter text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)]">
        [{idx}]
      </p>
    );
  }
  return (
    <p className="group/card-section:hover:bg font-mono text-[9px] tracking-tighter text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] ">
      [{idx}]
    </p>
  );
}

function TextBlockIcon({
  sectionId,
  hasSectionStyleTheme,
}: {
  sectionId: string;
  hasSectionStyleTheme: boolean;
}) {
  const format = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return impl.format;
  });

  if (hasSectionStyleTheme) {
    return format === TextBlockFormatEnum.Markdown ? (
      <FaMarkdown className="text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)]" />
    ) : (
      <PiTextTFill className="text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)]" />
    );
  }

  return format === TextBlockFormatEnum.Markdown ? (
    <FaMarkdown className="text-transparent transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff]" />
  ) : (
    <PiTextTFill className="text-transparent transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff]" />
  );
  // <i className="gg-pen -rotate-45 !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff] " />
}

function PromptIcon({
  hasSectionStyleTheme,
}: {
  hasSectionStyleTheme: boolean;
}) {
  if (hasSectionStyleTheme) {
    return (
      <PiTextTFill className="text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)]" />
    );
  }
  return (
    <PiTextTFill className="text-transparent transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff]" />
  );
}

function TerminalIcon({
  hasSectionStyleTheme,
}: {
  hasSectionStyleTheme: boolean;
}) {
  if (hasSectionStyleTheme) {
    return (
      <FaTerminal
        className="text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)] group-hover/group-section:text-[color:var(--setta-section-style-outline)]"
        {...getFloatingBoxHandlers({ title: "Read/write terminal" })}
      />
    );
  }
  return (
    <FaTerminal
      className="text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] "
      {...getFloatingBoxHandlers({ title: "Read/write terminal" })}
    />
  );
}
