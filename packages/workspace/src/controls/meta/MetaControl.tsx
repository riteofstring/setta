import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { MetaTextValueEditor } from "../text/TextValueEditor";
import type {
  ButtonMetaControl,
  MetaControlDefinition,
  TextAreaMetaControl,
  TextMetaControl,
} from "./metaControlDefinitions";
import { MetaControlTitleStack } from "./MetaControlTitleStack";
import { assertMetaControlKind } from "./metaControlTypes";
import { MetaValueControl } from "./MetaValueControl";

export type {
  ButtonMetaControl,
  ColorMetaControl,
  DateMetaControl,
  DropdownMetaControl,
  DropzoneMetaControl,
  MetaControlDefinition,
  PasswordMetaControl,
  RotaryMetaControl,
  SliderMetaControl,
  SwitchMetaControl,
  TextAreaMetaControl,
  TextMetaControl,
  TimeMetaControl,
} from "./metaControlDefinitions";

export type MetaControlProps = {
  sectionId: string;
  sectionName: string;
  showSectionTitle?: boolean;
  control: MetaControlDefinition;
};

const BUTTON_WRAPPER_CLASS_NAME = "flex h-full w-full items-stretch";
const BUTTON_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex h-full min-h-8 w-full items-center justify-center rounded-lg border border-setta-600 bg-setta-600 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:border-setta-700 hover:bg-setta-700 active:translate-y-[2px] active:scale-[0.96] active:bg-setta-700 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-setta-500 dark:bg-setta-700 dark:text-setta-50 dark:hover:border-setta-400 dark:hover:bg-setta-600 dark:active:bg-setta-600 cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60`;

export function MetaControl({
  sectionId,
  sectionName,
  showSectionTitle = false,
  control,
}: MetaControlProps) {
  // Public TypeScript callers already have the discriminated union; this runtime assertion keeps
  // opaque-data adapters honest and preserves the package's specific no-fallback failure.
  assertMetaControlKind((control as { kind?: unknown }).kind);
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
  Pick<MetaControlProps, "control">) {
  if (control.kind === "button") {
    return (
      <ButtonControl
        sectionName={sectionName}
        showSectionTitle={showSectionTitle}
        control={control}
      />
    );
  }
  if (control.kind === "text" || control.kind === "textarea") {
    return (
      <TextControl
        sectionId={sectionId}
        sectionName={sectionName}
        showSectionTitle={showSectionTitle}
        control={control}
      />
    );
  }
  return (
    <MetaValueControl
      sectionId={sectionId}
      sectionName={sectionName}
      showSectionTitle={showSectionTitle}
      control={control}
    />
  );
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
  control: TextMetaControl | TextAreaMetaControl;
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
        metaMinimumHeight={control.kind === "textarea"}
      />
    </MetaControlTitleStack>
  );
}
