import { isSectionUIType } from "abcde-utils/src/constants";
import { useActiveSection } from "models/activeSection";
import { SECTION_CONFIG_TAB, useUIEditor } from "models/uiEditor";
import { BiWrench } from "react-icons/bi";
import { Button } from "utils/atoms/buttons/Button";

export function ButtonGoToSectionConfig({ paramChildId, uiType }) {
  const setTab = useUIEditor((x) => x.setTab);
  const setActiveSection = useActiveSection((x) => x.setId);
  const setCameFromUIConfig = useUIEditor((x) => x.setCameFromUIConfig);

  const onClick = () => {
    if (paramChildId) {
      setActiveSection(paramChildId);
      setCameFromUIConfig(true);
      setTab(SECTION_CONFIG_TAB);
    }
  };
  return (
    <>
      {isSectionUIType(uiType) && (
        <Button
          twClasses="mt-2 text-xs text-gray-600 hover:bg-gray-200 hover:text-gray-900 py-1 px-2 rounded-md gap-1 select-none mr-2 self-start"
          onClick={onClick}
        >
          <BiWrench /> Configure
        </Button>
      )}
    </>
  );
}
