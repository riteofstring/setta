import { useId, useState, type CSSProperties, type ReactNode } from "react";

type FlatSectionKind = "callable" | "dict";

type FlatPrototypeTheme = "dark" | "light";

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
  controlLabel: string;
  controlPlaceholder: string;
  controlsInitiallyOpen?: boolean;
  theme?: FlatPrototypeTheme;
  lead?: ReactNode;
  children: ReactNode;
};

type FlatPrototypeThemeStyleVar =
  | "--flat-blue-strong"
  | "--flat-border-soft"
  | "--flat-border-strong"
  | "--flat-dim"
  | "--flat-focus"
  | "--flat-hover"
  | "--flat-input-dot"
  | "--flat-muted"
  | "--flat-pinned-bg"
  | "--flat-port-dot"
  | "--flat-shell-bg"
  | "--flat-soft-text"
  | "--flat-text"
  | "--flat-title";

type FlatPrototypeThemeStyle = CSSProperties &
  Record<FlatPrototypeThemeStyleVar, string>;

type FlatPrototypeSectionProps = {
  controlsInitiallyOpen?: boolean;
  theme?: FlatPrototypeTheme;
};

type FlatPrototypeRowStyle = CSSProperties &
  Partial<Record<"--flat-depth", number>> &
  Partial<Record<"--flat-rail-left", string>>;

const FLAT_PROTOTYPE_THEME_STYLES = {
  dark: {
    "--flat-blue-strong": "rgb(219 234 254)",
    "--flat-border-soft": "hsl(220 26% 14%)",
    "--flat-border-strong": "hsl(219 26% 23%)",
    "--flat-dim": "hsl(220 25% 45%)",
    "--flat-focus": "rgb(96 165 250)",
    "--flat-hover": "hsl(220 26% 14% / 0.7)",
    "--flat-input-dot": "rgb(96 165 250)",
    "--flat-muted": "hsl(220 26% 57%)",
    "--flat-pinned-bg": "rgb(23 37 84 / 0.2)",
    "--flat-port-dot": "hsl(220 25% 45%)",
    "--flat-shell-bg": "hsl(220 25% 3%)",
    "--flat-soft-text": "hsl(220 25% 67%)",
    "--flat-text": "hsl(222 28% 95%)",
    "--flat-title": "hsl(222 28% 95%)",
  },
  light: {
    "--flat-blue-strong": "rgb(30 64 175)",
    "--flat-border-soft": "rgb(229 229 229)",
    "--flat-border-strong": "rgb(212 212 212)",
    "--flat-dim": "rgb(163 163 163)",
    "--flat-focus": "rgb(37 99 235)",
    "--flat-hover": "rgb(245 245 245 / 0.8)",
    "--flat-input-dot": "rgb(59 130 246)",
    "--flat-muted": "rgb(115 115 115)",
    "--flat-pinned-bg": "rgb(250 250 250)",
    "--flat-port-dot": "rgb(163 163 163)",
    "--flat-shell-bg": "rgb(255 255 255)",
    "--flat-soft-text": "rgb(64 64 64)",
    "--flat-text": "rgb(23 23 23)",
    "--flat-title": "rgb(10 10 10)",
  },
} satisfies Record<FlatPrototypeTheme, FlatPrototypeThemeStyle>;

const SHELL_CLASS_NAME =
  "relative flex min-h-[320px] w-full min-w-[280px] flex-col overflow-hidden border border-[color:var(--flat-border-strong)] bg-[color:var(--flat-shell-bg)] font-mono text-[11px] text-[color:var(--flat-text)] [--flat-key-width:8.75rem]";

const HEADER_LABEL_CLASS_NAME =
  "text-[10px] uppercase tracking-[0.18em] text-[color:var(--flat-muted)]";

const ROW_KEY_CLASS_NAME =
  "min-w-0 truncate text-[10px] font-semibold uppercase leading-7 tracking-[0.14em]";

const ROW_VALUE_CLASS_NAME =
  "min-w-0 truncate text-right font-mono text-[11px] leading-7";

const ROW_CELL_DIVIDER_CLASS_NAME =
  "border-b border-[color:var(--flat-border-soft)]";

const ROW_HOVER_CLASS_NAME = "hover:bg-[color:var(--flat-hover)]";

const NESTED_ROW_RAIL_CLASS_NAME =
  "before:absolute before:bottom-0 before:left-[var(--flat-rail-left)] before:top-0 before:w-px before:bg-[color:var(--flat-border-soft)] before:content-['']";

const ROW_EMPHASIS_CLASS_NAMES: Record<FlatPrototypeRowEmphasis, string> = {
  required: "text-[color:var(--flat-text)]",
  optional: "text-[color:var(--flat-muted)]",
  pinned: "text-[color:var(--flat-text)]",
  edge: "text-[color:var(--flat-blue-strong)]",
  group: "text-[color:var(--flat-title)]",
  nested: "text-[color:var(--flat-soft-text)]",
};

const ROW_VALUE_CLASS_NAMES: Record<FlatPrototypeRowEmphasis, string> = {
  required: "font-semibold text-[color:var(--flat-title)]",
  optional: "text-[color:var(--flat-muted)]",
  pinned: "font-semibold text-[color:var(--flat-title)]",
  edge: "font-semibold text-[color:var(--flat-blue-strong)]",
  group: "font-semibold text-[color:var(--flat-title)]",
  nested: "text-[color:var(--flat-soft-text)]",
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

const ACTION_ICON_BUTTON_CLASS_NAME =
  "relative justify-self-center text-[color:var(--flat-muted)] [--ggs:0.42] hover:text-[color:var(--flat-focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--flat-focus)]";

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
  "relative text-[color:var(--flat-dim)] [--ggs:0.46] hover:text-[color:var(--flat-focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--flat-focus)]";

const SECTION_KIND_ICON_CLASS_NAMES: Record<FlatSectionKind, string> = {
  callable: "gg-code-slash",
  dict: "gg-list",
};

function FlatSectionShell({
  kind,
  title,
  controlLabel,
  controlPlaceholder,
  controlsInitiallyOpen = false,
  theme = "dark",
  lead,
  children,
}: FlatSectionShellProps) {
  const controlBarId = useId();
  const [isControlBarOpen, setIsControlBarOpen] = useState(
    controlsInitiallyOpen,
  );

  return (
    <section
      className={SHELL_CLASS_NAME}
      data-flat-section-kind={kind}
      data-flat-section-shell="true"
      data-flat-preview-theme={theme}
      style={FLAT_PROTOTYPE_THEME_STYLES[theme]}
    >
      <header className="grid min-h-8 grid-cols-[1.125rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-[color:var(--flat-border-strong)] px-3 py-1">
        <button
          type="button"
          className={`relative justify-self-center text-[color:var(--flat-muted)] [--ggs:0.52] hover:text-[color:var(--flat-focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--flat-focus)] ${SECTION_KIND_ICON_CLASS_NAMES[kind]}`}
          aria-label={`Open ${kind} section menu`}
          data-flat-section-type-menu="true"
        />
        <h2 className="min-w-0 truncate text-[12px] leading-5 text-[color:var(--flat-title)]">
          {title}
        </h2>
        <nav
          className="flex items-center gap-1"
          aria-label={`${kind} section controls`}
        >
          <button
            type="button"
            className={`${ICON_BUTTON_CLASS_NAME} gg-options`}
            aria-controls={controlBarId}
            aria-expanded={isControlBarOpen}
            aria-label={`${isControlBarOpen ? "Hide" : "Show"} ${controlLabel.toLowerCase()} controls`}
            data-flat-control-toggle="true"
            onClick={() => {
              setIsControlBarOpen((wasOpen) => !wasOpen);
            }}
          />
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
      {lead}
      {isControlBarOpen ? (
        <FlatPrototypeActionBar
          id={controlBarId}
          label={controlLabel}
          placeholder={controlPlaceholder}
        />
      ) : null}
      {children}
    </section>
  );
}

function FlatCallableTarget({ value }: { value: string }) {
  return (
    <input
      aria-label="Callable function name"
      className="min-h-8 border-solid border-[color:var(--flat-border-strong)] bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[color:var(--flat-title)] outline-none [border-width:0_0_1px_0] placeholder:text-[color:var(--flat-dim)] focus:border-[color:var(--flat-focus)]"
      name="callable-function"
      placeholder="please enter function name"
      readOnly
      value={value}
    />
  );
}

function FlatPrototypeActionBar({
  id,
  label,
  placeholder,
}: {
  id: string;
  label: string;
  placeholder: string;
}) {
  return (
    <nav
      id={id}
      className="grid min-h-9 grid-cols-[auto_repeat(5,1.375rem)_auto_minmax(0,1fr)] items-center gap-x-1 border-b border-[color:var(--flat-border-strong)] px-3 py-1.5"
    >
      <p className={`mr-1 shrink-0 ${HEADER_LABEL_CLASS_NAME}`}>{label}</p>
      {FLAT_PROTOTYPE_ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`${ACTION_ICON_BUTTON_CLASS_NAME} ${action.iconClassName} ${action.extraClassName ?? ""}`}
          aria-label={`${action.label} placeholder action`}
          data-flat-control={action.dataAttr}
        />
      ))}
      <b
        aria-hidden="true"
        className="gg-search !ml-2 !mt-0 justify-self-center text-[color:var(--flat-dim)] [--ggs:0.42]"
      />
      <input
        aria-label={`${label} filter`}
        className="min-w-0 flex-1 border-solid border-transparent bg-transparent pb-0.5 text-left text-[10px] uppercase tracking-[0.18em] text-[color:var(--flat-dim)] outline-none [border-width:0_0_1px_0] hover:border-[color:var(--flat-border-strong)] focus:border-[color:var(--flat-focus)]"
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
    ? "relative truncate py-1 pr-3 text-right text-[color:var(--flat-soft-text)] after:absolute after:right-0 after:top-1/2 after:h-1.5 after:w-1.5 after:-translate-y-1/2 after:bg-[color:var(--flat-port-dot)] after:content-['']"
    : "relative truncate py-1 pl-3 text-[color:var(--flat-soft-text)] before:absolute before:left-0 before:top-1/2 before:h-1.5 before:w-1.5 before:-translate-y-1/2 before:bg-[color:var(--flat-input-dot)] before:content-['']";

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
      className="relative grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] gap-y-2 border-b border-[color:var(--flat-border-strong)] px-3 py-2 before:absolute before:bottom-2 before:left-1/2 before:top-2 before:w-px before:bg-[color:var(--flat-border-soft)] before:content-['']"
      data-flat-shell-strip="ports"
    >
      <FlatPrototypePortList align="left" label="In" ports={inputPorts} />
      <FlatPrototypePortList align="right" label="Out" ports={outputPorts} />
    </section>
  );
}

function getRowGroupClassName(variant: "pinned" | "body") {
  if (variant === "pinned") {
    return "border-b border-[color:var(--flat-border-strong)] bg-[color:var(--flat-pinned-bg)] px-3 py-2";
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
        <p className={`mb-2 ${HEADER_LABEL_CLASS_NAME}`}>{label}</p>
      ) : null}
      <ol>
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
  const railDepth = Math.max(depth - 1, 0);
  const rowStyle =
    depth > 0
      ? ({
          "--flat-depth": depth,
          "--flat-rail-left": `${railDepth * 0.875 + 1.0625}rem`,
        } satisfies FlatPrototypeRowStyle)
      : undefined;
  const nestedClassName = depth > 0 ? NESTED_ROW_RAIL_CLASS_NAME : "";
  const cellDividerClassName = isLast ? "" : ROW_CELL_DIVIDER_CLASS_NAME;
  const rowClassName = `relative grid min-h-7 grid-cols-[minmax(5.5rem,var(--flat-key-width))_minmax(0,1fr)] items-center gap-3 pr-2 pl-[calc(var(--flat-depth,0)*0.875rem+0.625rem)] ${ROW_HOVER_CLASS_NAME} ${nestedClassName} ${ROW_EMPHASIS_CLASS_NAMES[emphasis]}`;
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

export function FlatCallableSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="callable"
      title="rank_items"
      controlLabel="Args"
      controlPlaceholder="filter args"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
      lead={<FlatCallableTarget value="builtins.sorted" />}
    >
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

export function FlatDictSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatSectionShell
      kind="dict"
      title="workspace_profile"
      controlLabel="Entries"
      controlPlaceholder="filter keys"
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
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
      <section
        aria-label="Dark section prototypes"
        className="grid min-w-0 grid-cols-1 gap-6"
        data-flat-theme-preview="dark"
      >
        <FlatCallableSectionPrototype theme="dark" />
        <FlatDictSectionPrototype theme="dark" />
      </section>
      <section
        aria-label="Light section prototypes"
        className="grid min-w-0 grid-cols-1 gap-6"
        data-flat-theme-preview="light"
      >
        <FlatCallableSectionPrototype theme="light" />
        <FlatDictSectionPrototype theme="light" />
      </section>
    </article>
  );
}
