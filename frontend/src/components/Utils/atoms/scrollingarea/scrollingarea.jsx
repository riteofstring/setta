// import * as ScrollArea from "@radix-ui/react-scroll-area";
import React from "react";

export const ScrollingArea = React.forwardRef(
  ({ children, styles = "" }, ref) => (
    <div className={`overflow-y-scroll ${styles}`} ref={ref}>
      {children}
    </div>
  ),
);
