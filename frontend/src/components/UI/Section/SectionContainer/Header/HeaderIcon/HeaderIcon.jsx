import C from "constants/constants.json";
import { FaTerminal } from "react-icons/fa";
import { IoLogoJavascript } from "react-icons/io";
import { RiGlobalFill } from "react-icons/ri";
import { SiGnubash, SiPython } from "react-icons/si";
import { TbArrowIteration } from "react-icons/tb";
import { useGetSectionInfo } from "state/sectionInfos/hooks/useGetSectionInfo";

export function HeaderIcon({ sectionId, sectionTypeName, classes }) {
  const codeLanguage = useGetSectionInfo(sectionId, "codeLanguage");

  switch (sectionTypeName) {
    case C.CODE:
    case C.VAR_CONTROL:
      return (
        <CodeLanguageIcon
          codeLanguage={codeLanguage}
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
    default:
      return (
        <i className="gg-menu group/card-section:hover:bg text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff] " />
      );
  }
}

function CodeLanguageIcon({ codeLanguage, classes }) {
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
