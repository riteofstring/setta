import { StandardAccordion } from "components/Utils/atoms/accordion/accordion";
import { StandardCollapsible } from "components/Utils/atoms/collapsible/collapsible";

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
  // my-4
  return (
    <StandardAccordion
      rootStyles="w-full"
      itemStyles="focus-within:relative focus-within:z-10"
      headerStyles="flex flex-1 cursor-default items-center justify-between mb-2"
      triggerStyles="flex w-full items-center outline-none hover:cursor-pointer rounded-md"
      contentStyles="rounded-xl text-xs data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp bg-[rgba(226,_232,_240,_0.2)] overflow-hidden"
      heading={heading}
      value={value}
      defaultValue={defaultValue}
      data-state={open}
    >
      {children}
    </StandardAccordion>
  );
}

function CardCollapsible({ heading, value, open, children }) {
  return (
    <StandardCollapsible
      rootStyles="w-full"
      triggerStyles="group flex outline-none transition-all hover:cursor-pointer hover:bg-setta-200 dark:hover:bg-setta-700  hover:shadow-sm hover:text-white rounded-full"
      contentStyles="rounded-xl text-xs data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp"
      heading={heading}
      value={value}
      open={open}
    >
      {children}
    </StandardCollapsible>
  );
}
