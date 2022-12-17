import React from "react";
import Button from "./Button";

export const twClasses =
  "bg-white hover:bg-gray-100 text-xs font-bold text-gray-700 py-1 px-2 rounded-md gap-1 select-none";

export default React.forwardRef(({ children, ...theRest }, ref) => {
  return (
    <Button tailwindClasses={twClasses} {...theRest} ref={ref}>
      {children}
    </Button>
  );
});
