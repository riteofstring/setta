import * as Accordion from "@radix-ui/react-accordion";
import React from "react";
import { HiChevronDown } from "react-icons/hi2";

const DEFAULT_ROOT_CLASS_NAME = "flex min-h-0 flex-col gap-2";
const DEFAULT_ITEM_CLASS_NAME =
  "overflow-hidden rounded-lg border border-setta-200/80 bg-white/85 dark:border-setta-800/80 dark:bg-setta-900/70";
const DEFAULT_CONTENT_CLASS_NAME =
  "border-t border-setta-200/70 px-2 py-2 dark:border-setta-800/70";
const DEFAULT_TITLE_WRAPPER_CLASS_NAME = "min-w-0 flex-1";
const DEFAULT_TITLE_CLASS_NAME = "block truncate";
const DEFAULT_DESCRIPTION_CLASS_NAME =
  "mt-0.5 block text-[11px] text-setta-500 dark:text-setta-400";
const CONTENT_WRAPPER_CLASS_NAME =
  "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden";
const CHEVRON_WRAPPER_CLASS_NAME =
  "flex h-5 w-5 shrink-0 items-center justify-center";
const CHEVRON_CLASS_NAME_SUFFIX =
  "block text-setta-400 transition-transform duration-150 dark:text-setta-500";

export type PaneAccordionItem = {
  value: string;
  title: string;
  description?: React.ReactNode;
  triggerTestId: string;
  disabled?: boolean;
  disabledReason?: string;
  content: React.ReactNode;
};

type PaneAccordionBaseProps = {
  items: Array<PaneAccordionItem>;
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
};

type PaneAccordionControlledProps = PaneAccordionBaseProps & {
  openValues: Array<string>;
  onOpenValuesChange: (openValues: Array<string>) => void;
  defaultOpenValues?: never;
};

type PaneAccordionUncontrolledProps = PaneAccordionBaseProps & {
  defaultOpenValues: Array<string>;
  openValues?: never;
  onOpenValuesChange?: never;
};

type PaneAccordionProps =
  | PaneAccordionControlledProps
  | PaneAccordionUncontrolledProps;

type ResolvedPaneAccordionClassNames = {
  root: string;
  item: string;
  content: string;
  titleWrapper: string;
  title: string;
  description: string;
};

type ResolvedPaneAccordionOpenState = {
  value?: Array<string>;
  defaultValue?: Array<string>;
  onValueChange?: (openValues: Array<string>) => void;
};

type PaneAccordionEntryProps = {
  item: PaneAccordionItem;
  enabledTriggerClassName: string;
  disabledTriggerClassName: string;
  chevronClassName: string;
  includeItemTestId: boolean;
  includeContentTestId: boolean;
  classNames: ResolvedPaneAccordionClassNames;
};

function filterDisabledValues(
  values: Array<string>,
  disabledItemValues: Set<string>,
): Array<string> {
  return values.filter((value) => !disabledItemValues.has(value));
}

function resolvePaneAccordionClassNames({
  rootClassName,
  itemClassName,
  contentClassName,
  titleWrapperClassName,
  titleClassName,
  descriptionClassName,
}: Pick<
  PaneAccordionBaseProps,
  | "rootClassName"
  | "itemClassName"
  | "contentClassName"
  | "titleWrapperClassName"
  | "titleClassName"
  | "descriptionClassName"
>): ResolvedPaneAccordionClassNames {
  return {
    root: rootClassName ?? DEFAULT_ROOT_CLASS_NAME,
    item: itemClassName ?? DEFAULT_ITEM_CLASS_NAME,
    content: contentClassName ?? DEFAULT_CONTENT_CLASS_NAME,
    titleWrapper: titleWrapperClassName ?? DEFAULT_TITLE_WRAPPER_CLASS_NAME,
    title: titleClassName ?? DEFAULT_TITLE_CLASS_NAME,
    description: descriptionClassName ?? DEFAULT_DESCRIPTION_CLASS_NAME,
  };
}

function resolvePaneAccordionOpenState(
  openStateProps: PaneAccordionControlledProps | PaneAccordionUncontrolledProps,
  disabledItemValues: Set<string>,
): ResolvedPaneAccordionOpenState {
  if ("openValues" in openStateProps) {
    return {
      value: filterDisabledValues(
        openStateProps.openValues,
        disabledItemValues,
      ),
      onValueChange: (nextOpenValues) => {
        openStateProps.onOpenValuesChange(
          filterDisabledValues(nextOpenValues, disabledItemValues),
        );
      },
    };
  }

  return {
    defaultValue: filterDisabledValues(
      openStateProps.defaultOpenValues,
      disabledItemValues,
    ),
  };
}

function getTriggerClassName({
  isDisabled,
  enabledTriggerClassName,
  disabledTriggerClassName,
}: Pick<
  PaneAccordionEntryProps,
  "enabledTriggerClassName" | "disabledTriggerClassName"
> & {
  isDisabled: boolean;
}): string {
  if (isDisabled) {
    return disabledTriggerClassName;
  }

  return `${enabledTriggerClassName} cursor-pointer`;
}

function PaneAccordionEntry({
  item,
  enabledTriggerClassName,
  disabledTriggerClassName,
  chevronClassName,
  includeItemTestId,
  includeContentTestId,
  classNames,
}: PaneAccordionEntryProps) {
  const isDisabled = item.disabled ?? false;
  const itemTestId = includeItemTestId
    ? `${item.triggerTestId}-item`
    : undefined;
  const contentTestId = includeContentTestId
    ? `${item.triggerTestId}-content`
    : undefined;

  return (
    <Accordion.Item
      value={item.value}
      data-testid={itemTestId}
      className={classNames.item}
    >
      <Accordion.Header>
        <Accordion.Trigger
          data-testid={item.triggerTestId}
          className={getTriggerClassName({
            isDisabled,
            enabledTriggerClassName,
            disabledTriggerClassName,
          })}
          disabled={isDisabled}
          title={isDisabled ? item.disabledReason : undefined}
        >
          <span className={classNames.titleWrapper}>
            <span className={classNames.title}>{item.title}</span>
            {item.description === undefined ? null : (
              <span className={classNames.description}>{item.description}</span>
            )}
          </span>
          <span className={CHEVRON_WRAPPER_CLASS_NAME}>
            <HiChevronDown
              className={`${chevronClassName} ${CHEVRON_CLASS_NAME_SUFFIX}`}
              size={16}
            />
          </span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className={CONTENT_WRAPPER_CLASS_NAME}>
        <div data-testid={contentTestId} className={classNames.content}>
          {item.content}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

export function PaneAccordion({
  items,
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
  ...openStateProps
}: PaneAccordionProps) {
  const classNames = resolvePaneAccordionClassNames({
    rootClassName,
    itemClassName,
    contentClassName,
    titleWrapperClassName,
    titleClassName,
    descriptionClassName,
  });
  const disabledItemValues = new Set(
    items.filter((item) => item.disabled).map((item) => item.value),
  );
  const resolvedOpenState = resolvePaneAccordionOpenState(
    openStateProps,
    disabledItemValues,
  );

  return (
    <Accordion.Root
      type="multiple"
      value={resolvedOpenState.value}
      defaultValue={resolvedOpenState.defaultValue}
      onValueChange={resolvedOpenState.onValueChange}
      className={classNames.root}
    >
      {items.map((item) => (
        <PaneAccordionEntry
          key={item.value}
          item={item}
          enabledTriggerClassName={enabledTriggerClassName}
          disabledTriggerClassName={disabledTriggerClassName}
          chevronClassName={chevronClassName}
          includeItemTestId={includeItemTestId}
          includeContentTestId={includeContentTestId}
          classNames={classNames}
        />
      ))}
    </Accordion.Root>
  );
}
