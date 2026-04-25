import type { CSSProperties, ReactNode } from "react";

type FlatSectionKind = "callable" | "dict";

type FlatPrototypePortAlign = "left" | "right";

type FlatPrototypeRowEmphasis =
  | "required"
  | "optional"
  | "pinned"
  | "edge"
  | "group"
  | "nested";

type FlatPrototypeRow = {
  keyLabel: string;
  valueLabel: string;
  depth?: number;
  emphasis?: FlatPrototypeRowEmphasis;
  trailing?: string | null;
};

type FlatPrototypeRowProps = FlatPrototypeRow & {
  isLast: boolean;
};

type FlatSectionShellProps = {
  kind: FlatSectionKind;
  title: string;
  callTarget?: string;
  children: ReactNode;
};

const SHELL_CLASS_NAME =
  "relative flex min-h-[320px] w-full min-w-[280px] flex-col overflow-hidden border border-neutral-300 bg-white font-mono text-[11px] text-neutral-900 [--flat-key-width:8.75rem] dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100";

const HEADER_LABEL_CLASS_NAME =
  "text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-setta-400";

const ROW_KEY_CLASS_NAME =
  "min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em]";

const ROW_VALUE_CLASS_NAME =
  "min-w-0 truncate text-right font-mono text-[11px] leading-7";

const ROW_CELL_DIVIDER_CLASS_NAME =
  "border-b border-neutral-200 dark:border-setta-800";

const ROW_HOVER_CLASS_NAME =
  "transition-colors hover:bg-neutral-100/80 dark:hover:bg-setta-800/70";

const NESTED_ROW_RAIL_CLASS_NAME =
  "before:absolute before:bottom-0 before:top-0 before:left-[calc(var(--flat-depth)*0.875rem)] before:w-px before:bg-neutral-200 before:content-[''] after:absolute after:left-[calc(var(--flat-depth)*0.875rem)] after:top-1/2 after:h-px after:w-2.5 after:bg-neutral-200 after:content-[''] dark:before:bg-setta-800 dark:after:bg-setta-800";

const ROW_EMPHASIS_CLASS_NAMES: Record<FlatPrototypeRowEmphasis, string> = {
  required: "text-neutral-900 dark:text-setta-100",
  optional: "text-neutral-500 dark:text-setta-400",
  pinned: "text-neutral-900 dark:text-setta-100",
  edge: "text-blue-900 dark:text-blue-100",
  group: "text-neutral-950 dark:text-setta-50",
  nested: "text-neutral-700 dark:text-setta-300",
};

const ROW_VALUE_CLASS_NAMES: Record<FlatPrototypeRowEmphasis, string> = {
  required: "font-semibold text-neutral-900 dark:text-setta-50",
  optional: "text-neutral-500 dark:text-setta-400",
  pinned: "font-semibold text-neutral-900 dark:text-setta-50",
  edge: "font-semibold text-blue-800 dark:text-blue-100",
  group: "font-semibold text-neutral-950 dark:text-setta-50",
  nested: "text-neutral-700 dark:text-setta-300",
};

const CALLABLE_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "limit",
    valueLabel: "connected",
    emphasis: "edge",
  },
];

const CALLABLE_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "items",
    valueLabel: "list[str]",
    emphasis: "required",
  },
  {
    keyLabel: "reverse",
    valueLabel: "false",
    emphasis: "optional",
  },
  {
    keyLabel: "key",
    valueLabel: "callable | none",
    emphasis: "optional",
  },
];

const DICT_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "workspace",
    valueLabel: "string",
    emphasis: "pinned",
  },
];

const DICT_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "user",
    valueLabel: "dict",
    emphasis: "group",
  },
  {
    keyLabel: "name",
    valueLabel: '"setta"',
    depth: 1,
    emphasis: "nested",
  },
  {
    keyLabel: "mode",
    valueLabel: '"rewrite"',
    depth: 1,
    emphasis: "nested",
  },
  {
    keyLabel: "flags",
    valueLabel: "list[str]",
    emphasis: "optional",
  },
];

const FLAT_PROTOTYPE_ACTIONS = [
  {
    label: "Remove",
    iconClassName: "gg-math-minus before:!left-0",
  },
  {
    label: "Add",
    iconClassName: "gg-math-plus",
  },
  {
    label: "Pin",
    iconClassName: "gg-pin-alt",
  },
  {
    label: "Resize columns",
    iconClassName: "gg-push-left",
    extraClassName: "cursor-col-resize",
    dataAttr: "column-resize",
  },
  {
    label: "Edge",
    iconClassName: "gg-link",
  },
];

const FLAT_PROTOTYPE_SECTION_CONTROLS = [
  {
    label: "Lock section",
    iconClassName: "gg-lock",
  },
  {
    label: "Minimize section",
    iconClassName: "gg-math-minus before:!left-0",
  },
  {
    label: "Close section",
    iconClassName: "gg-close",
  },
];

const ICON_BUTTON_CLASS_NAME =
  "text-neutral-400 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 dark:text-setta-500 dark:hover:text-blue-300";

function FlatSectionShell({
  kind,
  title,
  callTarget,
  children,
}: FlatSectionShellProps) {
  return (
    <section
      className={SHELL_CLASS_NAME}
      data-flat-section-kind={kind}
      data-flat-section-shell="true"
    >
      <header className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 border-b border-neutral-300 px-3 py-2 dark:border-setta-700">
        <button
          type="button"
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600 after:ml-1 after:text-neutral-400 after:content-[':'] hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 dark:text-setta-300 dark:after:text-setta-500 dark:hover:text-blue-300"
          aria-label={`Open ${kind} section menu`}
          data-flat-section-type-menu="true"
        >
          {kind}
        </button>
        <h2 className="min-w-0 truncate text-[12px] leading-5 text-neutral-950 dark:text-setta-50">
          {title}
          {callTarget ? (
            <>
              {" "}
              <code className="ml-1 font-mono text-[11px] font-normal text-neutral-500 dark:text-setta-400">
                {`calls ${callTarget}`}
              </code>
            </>
          ) : null}
        </h2>
        <nav
          className="flex items-center gap-1"
          aria-label={`${kind} section controls`}
        >
          {FLAT_PROTOTYPE_SECTION_CONTROLS.map((control) => (
            <button
              key={control.label}
              type="button"
              className={`${ICON_BUTTON_CLASS_NAME} ${control.iconClassName}`}
              aria-label={control.label}
            />
          ))}
        </nav>
      </header>
      {children}
    </section>
  );
}

function FlatPrototypeActionBar({
  label,
  placeholder,
}: {
  label: string;
  placeholder: string;
}) {
  return (
    <nav className="flex min-h-9 items-center gap-1 border-b border-neutral-300 px-3 py-1.5 dark:border-setta-700">
      <p className={`mr-1 shrink-0 ${HEADER_LABEL_CLASS_NAME}`}>{label}</p>
      {FLAT_PROTOTYPE_ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`shrink-0 text-neutral-500 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 dark:text-setta-400 dark:hover:text-blue-300 ${action.iconClassName} ${action.extraClassName ?? ""}`}
          aria-label={`${action.label} placeholder action`}
          data-flat-control={action.dataAttr}
        />
      ))}
      <input
        aria-label={`${label} filter`}
        className="ml-2 min-w-0 flex-1 border-b border-neutral-300 pb-0.5 text-right text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:border-setta-700 dark:text-setta-500"
        name={`${label.toLowerCase()}-filter`}
        readOnly
        value={placeholder}
      />
    </nav>
  );
}

function FlatPrototypePortList({
  align,
  label,
  ports,
}: {
  align: FlatPrototypePortAlign;
  label: string;
  ports: string[];
}) {
  const isRightAligned = align === "right";
  const labelClassName = `${HEADER_LABEL_CLASS_NAME} ${
    isRightAligned ? "col-start-3 text-right" : "col-start-1"
  }`;
  const listClassName = `row-start-2 flex flex-col gap-1 ${
    isRightAligned ? "col-start-3 items-stretch" : "col-start-1"
  }`;
  const rowClassName = isRightAligned
    ? "relative truncate border-b border-neutral-200 py-1 pr-3 text-right text-neutral-700 after:absolute after:right-0 after:top-1/2 after:h-1.5 after:w-1.5 after:-translate-y-1/2 after:bg-neutral-400 after:content-[''] dark:border-setta-800 dark:text-setta-300 dark:after:bg-setta-500"
    : "relative truncate border-b border-neutral-200 py-1 pl-3 text-neutral-700 before:absolute before:left-0 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:bg-blue-500 before:content-[''] dark:border-setta-800 dark:text-setta-300 dark:before:bg-blue-400";

  return (
    <>
      <p className={labelClassName}>{label}</p>
      <ol className={listClassName}>
        {ports.map((port) => (
          <li key={`${align}-${port}`} className={rowClassName}>
            {port}
          </li>
        ))}
      </ol>
    </>
  );
}

function FlatPrototypeStrip({
  inputPorts,
  outputPorts,
}: {
  inputPorts: string[];
  outputPorts: string[];
}) {
  return (
    <section
      className="relative grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] gap-y-2 border-b border-neutral-300 px-3 py-2 before:absolute before:bottom-2 before:left-1/2 before:top-2 before:w-px before:bg-neutral-200 before:content-[''] dark:border-setta-700 dark:before:bg-setta-800"
      data-flat-shell-strip="ports"
    >
      <FlatPrototypePortList align="left" label="In" ports={inputPorts} />
      <FlatPrototypePortList align="right" label="Out" ports={outputPorts} />
    </section>
  );
}

function getRowGroupClassName(variant: "pinned" | "body") {
  if (variant === "pinned") {
    return "border-b border-neutral-300 bg-neutral-50 px-3 py-2 dark:border-setta-700 dark:bg-blue-950/20";
  }
  return "min-h-0 flex-1 overflow-y-auto px-3 py-2";
}

function FlatPrototypeRows({
  label,
  rows,
  variant = "body",
}: {
  label?: string;
  rows: FlatPrototypeRow[];
  variant?: "pinned" | "body";
}) {
  return (
    <section
      className={getRowGroupClassName(variant)}
      data-flat-row-group={variant}
    >
      {label ? (
        <header className="flex items-center gap-1">
          <p className={HEADER_LABEL_CLASS_NAME}>{label}</p>
        </header>
      ) : null}
      <ol className={label ? "mt-2" : ""}>
        {rows.map((row, index) => (
          <FlatPrototypeRowItem
            key={`${label ?? "body"}-${row.keyLabel}-${index}`}
            {...row}
            isLast={index === rows.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

function FlatPrototypeRowItem({
  keyLabel,
  valueLabel,
  depth = 0,
  emphasis = "required",
  trailing = ":",
  isLast,
}: FlatPrototypeRowProps) {
  const rowStyle = {
    "--flat-depth": depth,
  } as CSSProperties & Record<"--flat-depth", number>;
  const nestedClassName = depth > 0 ? NESTED_ROW_RAIL_CLASS_NAME : "";
  const cellDividerClassName = isLast ? "" : ROW_CELL_DIVIDER_CLASS_NAME;
  const rowClassName = `relative grid min-h-7 grid-cols-[minmax(5.5rem,var(--flat-key-width))_minmax(0,1fr)] items-center gap-3 pr-2 pl-[calc(var(--flat-depth)*0.875rem+0.625rem)] ${ROW_HOVER_CLASS_NAME} ${nestedClassName} ${ROW_EMPHASIS_CLASS_NAMES[emphasis]}`;
  const valueWithTrailing = trailing ? `${valueLabel}${trailing}` : valueLabel;

  return (
    <li
      className={rowClassName}
      data-flat-row-emphasis={emphasis}
      data-flat-row-key={keyLabel}
      style={rowStyle}
    >
      <b className={`${ROW_KEY_CLASS_NAME} ${cellDividerClassName}`}>
        {keyLabel}
      </b>
      <code
        className={`${ROW_VALUE_CLASS_NAME} ${cellDividerClassName} ${ROW_VALUE_CLASS_NAMES[emphasis]}`}
      >
        {valueWithTrailing}
      </code>
    </li>
  );
}

export function FlatCallableSectionPrototype() {
  return (
    <FlatSectionShell
      kind="callable"
      title="rank_items"
      callTarget="builtins.sorted"
    >
      <FlatPrototypeActionBar label="Args" placeholder="filter args" />
      <FlatPrototypeStrip
        inputPorts={["items", "limit"]}
        outputPorts={["result"]}
      />
      <FlatPrototypeRows
        label="Pinned Params"
        rows={CALLABLE_PINNED_ROWS}
        variant="pinned"
      />
      <FlatPrototypeRows rows={CALLABLE_ROWS} />
    </FlatSectionShell>
  );
}

export function FlatDictSectionPrototype() {
  return (
    <FlatSectionShell kind="dict" title="workspace_profile">
      <FlatPrototypeActionBar label="Entries" placeholder="filter keys" />
      <FlatPrototypeRows
        label="Pinned Params"
        rows={DICT_PINNED_ROWS}
        variant="pinned"
      />
      <FlatPrototypeRows rows={DICT_ROWS} />
    </FlatSectionShell>
  );
}

export function FlatSectionPrototypeGallery() {
  return (
    <article
      className="grid grid-cols-1 gap-6 xl:grid-cols-2"
      data-flat-section-gallery="true"
    >
      <FlatCallableSectionPrototype />
      <FlatDictSectionPrototype />
    </article>
  );
}
