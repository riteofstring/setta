import * as Accordion from "@radix-ui/react-accordion";
import React from "react";
import { BiChevronDown } from "react-icons/bi";

export function StandardAccordion({
  rootStyles = "",
  itemStyles = "",
  triggerStyles = "",
  contentStyles = "",
  headerStyles = "",
  trigger,
  children,
  heading,
  value,
  defaultValue = value,
  type = "single",
  open = "",
}) {
  return (
    <Accordion.Root
      className={rootStyles}
      type={type}
      defaultValue={defaultValue}
      collapsible
      data-state={open}
    >
      <AccordionItem itemStyles={itemStyles} value={value}>
        <AccordionTrigger
          triggerStyles={triggerStyles}
          trigger={trigger}
          headerStyles={headerStyles}
        >
          {heading}
        </AccordionTrigger>
        <AccordionContent contentStyles={contentStyles}>
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion.Root>
  );
}

const AccordionItem = React.forwardRef(
  ({ children, itemStyles, ...props }, forwardedRef) => (
    <Accordion.Item className={itemStyles} {...props} ref={forwardedRef}>
      {children}
    </Accordion.Item>
  )
);

const AccordionTrigger = React.forwardRef(
  (
    { children, headerStyles, trigger, triggerStyles, ...props },
    forwardedRef
  ) => (
    <Accordion.Header className={headerStyles}>
      <Accordion.Trigger
        className={triggerStyles}
        {...props}
        ref={forwardedRef}
      >
        {/* {trigger} */}
        {children}
        <BiChevronDown
          className="ease-[cubic-bezier(0.87, 0, 0.13, 1)] transition-transform duration-300 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </Accordion.Trigger>
    </Accordion.Header>
  )
);

const AccordionContent = React.forwardRef(
  ({ children, contentStyles, ...props }, forwardedRef) => (
    <Accordion.Content className={contentStyles} {...props} ref={forwardedRef}>
      <div className="overflow-y-auto px-5 py-4 ">{children}</div>
    </Accordion.Content>
  )
);
