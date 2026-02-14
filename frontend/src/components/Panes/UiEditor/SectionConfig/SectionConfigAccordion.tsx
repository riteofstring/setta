import * as Accordion from "@radix-ui/react-accordion";
import React from "react";

export type SectionConfigAccordionItem = {
  value: string;
  title: string;
  triggerTestId: string;
  disabled?: boolean;
  disabledReason?: string;
  content: React.ReactNode;
};

export function SectionConfigAccordion({
  items,
  defaultOpenValues,
}: {
  items: Array<SectionConfigAccordionItem>;
  defaultOpenValues: Array<string>;
}) {
  const disabledItemValues = new Set(
    items.filter((item) => item.disabled).map((item) => item.value),
  );
  const resolvedDefaultOpenValues = defaultOpenValues.filter(
    (value) => !disabledItemValues.has(value),
  );

  return (
    <Accordion.Root
      type="multiple"
      defaultValue={resolvedDefaultOpenValues}
      className="flex min-h-0 flex-col gap-2"
    >
      {items.map((item) => {
        const isDisabled = item.disabled ?? false;
        const triggerClasses = isDisabled
          ? "group flex w-full cursor-not-allowed items-center justify-between gap-2 px-3 py-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-setta-400 opacity-60 focus-visible:outline-none dark:text-setta-500"
          : "group flex w-full items-center justify-between gap-2 px-3 py-2 pr-4 text-left text-xs font-bold uppercase tracking-wide text-setta-600 transition-colors hover:bg-setta-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-setta-300 dark:hover:bg-setta-800/80 [&[data-state=open]_.section-config-accordion-chevron]:rotate-180";
        return (
          <Accordion.Item
            key={item.value}
            value={item.value}
            className="overflow-hidden rounded-lg border border-setta-200/80 bg-white/85 dark:border-setta-800/80 dark:bg-setta-900/70"
          >
            <Accordion.Header>
              <Accordion.Trigger
                data-testid={item.triggerTestId}
                className={triggerClasses}
                disabled={isDisabled}
                title={isDisabled ? item.disabledReason : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-visible">
                  <i className="gg-chevron-down section-config-accordion-chevron !scale-[0.6] text-setta-400 transition-transform duration-150 dark:text-setta-500" />
                </span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <div className="border-t border-setta-200/70 px-2 py-2 dark:border-setta-800/70">
                {item.content}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}
