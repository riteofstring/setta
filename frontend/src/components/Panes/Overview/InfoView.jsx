import * as Accordion from "@radix-ui/react-accordion";
import classNames from "classnames";
import React from "react";
import { BiChevronUp } from "react-icons/bi";
import { useCurrInfoView } from "state/hooks/infoView";

export function InfoView() {
  const currInfoView = useCurrInfoView();

  // replace with accordion atom
  return (
    <Accordion.Root
      className="mt-8 rounded-md border border-solid border-white shadow-sm dark:border-setta-800"
      type="single"
      defaultValue="item-1"
      collapsible
      asChild
    >
      <aside>
        <AccordionItem value="item-1">
          <AccordionTrigger>Quick Help</AccordionTrigger>
          <AccordionContent>{currInfoView}</AccordionContent>
        </AccordionItem>
      </aside>
    </Accordion.Root>
  );
}

const AccordionItem = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Item
      className={classNames(
        "focus-within:relative focus-within:z-10",
        className,
      )}
      {...props}
      ref={forwardedRef}
    >
      {children}
    </Accordion.Item>
  ),
);

const AccordionTrigger = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Header className="flex">
      <Accordion.Trigger
        className={classNames(
          "group flex h-11 flex-1 cursor-default items-center justify-between overflow-hidden rounded-md bg-white px-5 font-heading text-xs font-bold uppercase leading-none tracking-widest text-setta-400 shadow-sm outline-none transition-all hover:cursor-pointer hover:bg-setta-500 hover:text-white dark:bg-setta-800",
          className,
        )}
        {...props}
        ref={forwardedRef}
      >
        {children}
        <BiChevronUp className="ease-[cubic-bezier(0.87, 0, 0.13, 1)] transition-transform duration-300 group-data-[state=open]:rotate-180" />
      </Accordion.Trigger>
    </Accordion.Header>
  ),
);

const AccordionContent = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Content
      className={classNames(
        "h-36 overflow-hidden rounded-b-md bg-setta-100 text-sm  data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown dark:bg-setta-900",
        className,
      )}
      {...props}
      ref={forwardedRef}
    >
      <aside className="max-h-full overflow-ellipsis px-5 py-4 dark:text-setta-300">
        {children}
      </aside>
    </Accordion.Content>
  ),
);
