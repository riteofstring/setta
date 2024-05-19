import { useGetSectionInfo } from "hooks/useSectionInfo";
import { FaTerminal } from "react-icons/fa";
import { IoLogoJavascript } from "react-icons/io";
import { RiGlobalFill } from "react-icons/ri";
import { SiGnubash, SiPython } from "react-icons/si";
import { TbArrowIteration } from "react-icons/tb";
import {
  CODE,
  GLOBAL_PARAM_SWEEP,
  GLOBAL_VARIABLES,
  PARAM_SWEEP,
  TERMINAL,
  VAR_CONTROL,
} from "z_utils/constants";

export function HeaderIcon({ sectionId, sectionTypeName, classes }) {
  const codeLanguage = useGetSectionInfo(sectionId, "codeLanguage");

  switch (sectionTypeName) {
    case CODE:
    case VAR_CONTROL:
      return (
        <CodeLanguageIcon
          codeLanguage={codeLanguage}
          classes="text-runcoder-300 dark:text-runcoder-400/50 group-hover/card-section:text-blue-500 dark:text-runcoder-500  transition-colors"
        />
      );
    case TERMINAL:
      return (
        <FaTerminal className="text-runcoder-300 transition-colors group-hover/card-section:text-blue-500 dark:text-runcoder-400/50 dark:text-runcoder-500 " />
      );
    case GLOBAL_PARAM_SWEEP:
    case GLOBAL_VARIABLES:
      return (
        <RiGlobalFill className="text-runcoder-300 transition-colors group-hover/card-section:text-green-500 dark:text-runcoder-400/50 dark:text-runcoder-500 " />
      );
    case PARAM_SWEEP:
      return (
        <TbArrowIteration className="text-runcoder-300 transition-colors group-hover/card-section:text-blue-500 dark:text-runcoder-400/50 dark:text-runcoder-500 " />
      );
    default:
      return (
        <i className="gg-menu group/card-section:hover:bg text-runcoder-300 transition-colors group-hover/card-section:text-blue-500 dark:text-runcoder-500 " />
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
