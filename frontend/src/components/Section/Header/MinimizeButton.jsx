import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
export function MinimizeButton({ sectionId, twClasses, ...props }) {
  // replace tempClick with real code:
  const [tempClick, setTempClick] = useState(false);
  function onClick() {
    setSectionInfoAttr({
      sectionId,
      attr: "isMinimized",
      newValueFn: (x) => !x,
    });
    setTempClick(!tempClick);
  }

  return (
    <IconButton
      {...props}
      icon={
        !tempClick ? (
          <i className="gg-math-minus" />
        ) : (
          <i className="gg-maximize !scale-[.4]" />
        )
      }
      color="text-setta-600 hover:text-white"
      bg="bg-transparent hover:bg-blue-500 justify-content-center mr-1"
      size="w-4 h-4"
      padding="p-0"
      twClasses={twClasses}
      onClick={onClick}
    />
  );
}
