import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { MdOutlinePushPin } from "react-icons/md";
import { toggleCodeInfoPinned } from "state/actions/codeInfo";
import { updateParams } from "state/actions/sections/sectionContents";
import { useCodeInfo } from "state/definitions";

export function PinButton({ variants, sectionId, paramInfoId }) {
  const isPinned = useCodeInfo((x) => x.x[paramInfoId].isPinned);

  function onClick() {
    toggleCodeInfoPinned(paramInfoId);
    updateParams(sectionId);
  }

  //hover:!bg-white dark:hover:!bg-setta-900
  return (
    <IconButton
      twClasses={`section-key ${variants}`}
      size="h-3 w-3"
      icon={<MdOutlinePushPin />}
      color={` ${
        isPinned ? "[&>*]:text-setta-400" : "[&>*]:text-transparent"
      } group-hover/arg-group:[&>*]:text-setta-400 dark:group-hover/arg-group:[&>*]:text-setta-400 hover:[&>*]:!text-setta-800 dark:hover:[&>*]:!text-setta-100`}
      bg="bg-transparent dark:group-hover/arg-group:bg-setta-800/75 group-hover/arg-group:bg-setta-200/50 p-1 transition-colors duration-150 focus-visible:ring-2"
      onClick={onClick}
      tabIndex="-1"
    />
  );
}
