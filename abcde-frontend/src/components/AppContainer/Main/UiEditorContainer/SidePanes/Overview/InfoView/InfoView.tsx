import * as Accordion from "@radix-ui/react-accordion";
import classNames from "classnames";
import React from "react";
import { BiChevronUp } from "react-icons/bi";

export function InfoView() {
  // bg-mauve6 w-[300px]  shadow-black/5
  return (
    <Accordion.Root
      className="mt-8 rounded-md border border-solid border-white shadow-sm"
      type="single"
      defaultValue="item-1"
      collapsible
    >
      <AccordionItem value="item-1">
        <AccordionTrigger>Infoview</AccordionTrigger>
        <AccordionContent>
          Phasellus sed dictum lectus, quis vestibulum ligula. Duis vitae
          tristique sapien.
        </AccordionContent>
      </AccordionItem>
    </Accordion.Root>
  );
}

// focus-within:shadow-mauve12 mt-px  first:mt-0 first:rounded-t last:rounded-b focus-within:shadow-[0_0_0_2px]
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

// text-violet11 shadow-mauve6 shadow-[0_1px_0]

const AccordionTrigger = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Header className="flex">
      <Accordion.Trigger
        className={classNames(
          "group flex h-11 flex-1 cursor-default items-center justify-between overflow-hidden rounded-md bg-white px-5 font-heading text-xs font-bold uppercase leading-none tracking-widest text-slate-400 shadow-sm outline-none transition-all hover:cursor-pointer hover:bg-slate-500 hover:text-white",
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

// text-mauve11 bg-mauve2

const AccordionContent = React.forwardRef(
  ({ children, className, ...props }, forwardedRef) => (
    <Accordion.Content
      className={classNames(
        "h-36 overflow-hidden rounded-b-md bg-slate-200  text-xs data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp",
        className
      )}
      {...props}
      ref={forwardedRef}
    >
      <div className="max-h-full overflow-y-auto py-4 px-5 ">{children}</div>
    </Accordion.Content>
  )
);
