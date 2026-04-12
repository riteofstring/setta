import SettaSLogo from "assets/icons/s-logo-only-og.svg?react";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import type { ComponentType } from "react";
import { BiPaint } from "react-icons/bi";
import { FaMarkdown, FaTerminal, FaYoutube } from "react-icons/fa";
import { FaChartPie, FaLayerGroup, FaSquareXTwitter } from "react-icons/fa6";
import { FiColumns, FiFlag, FiGitMerge, FiPlay } from "react-icons/fi";
import { GoDotFill } from "react-icons/go";
import { IoChatbox } from "react-icons/io5";
import { MdViewKanban } from "react-icons/md";
import { PiTextTFill } from "react-icons/pi";
import { RiGlobalFill } from "react-icons/ri";
import {
  SiGnubash,
  SiJavascript,
  SiJson,
  SiMarkdown,
  SiPython,
  SiToml,
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

type HeaderIconProps = {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isListElement: boolean;
  hasSectionStyleTheme?: boolean;
};

type HeaderIconRenderProps = {
  sectionId: string;
  hasSectionStyleTheme: boolean;
  themedIconClassName: string | null;
};

type HeaderIconRenderer = (props: HeaderIconRenderProps) => JSX.Element;

const themedHeaderIconClassName =
  "text-[color:var(--setta-section-style-muted-text)] transition-colors group-hover/card-section:text-[color:var(--setta-section-style-outline)] group-hover/group-section:text-[color:var(--setta-section-style-outline)]";
const defaultBlueHeaderIconClassName =
  "text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]";
const defaultGlobalHeaderIconClassName =
  "text-setta-300 transition-colors group-hover/card-section:text-green-500  dark:text-setta-500 ";
const defaultChatHeaderIconClassName =
  "text-setta-600 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-300 dark:group-hover/card-section:text-[#0084ff]";
const defaultGroupHeaderIconClassName =
  "[&_*]:!scale-120 text-setta-400 transition-colors group-hover/group-section:text-blue-600 dark:text-setta-500 dark:group-hover/group-section:text-[#0084ff]";
const settaLogoClassName =
  "h-[16px] w-[16px] transition-colors [&>g>path]:fill-current [&>g>rect]:fill-current";

const renderSimpleHeaderIcon =
  (
    Icon: ComponentType<{
      className?: string;
    }>,
    defaultClassName: string,
  ): HeaderIconRenderer =>
  ({ themedIconClassName }) => (
    <Icon
      className={resolveHeaderIconClassName(
        themedIconClassName,
        defaultClassName,
      )}
    />
  );

const renderSettaLogo: HeaderIconRenderer = ({ themedIconClassName }) => (
  <SettaSLogo
    className={`${settaLogoClassName} ${resolveHeaderIconClassName(
      themedIconClassName,
      defaultBlueHeaderIconClassName,
    )}`}
  />
);

const renderCodeLanguageIcon: HeaderIconRenderer = ({
  sectionId,
  themedIconClassName,
}) => (
  <CodeLanguageIcon
    sectionId={sectionId}
    classes={resolveHeaderIconClassName(
      themedIconClassName,
      defaultBlueHeaderIconClassName,
    )}
  />
);

const renderTextBlockIcon: HeaderIconRenderer = ({
  sectionId,
  hasSectionStyleTheme,
}) => (
  <TextBlockIcon
    sectionId={sectionId}
    hasSectionStyleTheme={hasSectionStyleTheme}
  />
);

const renderPromptIcon: HeaderIconRenderer = ({ hasSectionStyleTheme }) => (
  <PromptIcon hasSectionStyleTheme={hasSectionStyleTheme} />
);

const renderTerminalIcon: HeaderIconRenderer = ({ hasSectionStyleTheme }) => (
  <TerminalIcon hasSectionStyleTheme={hasSectionStyleTheme} />
);

const renderSocialIcon: HeaderIconRenderer = ({
  sectionId,
  hasSectionStyleTheme,
}) => (
  <SocialIcon
    sectionId={sectionId}
    hasSectionStyleTheme={hasSectionStyleTheme}
  />
);

const renderImageIcon: HeaderIconRenderer = ({ themedIconClassName }) => (
  <div className="relative">
    <i
      className={
        themedIconClassName
          ? `gg-image absolute inset-0 !scale-50 ${themedIconClassName}`
          : `gg-image absolute inset-0 !scale-50 ${defaultBlueHeaderIconClassName}`
      }
    />
  </div>
);

const renderIFrameIcon: HeaderIconRenderer = ({ themedIconClassName }) => (
  <div className="relative flex w-2 justify-center">
    <i
      className={
        themedIconClassName
          ? `gg-code-slash !rotate-[14deg] !scale-50 ${themedIconClassName}`
          : `gg-code-slash !rotate-[14deg] !scale-50 ${defaultBlueHeaderIconClassName}`
      }
    />
  </div>
);

const renderGroupIcon: HeaderIconRenderer = ({ themedIconClassName }) => (
  <FaLayerGroup
    className={
      themedIconClassName
        ? `[&_*]:!scale-120 ${themedIconClassName}`
        : defaultGroupHeaderIconClassName
    }
  />
);

const renderDefaultHeaderIcon: HeaderIconRenderer = ({
  themedIconClassName,
}) => (
  <i
    className={
      themedIconClassName
        ? `gg-menu group/card-section:hover:bg !scale-110 ${themedIconClassName}`
        : `gg-menu group/card-section:hover:bg !scale-110 ${defaultBlueHeaderIconClassName} `
    }
  />
);

const headerIconRenderers = {
  [SectionTypeEnum.Code]: renderCodeLanguageIcon,
  [SectionTypeEnum.GenPythonCode]: renderSettaLogo,
  [SectionTypeEnum.GenPythonMetadata]: renderSettaLogo,
  [SectionTypeEnum.Terminal]: renderTerminalIcon,
  [SectionTypeEnum.GlobalVariables]: renderSimpleHeaderIcon(
    RiGlobalFill,
    defaultGlobalHeaderIconClassName,
  ),
  [SectionTypeEnum.TextBlock]: renderTextBlockIcon,
  [SectionTypeEnum.Prompt]: renderPromptIcon,
  [SectionTypeEnum.MetaControl]: renderSimpleHeaderIcon(
    TbAdjustmentsHorizontal,
    defaultBlueHeaderIconClassName,
  ),
  [SectionTypeEnum.Image]: renderImageIcon,
  [SectionTypeEnum.Draw]: renderSimpleHeaderIcon(
    BiPaint,
    `p-0 ${defaultBlueHeaderIconClassName} `,
  ),
  [SectionTypeEnum.IFrame]: renderIFrameIcon,
  [SectionTypeEnum.Social]: renderSocialIcon,
  [SectionTypeEnum.Group]: renderGroupIcon,
  [SectionTypeEnum.Chart]: renderSimpleHeaderIcon(
    FaChartPie,
    defaultBlueHeaderIconClassName,
  ),
  [SectionTypeEnum.Chat]: renderSimpleHeaderIcon(
    IoChatbox,
    defaultChatHeaderIconClassName,
  ),
  [SectionTypeEnum.Browser]: renderSimpleHeaderIcon(
    TbFolderFilled,
    defaultBlueHeaderIconClassName,
  ),
  [SectionTypeEnum.TaskBoard]: renderSimpleHeaderIcon(
    MdViewKanban,
    defaultBlueHeaderIconClassName,
  ),
  [SectionTypeEnum.Spreadsheet]: renderSimpleHeaderIcon(
    FiColumns,
    defaultBlueHeaderIconClassName,
  ),
  [SectionTypeEnum.StateMachineStart]: renderSimpleHeaderIcon(
    FiPlay,
    defaultBlueHeaderIconClassName,
  ),
  [SectionTypeEnum.StateMachineGate]: renderSimpleHeaderIcon(
    FiGitMerge,
    defaultBlueHeaderIconClassName,
  ),
  [SectionTypeEnum.StateMachineEnd]: renderSimpleHeaderIcon(
    FiFlag,
    defaultBlueHeaderIconClassName,
  ),
} satisfies Partial<Record<SectionType, HeaderIconRenderer>>;

function resolveHeaderIconClassName(
  themedIconClassName: string | null,
  defaultClassName: string,
) {
  return themedIconClassName ?? defaultClassName;
}

export function HeaderIcon({
  sectionId,
  sectionTypeName,
  isInOtherProjectConfigs,
  isListElement,
  hasSectionStyleTheme = false,
}: HeaderIconProps) {
  const themedIconClassName = hasSectionStyleTheme
    ? themedHeaderIconClassName
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

  const renderIcon =
    headerIconRenderers[sectionTypeName] ?? renderDefaultHeaderIcon;
  return renderIcon({
    sectionId,
    hasSectionStyleTheme,
    themedIconClassName,
  });
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
    case CodeLanguageEnum.toml:
      return <SiToml className={classes} />;
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
