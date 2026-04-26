const RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER = [
  "run-instructions-run-snapshot-mode",
  "run-instructions-codegen-targets",
  "run-instructions-codegen-policy",
  "run-instructions-workflow-controls",
  "run-instructions-custom-runs",
  "run-instructions-add-from-code-blocks",
] as const;

export type RunInstructionsAccordionItemValue =
  (typeof RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER)[number];

export const RUN_INSTRUCTIONS_ACCORDION_DEFAULT_OPEN_VALUES: Array<RunInstructionsAccordionItemValue> =
  [
    "run-instructions-workflow-controls",
    "run-instructions-custom-runs",
    "run-instructions-add-from-code-blocks",
  ];

const RUN_INSTRUCTIONS_ACCORDION_ITEM_VALUE_SET = new Set<string>(
  RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER,
);

export function normalizeRunInstructionsAccordionOpenValues(
  openValues: Array<string>,
): Array<RunInstructionsAccordionItemValue> {
  const openValueSet = new Set(
    openValues.filter((value) =>
      RUN_INSTRUCTIONS_ACCORDION_ITEM_VALUE_SET.has(value),
    ),
  );
  return RUN_INSTRUCTIONS_ACCORDION_ITEM_ORDER.filter((value) =>
    openValueSet.has(value),
  );
}
