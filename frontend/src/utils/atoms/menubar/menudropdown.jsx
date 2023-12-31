import * as Menubar from "@radix-ui/react-menubar";

export function MenuDropdown({
  trigger,
  align = "start",
  sideOffset = 5,
  alignOffset = -3,
  contentStyle = "",
  triggerStyle = "",
  children,
}) {
  // `text-violet11 data-[highlighted]:bg-violet4 data-[state=open]:bg-violet4 flex select-none items-center justify-between gap-[2px] rounded text-[13px] font-medium leading-none outline-none

  // min-w-[220px] rounded-md bg-white p-[5px] shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] will-change-[transform,opacity] [animation-duration:_400ms] [animation-timing-function:_cubic-bezier(0.16,_1,_0.3,_1)]

  // bg-white      select-none
  return (
    <Menubar.Menu>
      <Menubar.Trigger
        className={`nodrag flex cursor-pointer select-none items-center justify-between gap-1 rounded-md py-1 px-2 text-xs font-semibold leading-none text-runcoder-700 outline-none transition-colors duration-150 hover:bg-runcoder-100 focus-visible:ring-2 dark:text-runcoder-200 dark:hover:bg-runcoder-900 ${triggerStyle}`}
      >
        {trigger}
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content
          className={`z-20 min-w-[200px] rounded-md border border-solid border-runcoder-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-runcoder-800  dark:bg-runcoder-900 ${contentStyle}`}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
        >
          {children}
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}
