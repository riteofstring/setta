import { forwardRef } from "react";
import { Button } from "./Button";

export const StandardButton = forwardRef((props, ref) => {
  const { children, ...theRest } = props;
  return (
    <Button
      twClasses="bg-gray-50 hover:bg-gray-200 white font-bold py-2 px-4 rounded-full gap-1"
      {...theRest}
    >
      {children}
    </Button>
  );
});
