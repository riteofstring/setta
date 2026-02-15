import * as Accordion from "@radix-ui/react-accordion";
import React from "react";
import { HiChevronDown } from "react-icons/hi2";

export type RunInstructionsAccordionItem = {
  value: string;
  title: string;
  triggerTestId: string;
  disabled?: boolean;
  disabledReason?: string;
  content: React.ReactNode;
};

export function RunInstructionsAccordion({
  items,
  defaultOpenValues,
  openValues,
  onOpenValuesChange,
}: {
  items: Array<RunInstructionsAccordionItem>;
  defaultOpenValues: Array<string>;
  openValues?: Array<string>;
  onOpenValuesChange?: (openValues: Array<string>) => void;
}) {
  const disabledItemValues = new Set(
    items.filter((item) => item.disabled).map((item) => item.value),
  );
  const resolvedDefaultOpenValues = defaultOpenValues.filter(
    (value) => !disabledItemValues.has(value),
  );
  const hasControlledOpenValues = openValues !== undefined;
  const resolvedOpenValues =
    openValues?.filter((value) => !disabledItemValues.has(value)) ?? [];
  const handleOpenValuesChange = (nextOpenValues: Array<string>) => {
    if (!onOpenValuesChange) {
      return;
    }
    onOpenValuesChange(
      nextOpenValues.filter((value) => !disabledItemValues.has(value)),
    );
  };

  return (
    <Accordion.Root
      type="multiple"
      value={hasControlledOpenValues ? resolvedOpenValues : undefined}
      defaultValue={hasControlledOpenValues ? undefined : resolvedDefaultOpenValues}
      onValueChange={handleOpenValuesChange}
      className="flex min-h-0 flex-col gap-2"
    >
      {items.map((item) => {
        const isDisabled = item.disabled ?? false;
        const triggerClasses = isDisabled
          ? "group box-border flex w-full cursor-not-allowed items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-setta-400 opacity-60 focus-visible:outline-none dark:text-setta-500"
          : "group box-border flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-setta-600 transition-colors hover:bg-setta-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-setta-300 dark:hover:bg-setta-800/80 [&[data-state=open]_.run-instructions-accordion-chevron]:rotate-180";
        return (
          <Accordion.Item
            key={item.value}
            value={item.value}
            data-testid={`${item.triggerTestId}-item`}
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
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <HiChevronDown
                    className="run-instructions-accordion-chevron block text-setta-400 transition-transform duration-150 dark:text-setta-500"
                    size={16}
                  />
                </span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <div
                data-testid={`${item.triggerTestId}-content`}
                className="border-t border-setta-200/70 px-2 py-2 dark:border-setta-800/70"
              >
                {item.content}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}
