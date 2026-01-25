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
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  isInOtherProjectConfigs: boolean;
  isListElement: boolean;
}) {
  if (isListElement) {
    return <ListElementIcon sectionId={sectionId} />;
  }

  if (isInOtherProjectConfigs) {
    return <IsInOtherProjectConfigsIcon sectionId={sectionId} />;
  }

  switch (sectionTypeName) {
    case SectionTypeEnum.Code:
      return (
        <CodeLanguageIcon
          sectionId={sectionId}
          classes="text-setta-300 group-hover/card-section:text-blue-500 dark:group-hover/card-section:text-[#0084ff] dark:text-setta-500 transition-colors"
        />
      );
    case SectionTypeEnum.GenPythonCode:
      return (
        <SettaSLogo className="h-[16px] w-[16px] text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] [&>g>path]:fill-current [&>g>rect]:fill-current" />
      );
    case SectionTypeEnum.GenPythonMetadata:
      return (
        <SettaSLogo className="h-[16px] w-[16px] text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] [&>g>path]:fill-current [&>g>rect]:fill-current" />
      );
    case SectionTypeEnum.Terminal:
      return <TerminalIcon sectionId={sectionId} />;
    case SectionTypeEnum.GlobalVariables:
      return (
        <RiGlobalFill className="text-setta-300 transition-colors group-hover/card-section:text-green-500  dark:text-setta-500 " />
      );
    case SectionTypeEnum.TextBlock:
      return <TextBlockIcon sectionId={sectionId} />;
    case SectionTypeEnum.Prompt:
      return <TextBlockIcon sectionId={sectionId} />;
    case SectionTypeEnum.MetaControl:
      return (
        <TbAdjustmentsHorizontal className="text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]" />
      );
    case SectionTypeEnum.Image:
      return (
        <div className="relative">
          <i className="gg-image absolute inset-0 !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]" />
        </div>
      );
    case SectionTypeEnum.Draw:
      return (
        <BiPaint className="p-0 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
    case SectionTypeEnum.IFrame:
      return (
        <div className="relative flex w-2 justify-center">
          <i className="gg-code-slash !rotate-[14deg] !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]" />
        </div>
      );
    case SectionTypeEnum.Social:
      return <SocialIcon sectionId={sectionId} />;
    case SectionTypeEnum.Group:
      return (
        <FaLayerGroup
          className="[&_*]:!scale-120 text-setta-400 transition-colors group-hover/group-section:text-blue-600  dark:text-setta-500 dark:group-hover/group-section:text-[#0084ff]
          "
        />
      );
    case SectionTypeEnum.Chart:
      return (
        <FaChartPie
          className="text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]
          "
        />
      );
    case SectionTypeEnum.Chat:
      return (
        <IoChatbox
          className="text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]
          "
        />
      );
    case SectionTypeEnum.Browser:
      return (
        <TbFolderFilled
          className="text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]
          "
        />
      );
    default:
      return (
        <i className="gg-menu group/card-section:hover:bg !scale-110 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
  }
}

function IsInOtherProjectConfigsIcon({ sectionId }) {
  const isGroup = useProjectState(
    (x) => getSectionType(sectionId, x) === SectionTypeEnum.Group,
  );

  return (
    <i
      className={`gg-link group/card-section:hover:bg  transition-colors group-hover/card-section:text-pink-500  dark:group-hover/card-section:text-[#ff00ff] ${isGroup ? "-rotate-45 !scale-75 text-purple-600 dark:text-purple-700" : "text-purple-500 dark:text-purple-500"}`}
    />
  );
}

function SocialIcon({ sectionId }) {
  const { isYouTube, isTwitter } = useProjectState((x) => {
    return {
      isYouTube: linkIsYouTube(x.sections[sectionId].social),
      isTwitter: linkIsTwitter(x.sections[sectionId].social),
    };
  }, _.isEqual);

  if (isYouTube) {
    return (
      <FaYoutube className="fill-setta-300 transition-colors group-hover/card-section:fill-blue-500 dark:fill-setta-500 dark:group-hover/card-section:fill-[#0084ff] " />
    );
  } else if (isTwitter) {
    return (
      <FaSquareXTwitter className="fill-setta-300 transition-colors group-hover/card-section:fill-blue-500 dark:fill-setta-500 dark:group-hover/card-section:fill-[#0084ff] " />
    );
  } else {
    return (
      <GoDotFill className="text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
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

function ListElementIcon({ sectionId }: { sectionId: string }) {
  const idx = useListElementIdx(sectionId);
  return (
    <p className="group/card-section:hover:bg font-mono text-[9px] tracking-tighter text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] ">
      [{idx}]
    </p>
  );
}

function TextBlockIcon({ sectionId }) {
  const format = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.TextBlock,
    );
    return impl.format;
  });

  return format === TextBlockFormatEnum.Markdown ? (
    <FaMarkdown className="text-transparent transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff]" />
  ) : (
    <PiTextTFill className="text-transparent transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff]" />
  );
  // <i className="gg-pen -rotate-45 !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff] " />
}

function TerminalIcon({ sectionId }) {
  return (
    <FaTerminal
      className="text-setta-300 transition-colors group-hover/card-section:text-blue-500  dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] "
      {...getFloatingBoxHandlers({ title: "Read/write terminal" })}
    />
  );
}
