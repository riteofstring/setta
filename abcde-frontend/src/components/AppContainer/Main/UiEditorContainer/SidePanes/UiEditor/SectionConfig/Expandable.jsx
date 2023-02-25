import { StandardAccordion } from "utils/atoms/accordion/accordion";
import { StandardCollapsible } from "utils/atoms/collapsible/collapsible";

export function Expandable({
  heading,
  value,
  defaultValue,
  open,
  children,
  accordion = true,
}) {
  if (accordion) {
    return (
      <CardAccordion
        heading={heading}
        value={value}
        defaultValue={defaultValue}
      >
        {children}
      </CardAccordion>
    );
  }
  return (
    <CardCollapsible heading={heading} value={value} open={open}>
      {children}
    </CardCollapsible>
  );
}

function CardAccordion({ heading, value, defaultValue, open, children }) {
  return (
    <StandardAccordion
      rootStyles="w-full"
      itemStyles="focus-within:relative focus-within:z-10"
      headerStyles="flex flex-1 cursor-default items-center justify-between overflow-hidden"
      triggerStyles="group flex outline-none transition-all hover:cursor-pointer hover:bg-slate-200 hover:shadow-sm hover:text-white rounded-full"
      contentStyles="my-4 rounded-xl text-xs data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp bg-[rgba(226,_232,_240,_0.2)] overflow-auto max-h-[400px]"
      heading={heading}
      value={value}
      defaultValue={defaultValue}
      data-state={open}
    >
      {children}
    </StandardAccordion>
  );
}

function CardCollapsible({ heading, value, defaultValue, open, children }) {
  return (
    <StandardCollapsible
      rootStyles="w-full"
      triggerStyles="group flex outline-none transition-all hover:cursor-pointer hover:bg-slate-200  hover:shadow-sm hover:text-white rounded-full"
      contentStyles="rounded-xl text-xs data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp"
      heading={heading}
      value={value}
      open={open}
    >
      {children}
    </StandardCollapsible>
  );
}
