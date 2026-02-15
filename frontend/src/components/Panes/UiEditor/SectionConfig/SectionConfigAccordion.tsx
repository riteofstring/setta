import {
  type PaneAccordionItem,
  PaneAccordion,
} from "components/Panes/Common/PaneAccordion";

const SECTION_CONFIG_TRIGGER_ENABLED_CLASSES =
  "group box-border flex w-full items-center justify-between gap-2 px-3 py-2 pr-3 text-left text-xs font-bold uppercase tracking-wide text-setta-600 transition-colors hover:bg-setta-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-setta-300 dark:hover:bg-setta-800/80 [&[data-state=open]_.section-config-accordion-chevron]:rotate-180";
const SECTION_CONFIG_TRIGGER_DISABLED_CLASSES =
  "group box-border flex w-full cursor-not-allowed items-center justify-between gap-2 px-3 py-2 pr-3 text-left text-xs font-bold uppercase tracking-wide text-setta-400 opacity-60 focus-visible:outline-none dark:text-setta-500";

export function SectionConfigAccordion({
  items,
  defaultOpenValues,
  openValues,
  onOpenValuesChange,
}: {
  items: Array<PaneAccordionItem>;
  defaultOpenValues: Array<string>;
  openValues?: Array<string>;
  onOpenValuesChange?: (openValues: Array<string>) => void;
}) {
  return (
    <PaneAccordion
      items={items}
      defaultOpenValues={defaultOpenValues}
      openValues={openValues}
      onOpenValuesChange={onOpenValuesChange}
      enabledTriggerClassName={SECTION_CONFIG_TRIGGER_ENABLED_CLASSES}
      disabledTriggerClassName={SECTION_CONFIG_TRIGGER_DISABLED_CLASSES}
      chevronClassName="section-config-accordion-chevron"
    />
  );
}
