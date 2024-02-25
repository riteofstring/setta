import * as Menubar from "@radix-ui/react-menubar";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { PiBracketsCurlyBold } from "react-icons/pi";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";
import { CODE } from "z_utils/constants";

function CodeLanguageSelection({ sectionId, sectionTypeName }) {
  const codeLanguage = useGetSectionInfo(sectionId, "codeLanguage");

  function onClick(v) {
    useSectionInfos
      .getState()
      .setSectionInfoAttr({ sectionId, attr: "codeLanguage", value: v });
  }

  return (
    sectionTypeName === CODE && (
      <Menubar.Root>
        <MenuDropdown
          padding="p-1"
          rounded="rounded-full"
          triggerStyle="ml-1"
          trigger={<PiBracketsCurlyBold />}
        >
          {getCodeLanguages().map((x, idx) => (
            <MenuItem key={idx} onClick={() => onClick(x.codeLanguage)}>
              {codeLanguage === x.codeLanguage ? (
                <div className="font-bold">{x.display}</div>
              ) : (
                x.display
              )}
            </MenuItem>
          ))}
        </MenuDropdown>
      </Menubar.Root>
    )
  );
}

export default CodeLanguageSelection;

function getCodeLanguages() {
  return [
    { display: "Python", codeLanguage: "python" },
    { display: "Javascript", codeLanguage: "javascript" },
    { display: "Bash", codeLanguage: "bash" },
  ];
}
