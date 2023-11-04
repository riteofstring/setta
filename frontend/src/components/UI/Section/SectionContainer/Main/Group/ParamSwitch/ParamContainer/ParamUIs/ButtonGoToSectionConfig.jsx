import { BiWrench } from "react-icons/bi";
import { goToSectionConfigTab } from "thunks/switchTabs";
import { Button } from "utils/atoms/buttons/Button";
import { isSectionUIType } from "z_utils/constants";

export function ButtonGoToSectionConfig({ sectionId, paramInfoId, uiType }) {
  const onClick = () => goToSectionConfigTab({ sectionId, paramInfoId });
  return (
    <>
      {isSectionUIType(uiType) && (
        <Button
          twClasses="mt-2 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-900 dark:hover-text-slate-300 py-1 px-2 rounded-md gap-1 select-none mr-2 self-start"
          onClick={onClick}
        >
          <BiWrench /> Configure
        </Button>
      )}
    </>
  );
}
