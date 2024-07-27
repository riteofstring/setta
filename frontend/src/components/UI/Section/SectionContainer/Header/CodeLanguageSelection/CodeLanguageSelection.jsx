import * as Menubar from "@radix-ui/react-menubar";
import C from "constants/constants.json";
import { PiBracketsCurlyBold } from "react-icons/pi";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useGetSectionInfo } from "state/hooks/useGetSectionInfo";
import { MenuDropdown } from "utils/atoms/menubar/menudropdown";
import { MenuItem } from "utils/atoms/menubar/menudropdownitem";

function CodeLanguageSelection({ sectionId, sectionTypeName }) {
  const codeLanguage = useGetSectionInfo(sectionId, "codeLanguage");

  function onClick(v) {
    setSectionInfoAttr({ sectionId, attr: "codeLanguage", value: v });
  }

  return (
    sectionTypeName === C.CODE && (
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
