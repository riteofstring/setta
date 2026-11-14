import { useItemSelectionMode } from "../../document/itemSelectionMode.js";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction.js";
import { handleSectionControlEscape } from "../sectionFocus.js";
import { MetaTextValueEditor } from "../text/TextValueEditor.js";
import type {
  ButtonMetaControl,
  CustomMetaControl,
  MetaControlDefinition,
  TextAreaMetaControl,
  TextMetaControl,
} from "./metaControlDefinitions.js";
import { MetaControlTitleStack } from "./MetaControlTitleStack.js";
import { assertMetaControlKind } from "./metaControlTypes.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";
import { MetaValueControl } from "./MetaValueControl.js";

export type {
  ButtonMetaControl,
  ColorMetaControl,
  CustomMetaControl,
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
} from "./metaControlDefinitions.js";

export type MetaControlProps = {
  sectionId: string;
  sectionName: string;
  showSectionTitle?: boolean;
  control: MetaControlDefinition;
};

const BUTTON_WRAPPER_CLASS_NAME = "flex h-full w-full items-stretch";
const BUTTON_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex h-full min-h-8 w-full items-center justify-center rounded-lg border border-setta-600 bg-setta-600 px-3 text-xs font-semibold text-white shadow-sm motion-safe:transition-all hover:border-setta-700 hover:bg-setta-700 motion-safe:active:translate-y-[2px] motion-safe:active:scale-[0.96] active:bg-setta-700 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-setta-500 dark:bg-setta-700 dark:text-setta-50 dark:hover:border-setta-400 dark:hover:bg-setta-600 dark:active:bg-setta-600 cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60`;

export function MetaControl({
  sectionId,
  sectionName,
  showSectionTitle = false,
  control,
}: MetaControlProps) {
  assertMetaControlKind(
    (control as { kind?: unknown } | null | undefined)?.kind,
  );
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
}: Required<
  Pick<MetaControlProps, "sectionId" | "sectionName" | "showSectionTitle">
> &
  Pick<MetaControlProps, "control">) {
  if (control.kind === "button") {
    return (
      <ButtonControl
        sectionId={sectionId}
        sectionName={sectionName}
        showSectionTitle={showSectionTitle}
        control={control}
      />
    );
  }
  if (control.kind === "custom") {
    return (
      <CustomControl
        sectionId={sectionId}
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

function CustomControl({
  sectionId,
  sectionName,
  showSectionTitle,
  control,
}: {
  sectionId: string;
  sectionName: string;
  showSectionTitle: boolean;
  control: CustomMetaControl;
}) {
  const host = useWorkspaceHost();
  const isSelectingItems = useItemSelectionMode(
    (state) => state.isSelectingItems,
  );
  return (
    <MetaControlTitleStack
      showSectionTitle={showSectionTitle}
      sectionName={sectionName}
      contentClassName="items-stretch"
    >
      <div
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} h-full min-h-0 w-full min-w-0`}
        role="group"
        aria-label={sectionName}
        onKeyDown={(event) =>
          handleSectionControlEscape(host, event, sectionId)
        }
      >
        {control.render({
          disabled: Boolean(control.disabled || isSelectingItems),
        })}
      </div>
    </MetaControlTitleStack>
  );
}

function ButtonControl({
  sectionId,
  sectionName,
  showSectionTitle,
  control,
}: {
  sectionId: string;
  sectionName: string;
  showSectionTitle: boolean;
  control: ButtonMetaControl;
}) {
  const host = useWorkspaceHost();
  const isSelectingItems = useItemSelectionMode(
    (state) => state.isSelectingItems,
  );
  const isDisabled = Boolean(
    control.disabled || control.pending || isSelectingItems,
  );
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
          onKeyDown={(event) =>
            handleSectionControlEscape(host, event, sectionId)
          }
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
