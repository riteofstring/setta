import * as Accordion from "@radix-ui/react-accordion";
import classNames from "classnames";
import { useCurrInfoView } from "models/info/infoView";
import React from "react";
import { BiChevronUp } from "react-icons/bi";

export function InfoView() {
  const currInfoView = useCurrInfoView();

  // replace with accordion atom
  return (
    <Accordion.Root
      className="mt-8 rounded-md border border-solid border-white shadow-sm dark:border-runcoder-800"
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
        className
      )}
      {...props}
      ref={forwardedRef}
    >
      {children}
    </Accordion.Item>
  )
);

const AccordionTrigger = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Header className="flex">
      <Accordion.Trigger
        className={classNames(
          "group flex h-11 flex-1 cursor-default items-center justify-between overflow-hidden rounded-md bg-white px-5 font-heading text-xs font-bold uppercase leading-none tracking-widest text-slate-400 shadow-sm outline-none transition-all hover:cursor-pointer hover:bg-slate-500 hover:text-white dark:bg-runcoder-800",
          className
        )}
        {...props}
        ref={forwardedRef}
      >
        {children}
        <BiChevronUp
          className="ease-[cubic-bezier(0.87, 0, 0.13, 1)] transition-transform duration-300 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </Accordion.Trigger>
    </Accordion.Header>
  )
);

const AccordionContent = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Content
      className={classNames(
        "h-36 overflow-hidden rounded-b-md bg-slate-200 text-xs  data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp dark:bg-runcoder-900",
        className
      )}
      {...props}
      ref={forwardedRef}
    >
      <aside className="max-h-full py-4 px-5 dark:text-runcoder-300">
        {children}
      </aside>
    </Accordion.Content>
  )
);
