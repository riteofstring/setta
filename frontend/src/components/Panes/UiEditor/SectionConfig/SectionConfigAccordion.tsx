import * as Accordion from "@radix-ui/react-accordion";
import React from "react";

export type SectionConfigAccordionItem = {
  value: string;
  title: string;
  triggerTestId: string;
  content: React.ReactNode;
};

export function SectionConfigAccordion({
  items,
  defaultOpenValues,
}: {
  items: Array<SectionConfigAccordionItem>;
  defaultOpenValues: Array<string>;
}) {
  return (
    <Accordion.Root
      type="multiple"
      defaultValue={defaultOpenValues}
      className="flex min-h-0 flex-col gap-2"
    >
      {items.map((item) => (
        <Accordion.Item
          key={item.value}
          value={item.value}
          className="overflow-hidden rounded-lg border border-setta-200/80 bg-white/85 dark:border-setta-800/80 dark:bg-setta-900/70"
        >
          <Accordion.Header>
            <Accordion.Trigger
              data-testid={item.triggerTestId}
              className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-setta-600 transition-colors hover:bg-setta-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-setta-300 dark:hover:bg-setta-800/80 [&[data-state=open]_.section-config-accordion-chevron]:rotate-180"
            >
              <span className="truncate">{item.title}</span>
              <i className="gg-chevron-down section-config-accordion-chevron !scale-[0.6] text-setta-400 transition-transform duration-150 dark:text-setta-500" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <div className="border-t border-setta-200/70 px-2 py-2 dark:border-setta-800/70">
              {item.content}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
