import {
  type PaneAccordionItem,
  PaneAccordion,
} from "components/Panes/Common/PaneAccordion";

const RUN_INSTRUCTIONS_TRIGGER_ENABLED_CLASSES =
  "group box-border flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-setta-600 transition-colors hover:bg-setta-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-setta-300 dark:hover:bg-setta-800/80 [&[data-state=open]_.run-instructions-accordion-chevron]:rotate-180";
const RUN_INSTRUCTIONS_TRIGGER_DISABLED_CLASSES =
  "group box-border flex w-full cursor-not-allowed items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-setta-400 opacity-60 focus-visible:outline-none dark:text-setta-500";

export function RunInstructionsAccordion({
  items,
  openValues,
  onOpenValuesChange,
}: {
  items: Array<PaneAccordionItem>;
  openValues: Array<string>;
  onOpenValuesChange: (openValues: Array<string>) => void;
}) {
  return (
    <PaneAccordion
      items={items}
      openValues={openValues}
      onOpenValuesChange={onOpenValuesChange}
      enabledTriggerClassName={RUN_INSTRUCTIONS_TRIGGER_ENABLED_CLASSES}
      disabledTriggerClassName={RUN_INSTRUCTIONS_TRIGGER_DISABLED_CLASSES}
      chevronClassName="run-instructions-accordion-chevron"
      includeItemTestId={true}
      includeContentTestId={true}
    />
  );
}
