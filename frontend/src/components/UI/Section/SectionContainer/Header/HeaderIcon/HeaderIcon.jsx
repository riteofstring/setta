import { useGetSectionInfo } from "hooks/useSectionInfo";
import { FaTerminal } from "react-icons/fa";
import { IoLogoJavascript } from "react-icons/io";
import { SiGnubash, SiPython } from "react-icons/si";
import { CODE, TERMINAL, VAR_CONTROL } from "z_utils/constants";

export function HeaderIcon({ sectionId, sectionTypeName, classes }) {
  const codeLanguage = useGetSectionInfo(sectionId, "codeLanguage");

  switch (sectionTypeName) {
    case CODE:
    case VAR_CONTROL:
      return <CodeLanguageIcon codeLanguage={codeLanguage} classes={classes} />;
    case TERMINAL:
      return <FaTerminal className={classes} />;
    default:
      return null;
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
