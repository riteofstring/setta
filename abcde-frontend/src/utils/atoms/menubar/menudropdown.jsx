import * as Menubar from "@radix-ui/react-menubar";

export function MenuDropDown({
  trigger,
  align = start,
  sideOffset = 5,
  alignOffset = -3,
  contentStyle,
  triggerStyle,
  children,
}) {
  return (
    <>
      <Menubar.Trigger
        className={`text-violet11 data-[highlighted]:bg-violet4 data-[state=open]:bg-violet4 flex select-none items-center justify-between gap-[2px] rounded py-2 px-3 text-[13px] font-medium leading-none outline-none ${triggerStyle}`}
      >
        {trigger}
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content
          className={`min-w-[220px] rounded-md bg-white p-[5px] shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] will-change-[transform,opacity] [animation-duration:_400ms] [animation-timing-function:_cubic-bezier(0.16,_1,_0.3,_1)] ${contentStyle}`}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
        >
          {children}
        </Menubar.Content>
      </Menubar.Portal>
    </>
  );
}
