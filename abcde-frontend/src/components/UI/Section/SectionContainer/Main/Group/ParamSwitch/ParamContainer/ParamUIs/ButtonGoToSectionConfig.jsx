import { isSectionUIType } from "abcde-utils/src/constants";
import { BiWrench } from "react-icons/bi";
import { goToSectionConfigTab } from "thunks/switchTabs";
import { Button } from "utils/atoms/buttons/Button";

export function ButtonGoToSectionConfig({ paramChildId, uiType }) {
  const onClick = () => goToSectionConfigTab({ paramChildId });
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
