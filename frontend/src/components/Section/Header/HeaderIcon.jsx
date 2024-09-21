import C from "constants/constants.json";
import { BiPaint } from "react-icons/bi";
import { FaTerminal } from "react-icons/fa";
import { IoLogoJavascript } from "react-icons/io";
import { RiGlobalFill } from "react-icons/ri";
import { SiGnubash, SiPython } from "react-icons/si";
import { TbArrowIteration } from "react-icons/tb";
import { useGetSectionInfo } from "state/hooks/sections";
import { useListElementIdx } from "state/hooks/sectionVariants";
import { useIsListElement } from "state/hooks/uiTypes";

export function HeaderIcon({
  sectionId,
  sectionTypeName,
  classes,
  isInOtherProjectConfigs,
}) {
  const isListElement = useIsListElement(sectionId);

  if (isListElement) {
    return <ListElementIcon sectionId={sectionId} />;
  }

  if (isInOtherProjectConfigs) {
    return (
      <i className="gg-link group/card-section:hover:bg text-purple-500 transition-colors group-hover/card-section:text-pink-500 dark:text-purple-500 dark:group-hover/card-section:text-[#ff00ff]" />
    );
  }

  switch (sectionTypeName) {
    case C.CODE:
    case C.INTERACTIVE_CODE:
      return (
        <CodeLanguageIcon
          sectionId={sectionId}
          classes="text-setta-300 dark:text-setta-400/50 group-hover/card-section:text-blue-500 dark:group-hover/card-section:text-[#0084ff] dark:text-setta-500  transition-colors"
        />
      );
    case C.TERMINAL:
      return (
        <FaTerminal className="text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-400/50 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
    case C.GLOBAL_PARAM_SWEEP:
    case C.GLOBAL_VARIABLES:
      return (
        <RiGlobalFill className="text-setta-300 transition-colors group-hover/card-section:text-green-500 dark:text-setta-400/50 dark:text-setta-500 " />
      );
    case C.PARAM_SWEEP:
      return (
        <TbArrowIteration className="text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-400/50 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
    case C.INFO:
      return (
        <i className="gg-pen -rotate-45 !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:text-transparent dark:group-hover/card-section:text-[#0084ff] " />
      );
    case C.ARTIFACT:
      return (
        <i className="gg-image !scale-50 text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
    case C.DRAW:
      return (
        <BiPaint className="text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
    default:
      return (
        <i className="gg-menu group/card-section:hover:bg text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
  }
}

function CodeLanguageIcon({ sectionId, classes }) {
  const codeLanguage = useGetSectionInfo(sectionId, "codeLanguage");
  switch (codeLanguage) {
    case "python":
      return <SiPython className={classes} />;
    case "javascript":
      return <IoLogoJavascript className={classes} />;
    case "bash":
      return <SiGnubash className={classes} />;
    default:
      return null;
  }
}

function ListElementIcon({ sectionId }) {
  const idx = useListElementIdx(sectionId);
  return `[${idx}]`;
}
