import * as ScrollArea from "@radix-ui/react-scroll-area";
import React from "react";

export const ScrollingArea = React.forwardRef(
  (
    {
      type = "auto",
      asChild = false,
      rootStyle = "",
      viewportStyle = "",
      vScrollStyle = "",
      vThumbStyle = "",
      hThumbStyle = "",
      hScrollStyle = "",
      cornerStyle = "",
      children,
    },
    ref
  ) => (
    <ScrollArea.Root type={type} className={`overflow-hidden ${rootStyle}`}>
      <ScrollArea.Viewport
        asChild={asChild}
        className={`h-full w-full [&>div]:!contents ${viewportStyle}`}
        ref={ref}
      >
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        className={`flex touch-none select-none rounded-full transition-colors duration-[160ms] ease-out data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:w-1.5 data-[orientation=horizontal]:flex-col ${vScrollStyle}`}
        orientation="vertical"
      >
        <ScrollArea.Thumb
          className={`nodrag relative flex-1 rounded-[10px] bg-slate-400 before:absolute before:top-1/2 before:left-1/2 before:h-full before:min-h-[44px] before:w-full before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:bg-slate-400 dark:opacity-20 ${vThumbStyle}`}
        />
      </ScrollArea.Scrollbar>
      <ScrollArea.Scrollbar
        className={`flex touch-none select-none rounded-full p-0.5 transition-colors duration-[160ms] ease-out  data-[orientation=horizontal]:h-2.5 data-[orientation=vertical]:w-2.5 data-[orientation=horizontal]:flex-col ${hScrollStyle}`}
        orientation="horizontal"
      >
        <ScrollArea.Thumb
          className={`relative flex-1 rounded-[10px] bg-slate-400 before:absolute before:top-1/2 before:left-1/2 before:h-full before:min-h-[44px] before:w-full before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] ${hThumbStyle}`}
        />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner className={cornerStyle} />
    </ScrollArea.Root>
  )
);
