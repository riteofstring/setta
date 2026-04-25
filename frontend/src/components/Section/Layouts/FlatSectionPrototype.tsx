import { useId, useState, type CSSProperties } from "react";

import "./FlatSectionPrototype.css";

type FlatSectionKind = "callable" | "dict";

type FlatPrototypeTheme = "dark" | "light";

type FlatPrototypePortSide = "in" | "out";

type FlatPrototypeRowZone = "pinned" | "body";

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
  height?: number;
};

type FlatPrototypePort = {
  id: string;
  label: string;
  side: FlatPrototypePortSide;
};

type FlatPrototypeRenderedRow = Required<Pick<FlatPrototypeRow, "height">> &
  FlatPrototypeRow & {
    hasDivider: boolean;
    isZoneEnd: boolean;
    zone: FlatPrototypeRowZone;
  };

type FlatPrototypeSectionProps = {
  controlsInitiallyOpen?: boolean;
  theme?: FlatPrototypeTheme;
};

type FlatPrototypeCardProps = FlatPrototypeSectionProps & {
  callableName?: string;
  controlLabel: string;
  kind: FlatSectionKind;
  pinnedRows: FlatPrototypeRow[];
  ports?: FlatPrototypePort[];
  rows: FlatPrototypeRow[];
  title: string;
};

type FlatPrototypeStyle = CSSProperties &
  Partial<
    Record<
      "--flat-rail-left" | "--flat-row-height" | "--flat-row-indent",
      string
    >
  >;

const CALLABLE_PORTS: FlatPrototypePort[] = [
  {
    id: "items",
    label: "items",
    side: "in",
  },
  {
    id: "limit",
    label: "limit",
    side: "in",
  },
  {
    id: "result",
    label: "result",
    side: "out",
  },
];

const CALLABLE_PINNED_ROWS: FlatPrototypeRow[] = [
  {
    keyLabel: "limit",
    valueLabel: "connected",
    emphasis: "edge",
    height: 45,
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
    height: 45,
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
    iconClassName: "gg-math-minus",
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
    extraClassName: "flat-section-card__action--resize",
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
    modifierClassName: "flat-section-card__control--lock",
  },
  {
    label: "Minimize section",
    iconClassName: "gg-math-minus",
  },
  {
    label: "Close section",
    iconClassName: "gg-close",
  },
];

const SECTION_KIND_ICON_CLASS_NAMES: Record<FlatSectionKind, string> = {
  callable: "gg-code-slash",
  dict: "gg-list",
};

const DEFAULT_ROW_HEIGHT = 29;
const ROW_INDENT_REM = 0.875;
const RAIL_BASE_REM = 1.1875;

function renderRows({
  pinnedRows,
  rows,
}: {
  pinnedRows: FlatPrototypeRow[];
  rows: FlatPrototypeRow[];
}) {
  const renderedPinnedRows = pinnedRows.map((row, index) =>
    renderRow({
      row,
      hasDivider: index < pinnedRows.length - 1,
      isZoneEnd: index === pinnedRows.length - 1,
      zone: "pinned",
    }),
  );
  const renderedRows = rows.map((row, index) =>
    renderRow({
      row,
      hasDivider: index < rows.length - 1,
      isZoneEnd: false,
      zone: "body",
    }),
  );
  return [...renderedPinnedRows, ...renderedRows];
}

function renderRow({
  row,
  hasDivider,
  isZoneEnd,
  zone,
}: {
  row: FlatPrototypeRow;
  hasDivider: boolean;
  isZoneEnd: boolean;
  zone: FlatPrototypeRowZone;
}): FlatPrototypeRenderedRow {
  return {
    ...row,
    hasDivider,
    height: row.height ?? DEFAULT_ROW_HEIGHT,
    isZoneEnd,
    zone,
  };
}

function FlatPrototypeCard({
  callableName,
  controlLabel,
  controlsInitiallyOpen = false,
  kind,
  pinnedRows,
  ports = [],
  rows,
  theme = "dark",
  title,
}: FlatPrototypeCardProps) {
  const controlBarId = useId();
  const [isControlBarOpen, setIsControlBarOpen] = useState(
    controlsInitiallyOpen,
  );
  const renderedRows = renderRows({ pinnedRows, rows });

  return (
    <section
      aria-label={title}
      className={`flat-section-card flat-section-card--${kind}`}
      data-flat-controls-open={isControlBarOpen}
      data-flat-preview-theme={theme}
      data-flat-section-kind={kind}
      data-flat-section-shell="true"
    >
      <header className="flat-section-card__header">
        <button
          type="button"
          className={`flat-section-card__type ${SECTION_KIND_ICON_CLASS_NAMES[kind]}`}
          aria-label={`Open ${kind} section menu`}
          data-flat-section-type-menu="true"
        />
        <h2 className="flat-section-card__title">{title}</h2>
        <nav
          className="flat-section-card__controls"
          aria-label={`${kind} section controls`}
        >
          <button
            type="button"
            className="flat-section-card__control flat-section-card__control--toggle gg-options"
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
              className={`flat-section-card__control ${control.modifierClassName ?? ""} ${control.iconClassName}`}
              aria-label={control.label}
            />
          ))}
        </nav>
      </header>
      {callableName ? (
        <input
          aria-label="Callable function name"
          className="flat-section-card__callable"
          name="callable-function"
          placeholder="please enter function name"
          readOnly
          value={callableName}
        />
      ) : null}
      {isControlBarOpen ? (
        <FlatPrototypeActionBar id={controlBarId} label={controlLabel} />
      ) : null}
      {ports.length > 0 ? (
        <section
          className="flat-section-card__ports-area"
          data-flat-shell-strip="ports"
        >
          <FlatPrototypePortList ports={ports} side="in" />
          <FlatPrototypePortList ports={ports} side="out" />
        </section>
      ) : null}
      <ol className="flat-section-card__rows">
        {renderedRows.map((row, index) => (
          <FlatPrototypeRowItem
            key={`${row.zone}-${row.keyLabel}-${index}`}
            row={row}
          />
        ))}
      </ol>
    </section>
  );
}

function FlatPrototypeActionBar({ id, label }: { id: string; label: string }) {
  return (
    <nav
      id={id}
      className="flat-section-card__actions"
      aria-label={`${label} controls`}
    >
      {FLAT_PROTOTYPE_ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`flat-section-card__action ${action.iconClassName} ${action.extraClassName ?? ""}`}
          aria-label={`${action.label} placeholder action`}
          data-flat-control={action.dataAttr}
        />
      ))}
      <b aria-hidden="true" className="flat-section-card__search gg-search" />
      <input
        aria-label={`${label} filter`}
        className="flat-section-card__filter"
        name={`${label.toLowerCase()}-filter`}
        readOnly
        value="filter"
      />
    </nav>
  );
}

function FlatPrototypePortList({
  ports,
  side,
}: {
  ports: FlatPrototypePort[];
  side: FlatPrototypePortSide;
}) {
  const sidePorts = ports.filter((port) => port.side === side);

  return (
    <ol
      className={`flat-section-card__ports flat-section-card__ports--${side}`}
      data-flat-port-label={side === "in" ? "IN" : "OUT"}
    >
      {sidePorts.map((port) => (
        <li
          key={port.id}
          className="flat-section-card__port"
          data-flat-port-id={port.id}
        >
          {port.label}
        </li>
      ))}
    </ol>
  );
}

function FlatPrototypeRowItem({ row }: { row: FlatPrototypeRenderedRow }) {
  const depth = row.depth ?? 0;
  const emphasis = row.emphasis ?? "required";
  const valueWithTrailing =
    row.trailing === null
      ? row.valueLabel
      : `${row.valueLabel}${row.trailing ?? ":"}`;
  const rowStyle = {
    "--flat-rail-left": `${(Math.max(depth - 1, 0) * ROW_INDENT_REM + RAIL_BASE_REM).toFixed(4)}rem`,
    "--flat-row-height": `${row.height}px`,
    "--flat-row-indent": `${depth * ROW_INDENT_REM}rem`,
  } satisfies FlatPrototypeStyle;

  return (
    <li
      className="flat-section-card__row"
      data-flat-row-divider={row.hasDivider}
      data-flat-row-depth={depth}
      data-flat-row-emphasis={emphasis}
      data-flat-row-key={row.keyLabel}
      data-flat-row-zone={row.zone}
      data-flat-row-zone-end={row.isZoneEnd}
      style={rowStyle}
    >
      <b>{row.keyLabel}</b>
      <code>{valueWithTrailing}</code>
    </li>
  );
}

export function FlatCallableSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatPrototypeCard
      callableName="builtins.sorted"
      controlLabel="Args"
      controlsInitiallyOpen={controlsInitiallyOpen}
      kind="callable"
      pinnedRows={CALLABLE_PINNED_ROWS}
      ports={CALLABLE_PORTS}
      rows={CALLABLE_ROWS}
      theme={theme}
      title="rank_items"
    />
  );
}

export function FlatDictSectionPrototype({
  controlsInitiallyOpen,
  theme = "dark",
}: FlatPrototypeSectionProps = {}) {
  return (
    <FlatPrototypeCard
      controlLabel="Entries"
      controlsInitiallyOpen={controlsInitiallyOpen}
      kind="dict"
      pinnedRows={DICT_PINNED_ROWS}
      rows={DICT_ROWS}
      theme={theme}
      title="workspace_profile"
    />
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
