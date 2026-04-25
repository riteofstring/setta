import type { CSSProperties, ReactNode } from "react";

type FlatSectionKind = "callable" | "dict";

type FlatPrototypePortColumnProps = {
  align: "left" | "right";
  label: string;
  ports: string[];
};

type FlatPrototypeRow = {
  keyLabel: string;
  valueLabel: string;
  depth?: number;
  trailing?: string | null;
};

type FlatPrototypeRowProps = FlatPrototypeRow & {
  isLast: boolean;
};

type FlatSectionShellProps = {
  kind: FlatSectionKind;
  title: string;
  subtitle: string;
  children: ReactNode;
};

const SHELL_CLASS_NAME =
  "relative flex min-h-[320px] w-full min-w-[280px] flex-col overflow-hidden border border-neutral-300 bg-white font-mono text-[11px] text-neutral-900 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-100";

const HEADER_LABEL_CLASS_NAME =
  "text-[10px] uppercase tracking-[0.18em] text-neutral-500 dark:text-setta-400";

const CALLABLE_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "limit",
    valueLabel: "edge input",
  },
];

const CALLABLE_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "items",
    valueLabel: "list[str]",
  },
  {
    keyLabel: "reverse",
    valueLabel: "false",
  },
  {
    keyLabel: "key",
    valueLabel: "callable | none",
  },
];

const DICT_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "workspace",
    valueLabel: "string",
  },
];

const DICT_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "user",
    valueLabel: "dict",
  },
  {
    keyLabel: "name",
    valueLabel: "\"setta\"",
    depth: 1,
  },
  {
    keyLabel: "mode",
    valueLabel: "\"rewrite\"",
    depth: 1,
  },
  {
    keyLabel: "flags",
    valueLabel: "list[str]",
  },
];

function FlatSectionShell({
  kind,
  title,
  subtitle,
  children,
}: FlatSectionShellProps) {
  return (
    <section
      className={SHELL_CLASS_NAME}
      data-flat-section-kind={kind}
      data-flat-section-shell="true"
    >
      <header className="relative border-b border-neutral-300 px-3 py-2 dark:border-setta-700">
        <p className={HEADER_LABEL_CLASS_NAME}>{subtitle}</p>
        <p className="mt-1 truncate text-[12px] leading-5">{title}</p>
        <span className="absolute right-3 top-2 text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:text-setta-500">
          static
        </span>
      </header>
      {children}
    </section>
  );
}

function FlatPrototypeActionBar({ placeholder }: { placeholder: string }) {
  return (
    <nav className="flex items-center gap-3 border-b border-neutral-300 px-3 py-1.5 dark:border-setta-700">
      <button
        type="button"
        className={HEADER_LABEL_CLASS_NAME}
        aria-label="Add placeholder action"
      >
        add
      </button>
      <button
        type="button"
        className={HEADER_LABEL_CLASS_NAME}
        aria-label="Remove placeholder action"
      >
        drop
      </button>
      <button
        type="button"
        className={HEADER_LABEL_CLASS_NAME}
        aria-label="Pin placeholder action"
      >
        pin
      </button>
      <button
        type="button"
        className={HEADER_LABEL_CLASS_NAME}
        aria-label="Edge placeholder action"
      >
        edge
      </button>
      <span className="ml-auto border-b border-neutral-300 pb-0.5 text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:border-setta-700 dark:text-setta-500">
        {placeholder}
      </span>
    </nav>
  );
}

function FlatPrototypePortColumn({
  align,
  label,
  ports,
}: FlatPrototypePortColumnProps) {
  return (
    <section
      className={
        align === "right"
          ? "absolute inset-y-2 left-[52%] right-3 pl-4 text-right"
          : "relative pr-[52%]"
      }
    >
      <p className={HEADER_LABEL_CLASS_NAME}>{label}</p>
      <ol className="mt-2 space-y-1">
        {ports.map((port) => (
          <li
            key={`${align}-${port}`}
            className="truncate border-b border-neutral-200 pb-1 dark:border-setta-800"
          >
            {port}
          </li>
        ))}
      </ol>
    </section>
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
      className="relative border-b border-neutral-300 px-3 py-2 dark:border-setta-700"
      data-flat-shell-strip="ports"
    >
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-1/2 top-2 w-px -translate-x-px bg-neutral-200 dark:bg-setta-800"
      />
      <FlatPrototypePortColumn align="left" label="In" ports={inputPorts} />
      <FlatPrototypePortColumn align="right" label="Out" ports={outputPorts} />
    </section>
  );
}

function FlatPrototypeRows({
  label,
  rows,
  bounded,
}: {
  label: string;
  rows: FlatPrototypeRow[];
  bounded?: boolean;
}) {
  return (
    <section
      className={`relative px-3 py-2 ${
        bounded ? "border-b border-neutral-300 dark:border-setta-700" : "min-h-0 flex-1 overflow-y-auto"
      }`}
    >
      <p className={HEADER_LABEL_CLASS_NAME}>{label}</p>
      <ol className="mt-2">
        {rows.map((row, index) => (
          <FlatPrototypeRowItem
            key={`${label}-${row.keyLabel}-${index}`}
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
  trailing = ":",
  isLast,
}: FlatPrototypeRowProps) {
  const railLeft = depth * 14;
  const keyStyle: CSSProperties = {
    left: railLeft + 10,
    width: 108,
  };
  const valueStyle: CSSProperties = {
    left: railLeft + 130,
  };
  const railStyle: CSSProperties = {
    left: railLeft,
  };
  const connectorStyle: CSSProperties = {
    left: railLeft,
    top: 14,
    width: 10,
  };

  return (
    <li
      className={`relative min-h-7 ${isLast ? "" : "border-b border-neutral-200 dark:border-setta-800"}`}
      data-flat-row-key={keyLabel}
    >
      {depth > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="absolute bottom-0 top-0 w-px bg-neutral-200 dark:bg-setta-800"
            style={railStyle}
          />
          <span
            aria-hidden="true"
            className="absolute h-px bg-neutral-200 dark:bg-setta-800"
            style={connectorStyle}
          />
        </>
      ) : null}
      <span
        className="absolute top-1.5 truncate text-[10px] uppercase tracking-[0.14em] text-neutral-500 dark:text-setta-400"
        style={keyStyle}
      >
        {keyLabel}
      </span>
      <span
        className="absolute right-5 top-1.5 truncate text-neutral-800 dark:text-setta-100"
        style={valueStyle}
      >
        {valueLabel}
      </span>
      {trailing ? (
        <span className="absolute right-0 top-1.5 text-neutral-400 dark:text-setta-500">
          {trailing}
        </span>
      ) : null}
    </li>
  );
}

export function FlatCallableSectionPrototype() {
  return (
    <FlatSectionShell
      kind="callable"
      title="builtins.sorted"
      subtitle="Callable Prototype"
    >
      <section className="relative border-b border-neutral-300 px-3 py-2 dark:border-setta-700">
        <p className={HEADER_LABEL_CLASS_NAME}>Call</p>
        <p className="mt-2 border-b border-neutral-300 pb-1 dark:border-setta-700">
          builtins.sorted
        </p>
      </section>
      <FlatPrototypeActionBar placeholder="filter args" />
      <FlatPrototypeStrip
        inputPorts={["items", "limit"]}
        outputPorts={["result"]}
      />
      <FlatPrototypeRows label="Pinned" rows={CALLABLE_PINNED_ROWS} bounded />
      <FlatPrototypeRows label="Args" rows={CALLABLE_ROWS} />
    </FlatSectionShell>
  );
}

export function FlatDictSectionPrototype() {
  return (
    <FlatSectionShell
      kind="dict"
      title="project_config"
      subtitle="Dict Prototype"
    >
      <section className="relative border-b border-neutral-300 px-3 py-2 dark:border-setta-700">
        <p className={HEADER_LABEL_CLASS_NAME}>Root</p>
        <p className="mt-2 border-b border-neutral-300 pb-1 dark:border-setta-700">
          dict
        </p>
      </section>
      <FlatPrototypeActionBar placeholder="filter keys" />
      <FlatPrototypeRows label="Pinned" rows={DICT_PINNED_ROWS} bounded />
      <FlatPrototypeRows label="Entries" rows={DICT_ROWS} />
    </FlatSectionShell>
  );
}

export function FlatSectionPrototypeGallery() {
  return (
    <article className="flex flex-col gap-6" data-flat-section-gallery="true">
      <FlatCallableSectionPrototype />
      <FlatDictSectionPrototype />
    </article>
  );
}
