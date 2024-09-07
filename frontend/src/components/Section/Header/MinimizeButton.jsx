import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";

export function MinimizeButton({ sectionId, twClasses, ...props }) {
  function onClick() {
    setSectionInfoAttr({
      sectionId,
      attr: "isMinimized",
      newValueFn: (x) => !x,
    });
  }

  return (
    <IconButton
      {...props}
      icon={<i className="gg-math-minus" />}
      color="text-setta-600 hover:text-white"
      bg="bg-transparent hover:bg-blue-500 justify-content-center mr-1"
      size="w-4 h-4"
      padding="p-0"
      twClasses={twClasses}
      onClick={onClick}
    />
  );
}
