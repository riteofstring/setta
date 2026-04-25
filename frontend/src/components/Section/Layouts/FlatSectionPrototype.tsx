import { useId, useState, type CSSProperties, type ReactNode } from "react";
import "./FlatSectionPrototype.css";

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
  nestedRailRole?: FlatPrototypeNestedRailRole;
};

type FlatPrototypeNestedRailRole = "single" | "start" | "middle" | "end";

type FlatSectionShellProps = {
  kind: FlatSectionKind;
  title: string;
  controlLabel: string;
  controlsInitiallyOpen?: boolean;
  theme?: FlatPrototypeTheme;
  lead?: ReactNode;
  children: ReactNode;
};

type FlatPrototypeSectionProps = {
  controlsInitiallyOpen?: boolean;
  theme?: FlatPrototypeTheme;
};

type FlatPrototypeRowStyle = CSSProperties &
  Partial<Record<"--flat-depth-offset", string>> &
  Partial<Record<"--flat-rail-left", string>>;

const NESTED_ROW_RAIL_BASE_CLASS_NAME = "flat-section-prototype__row--rail";

const NESTED_ROW_RAIL_CLASS_NAMES: Record<FlatPrototypeNestedRailRole, string> =
  {
    single: "flat-section-prototype__row--rail-single",
    start: "flat-section-prototype__row--rail-start",
    middle: "flat-section-prototype__row--rail-middle",
    end: "flat-section-prototype__row--rail-end",
  };

const NESTED_ROW_RAIL_ROLE_BY_CONTINUITY = {
  "0:0": "single",
  "0:1": "start",
  "1:0": "end",
  "1:1": "middle",
} satisfies Record<string, FlatPrototypeNestedRailRole>;

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
    iconClassName: "gg-math-minus flat-section-prototype__icon-minus",
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
    extraClassName: "flat-section-prototype__action-button--resize",
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
    iconClassName: "gg-lock flat-section-prototype__top-button--lock",
  },
  {
    label: "Minimize section",
    iconClassName:
      "gg-math-minus flat-section-prototype__icon-minus flat-section-prototype__top-button--standard",
  },
  {
    label: "Close section",
    iconClassName: "gg-close flat-section-prototype__top-button--standard",
  },
];

const SECTION_KIND_ICON_CLASS_NAMES: Record<FlatSectionKind, string> = {
  callable: "gg-code-slash",
  dict: "gg-list",
};

function FlatSectionShell({
  kind,
  title,
  controlLabel,
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
      className={`flat-section-prototype flat-section-prototype--${theme}`}
      data-flat-section-kind={kind}
      data-flat-section-shell="true"
      data-flat-preview-theme={theme}
    >
      <header className="flat-section-prototype__header">
        <button
          type="button"
          className={`flat-section-prototype__kind-button ${SECTION_KIND_ICON_CLASS_NAMES[kind]}`}
          aria-label={`Open ${kind} section menu`}
          data-flat-section-type-menu="true"
        />
        <h2 className="flat-section-prototype__title">{title}</h2>
        <nav
          className="flat-section-prototype__top-controls"
          aria-label={`${kind} section controls`}
        >
          <button
            type="button"
            className="flat-section-prototype__top-button flat-section-prototype__control-toggle gg-options"
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
              className={`flat-section-prototype__top-button ${control.iconClassName}`}
              aria-label={control.label}
            />
          ))}
        </nav>
      </header>
      {lead}
      {isControlBarOpen ? (
        <FlatPrototypeActionBar id={controlBarId} label={controlLabel} />
      ) : null}
      {children}
    </section>
  );
}

function FlatCallableTarget({ value }: { value: string }) {
  return (
    <input
      aria-label="Callable function name"
      className="flat-section-prototype__callable-target"
      name="callable-function"
      placeholder="please enter function name"
      readOnly
      value={value}
    />
  );
}

function FlatPrototypeActionBar({ id, label }: { id: string; label: string }) {
  return (
    <nav
      id={id}
      className="flat-section-prototype__action-bar"
      data-flat-action-bar="true"
    >
      {FLAT_PROTOTYPE_ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`flat-section-prototype__action-button ${action.iconClassName} ${action.extraClassName ?? ""}`}
          aria-label={`${action.label} placeholder action`}
          data-flat-control={action.dataAttr}
        />
      ))}
      <b
        aria-hidden="true"
        className="flat-section-prototype__filter-icon gg-search"
      />
      <input
        aria-label={`${label} filter`}
        className="flat-section-prototype__filter-input"
        name={`${label.toLowerCase()}-filter`}
        readOnly
        value="filter"
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
  const alignClassName = isRightAligned ? "right" : "left";

  return (
    <ol
      className={`flat-section-prototype__port-list flat-section-prototype__port-list--${alignClassName}`}
      data-flat-port-label={label.toUpperCase()}
    >
      {ports.map((port) => (
        <li
          key={`${align}-${port}`}
          className={`flat-section-prototype__port-row flat-section-prototype__port-row--${alignClassName}`}
        >
          {port}
        </li>
      ))}
    </ol>
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
      className="flat-section-prototype__ports"
      data-flat-shell-strip="ports"
    >
      <FlatPrototypePortList align="left" label="In" ports={inputPorts} />
      <FlatPrototypePortList align="right" label="Out" ports={outputPorts} />
    </section>
  );
}

function getRowGroupClassName(variant: "pinned" | "body") {
  return `flat-section-prototype__row-group flat-section-prototype__row-group--${variant}`;
}

function FlatPrototypeRows({
  rows,
  variant = "body",
}: {
  rows: FlatPrototypeRow[];
  variant?: "pinned" | "body";
}) {
  return (
    <ol className={getRowGroupClassName(variant)} data-flat-row-group={variant}>
      {rows.map((row, index) => (
        <FlatPrototypeRowItem
          key={`${variant}-${row.keyLabel}-${index}`}
          {...row}
          nestedRailRole={getNestedRailRole(rows, index)}
        />
      ))}
    </ol>
  );
}

function getNestedRailRole(
  rows: FlatPrototypeRow[],
  index: number,
): FlatPrototypeNestedRailRole | undefined {
  const depth = rows[index]?.depth ?? 0;
  if (depth <= 0) {
    return undefined;
  }

  const previousContinuity = Number((rows[index - 1]?.depth ?? 0) >= depth);
  const nextContinuity = Number((rows[index + 1]?.depth ?? 0) >= depth);
  return NESTED_ROW_RAIL_ROLE_BY_CONTINUITY[
    `${previousContinuity}:${nextContinuity}`
  ];
}

function FlatPrototypeRowItem({
  keyLabel,
  valueLabel,
  depth = 0,
  emphasis = "required",
  trailing = ":",
  nestedRailRole,
}: FlatPrototypeRowProps) {
  const railDepth = Math.max(depth - 1, 0);
  const rowStyle =
    depth > 0
      ? ({
          "--flat-depth-offset": `${depth * 0.875}rem`,
          "--flat-rail-left": `${railDepth * 0.875 + 1.1875}rem`,
        } satisfies FlatPrototypeRowStyle)
      : undefined;
  const nestedClassName = nestedRailRole
    ? `${NESTED_ROW_RAIL_BASE_CLASS_NAME} ${NESTED_ROW_RAIL_CLASS_NAMES[nestedRailRole]}`
    : "";
  const rowClassName = `flat-section-prototype__row ${nestedClassName}`;
  const valueWithTrailing = trailing ? `${valueLabel}${trailing}` : valueLabel;

  return (
    <li
      className={rowClassName}
      data-flat-row-emphasis={emphasis}
      data-flat-row-key={keyLabel}
      style={rowStyle}
    >
      <b className="flat-section-prototype__row-key">{keyLabel}</b>
      <code className="flat-section-prototype__row-value">
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
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
      lead={<FlatCallableTarget value="builtins.sorted" />}
    >
      <FlatPrototypeStrip
        inputPorts={["items", "limit"]}
        outputPorts={["result"]}
      />
      <FlatPrototypeRows rows={CALLABLE_PINNED_ROWS} variant="pinned" />
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
      controlsInitiallyOpen={controlsInitiallyOpen}
      theme={theme}
    >
      <FlatPrototypeRows rows={DICT_PINNED_ROWS} variant="pinned" />
      <FlatPrototypeRows rows={DICT_ROWS} />
    </FlatSectionShell>
  );
}

export function FlatSectionPrototypeGallery() {
  return (
    <article
      className="flat-section-prototype-gallery"
      data-flat-section-gallery="true"
    >
      <section
        aria-label="Dark section prototypes"
        className="flat-section-prototype-gallery__column"
        data-flat-theme-preview="dark"
      >
        <FlatCallableSectionPrototype theme="dark" />
        <FlatDictSectionPrototype theme="dark" />
      </section>
      <section
        aria-label="Light section prototypes"
        className="flat-section-prototype-gallery__column"
        data-flat-theme-preview="light"
      >
        <FlatCallableSectionPrototype theme="light" />
        <FlatDictSectionPrototype theme="light" />
      </section>
    </article>
  );
}
