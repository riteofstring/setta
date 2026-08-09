import type { ReactNode } from "react";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { MetaTextValueEditor } from "../text/TextValueEditor";
import type { TextValueLanguage } from "../text/textValueLanguages";

export type ButtonMetaControl = {
  kind: "button";
  label: string;
  onAction: () => void;
  disabled?: boolean;
  pending?: boolean;
};

export type TextMetaControl = {
  kind: "text";
  controlId: string;
  ariaLabel: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  placeholder?: string;
  language?: TextValueLanguage | null;
  disabled?: boolean;
};

export type MetaControlDefinition = ButtonMetaControl | TextMetaControl;

export type MetaControlProps = {
  sectionId: string;
  sectionName: string;
  showSectionTitle?: boolean;
  control: MetaControlDefinition;
};

const BUTTON_WRAPPER_CLASS_NAME = "flex h-full w-full items-stretch";
const BUTTON_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex h-full min-h-8 w-full items-center justify-center rounded-lg border border-setta-600 bg-setta-600 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:border-setta-700 hover:bg-setta-700 active:translate-y-[2px] active:scale-[0.96] active:bg-setta-700 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-setta-500 dark:bg-setta-700 dark:text-setta-50 dark:hover:border-setta-400 dark:hover:bg-setta-600 dark:active:bg-setta-600 cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60`;

// The first meta-control surface batch deliberately supports only its representative Button and
// Text content. The dispatcher fails on any unrecognized runtime value; later audited batches
// extend this same union with the remaining frozen-main controls instead of adding a fallback.
export function MetaControl({
  sectionId,
  sectionName,
  showSectionTitle = false,
  control,
}: MetaControlProps) {
  return (
    <div className="col-span-full row-span-full flex h-full w-full items-stretch p-0">
      {renderMetaControl({ sectionId, sectionName, showSectionTitle, control })}
    </div>
  );
}

function renderMetaControl({
  sectionId,
  sectionName,
  showSectionTitle,
  control,
}: Required<Pick<MetaControlProps, "sectionId" | "sectionName" | "showSectionTitle">> &
  Pick<MetaControlProps, "control">): ReactNode {
  if (control.kind === "button") {
    return (
      <ButtonControl
        sectionName={sectionName}
        showSectionTitle={showSectionTitle}
        control={control}
      />
    );
  }
  if (control.kind === "text") {
    return (
      <TextControl
        sectionId={sectionId}
        sectionName={sectionName}
        showSectionTitle={showSectionTitle}
        control={control}
      />
    );
  }
  throw new Error(`Unknown meta control kind: ${String((control as { kind?: unknown }).kind)}.`);
}

function ButtonControl({
  sectionName,
  showSectionTitle,
  control,
}: {
  sectionName: string;
  showSectionTitle: boolean;
  control: ButtonMetaControl;
}) {
  const isSelectingItems = useItemSelectionMode((state) => state.isSelectingItems);
  const isDisabled = Boolean(control.disabled || control.pending || isSelectingItems);
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <div className={BUTTON_WRAPPER_CLASS_NAME}>
        <button
          type="button"
          className={BUTTON_CLASS_NAME}
          onClick={control.onAction}
          disabled={isDisabled}
          aria-busy={control.pending || undefined}
          data-meta-control-kind="button"
        >
          {control.label}
        </button>
      </div>
    </MetaControlTitleStack>
  );
}

function TextControl({
  sectionId,
  sectionName,
  showSectionTitle,
  control,
}: {
  sectionId: string;
  sectionName: string;
  showSectionTitle: boolean;
  control: TextMetaControl;
}) {
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <MetaTextValueEditor
        ariaLabel={control.ariaLabel}
        sectionId={sectionId}
        controlId={control.controlId}
        value={control.value}
        onValueChange={control.onValueChange}
        placeholder={control.placeholder}
        language={control.language === undefined ? "python" : control.language}
        singleLine={false}
        wrapLines
        disabled={control.disabled}
      />
    </MetaControlTitleStack>
  );
}

function MetaControlTitleStack({
  showSectionTitle,
  sectionName,
  children,
  contentClassName,
}: {
  showSectionTitle: boolean;
  sectionName: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  const showTitle = showSectionTitle && sectionName.trim().length > 0;
  return (
    <div className="relative h-full min-h-0 w-full min-w-0">
      {showTitle ? (
        <span className="pointer-events-none absolute left-0 top-0 z-10 -translate-y-full truncate text-[10px] uppercase tracking-[0.2em] text-setta-500 dark:text-setta-400">
          {sectionName}
        </span>
      ) : null}
      <div className={`flex h-full min-h-0 w-full min-w-0 ${contentClassName ?? ""}`}>
        {children}
      </div>
    </div>
  );
}
