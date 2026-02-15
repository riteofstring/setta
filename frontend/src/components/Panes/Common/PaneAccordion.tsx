import * as Accordion from "@radix-ui/react-accordion";
import React from "react";
import { HiChevronDown } from "react-icons/hi2";

export type PaneAccordionItem = {
  value: string;
  title: string;
  description?: React.ReactNode;
  triggerTestId: string;
  disabled?: boolean;
  disabledReason?: string;
  content: React.ReactNode;
};

export function PaneAccordion({
  items,
  defaultOpenValues,
  openValues,
  onOpenValuesChange,
  enabledTriggerClassName,
  disabledTriggerClassName,
  chevronClassName,
  includeItemTestId = false,
  includeContentTestId = false,
  rootClassName,
  itemClassName,
  contentClassName,
  titleWrapperClassName,
  titleClassName,
  descriptionClassName,
}: {
  items: Array<PaneAccordionItem>;
  defaultOpenValues: Array<string>;
  openValues?: Array<string>;
  onOpenValuesChange?: (openValues: Array<string>) => void;
  enabledTriggerClassName: string;
  disabledTriggerClassName: string;
  chevronClassName: string;
  includeItemTestId?: boolean;
  includeContentTestId?: boolean;
  rootClassName?: string;
  itemClassName?: string;
  contentClassName?: string;
  titleWrapperClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}) {
  const resolvedRootClassName = rootClassName ?? "flex min-h-0 flex-col gap-2";
  const resolvedItemClassName =
    itemClassName ??
    "overflow-hidden rounded-lg border border-setta-200/80 bg-white/85 dark:border-setta-800/80 dark:bg-setta-900/70";
  const resolvedContentClassName =
    contentClassName ??
    "border-t border-setta-200/70 px-2 py-2 dark:border-setta-800/70";
  const resolvedTitleWrapperClassName =
    titleWrapperClassName ?? "min-w-0 flex-1";
  const resolvedTitleClassName = titleClassName ?? "block truncate";
  const resolvedDescriptionClassName =
    descriptionClassName ??
    "mt-0.5 block text-[11px] text-setta-500 dark:text-setta-400";
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
      defaultValue={
        hasControlledOpenValues ? undefined : resolvedDefaultOpenValues
      }
      onValueChange={handleOpenValuesChange}
      className={resolvedRootClassName}
    >
      {items.map((item) => {
        const isDisabled = item.disabled ?? false;
        const triggerClasses = isDisabled
          ? disabledTriggerClassName
          : enabledTriggerClassName;
        const itemTestId = includeItemTestId
          ? `${item.triggerTestId}-item`
          : undefined;
        const contentTestId = includeContentTestId
          ? `${item.triggerTestId}-content`
          : undefined;
        return (
          <Accordion.Item
            key={item.value}
            value={item.value}
            data-testid={itemTestId}
            className={resolvedItemClassName}
          >
            <Accordion.Header>
              <Accordion.Trigger
                data-testid={item.triggerTestId}
                className={triggerClasses}
                disabled={isDisabled}
                title={isDisabled ? item.disabledReason : undefined}
              >
                <span className={resolvedTitleWrapperClassName}>
                  <span className={resolvedTitleClassName}>{item.title}</span>
                  {item.description === undefined ? null : (
                    <span className={resolvedDescriptionClassName}>
                      {item.description}
                    </span>
                  )}
                </span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <HiChevronDown
                    className={`${chevronClassName} block text-setta-400 transition-transform duration-150 dark:text-setta-500`}
                    size={16}
                  />
                </span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
              <div
                data-testid={contentTestId}
                className={resolvedContentClassName}
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
