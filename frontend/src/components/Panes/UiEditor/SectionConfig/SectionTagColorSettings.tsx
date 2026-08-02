import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import {
  AvailableColors,
  ColorPickerInput,
} from "components/Params/ParamUIs/ColorPickerInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import { saveSettings, setSectionTagColor } from "openapi/http";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  createSettingsState,
  type ColorPickerChoice,
} from "utils/generatedTypes";

const DEFAULT_SECTION_TAG_COLOR_CHOICES: ColorPickerChoice[] =
  createSettingsState().gui.sectionTagColorChoices;
const SECTION_TAG_ACTION_BUTTON_CLASS_NAME =
  "rounded-full border border-setta-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-setta-600 shadow-sm transition hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850";

type SectionTagColorActionsProps = {
  canEditCategories: boolean;
  isResetDisabled: boolean;
  onResetTagColor: () => void;
  colorChoices: ColorPickerChoice[];
  onChangeChoices: (nextChoices: ColorPickerChoice[]) => void;
};
type SectionTagColorValueProps = {
  value: string | null;
};

function appendSectionTagColorChoice(
  colorChoices: ColorPickerChoice[],
): ColorPickerChoice[] {
  return [...colorChoices, { color: "#3b82f6", description: "" }];
}

function removeSectionTagColorChoice(
  colorChoices: ColorPickerChoice[],
  removeIdx: number,
): ColorPickerChoice[] {
  return colorChoices.filter((_, idx) => idx !== removeIdx);
}

function updateSectionTagColorChoiceColor(
  colorChoices: ColorPickerChoice[],
  updateIdx: number,
  newColor: string,
): ColorPickerChoice[] {
  return colorChoices.map((choice, idx) =>
    idx === updateIdx ? { ...choice, color: newColor } : choice,
  );
}

function updateSectionTagColorChoiceDescription(
  colorChoices: ColorPickerChoice[],
  updateIdx: number,
  description: string,
): ColorPickerChoice[] {
  return colorChoices.map((choice, idx) =>
    idx === updateIdx ? { ...choice, description } : choice,
  );
}

function SectionTagColorActions({
  canEditCategories,
  isResetDisabled,
  onResetTagColor,
  colorChoices,
  onChangeChoices,
}: SectionTagColorActionsProps) {
  const categoriesTitle = canEditCategories
    ? "Edit reusable color categories"
    : "Color categories can only be edited in IDE mode";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={SECTION_TAG_ACTION_BUTTON_CLASS_NAME}
        onClick={onResetTagColor}
        disabled={isResetDisabled}
        title="Reset to default (no tag color)"
      >
        Reset
      </button>

      <StandardPopover
        arrowClasses="fill-white dark:fill-setta-800"
        contentClasses="z-50"
        trigger={
          <button
            type="button"
            className={SECTION_TAG_ACTION_BUTTON_CLASS_NAME}
            disabled={!canEditCategories}
            title={categoriesTitle}
          >
            Categories
          </button>
        }
      >
        <div className="w-[320px] max-w-[min(90vw,320px)] rounded-lg bg-white p-3 shadow-md dark:bg-setta-800">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wide text-setta-600 dark:text-setta-300">
              Color Categories
            </h4>
            <button
              type="button"
              className={SECTION_TAG_ACTION_BUTTON_CLASS_NAME}
              onClick={() => onChangeChoices(DEFAULT_SECTION_TAG_COLOR_CHOICES)}
              disabled={!canEditCategories}
              title="Reset categories to defaults"
            >
              Reset
            </button>
          </div>
          <AvailableColors
            colorChoices={colorChoices}
            addColor={() =>
              onChangeChoices(appendSectionTagColorChoice(colorChoices))
            }
            removeColor={(removeIdx) =>
              onChangeChoices(
                removeSectionTagColorChoice(colorChoices, removeIdx),
              )
            }
            updateColor={(updateIdx, newColor) =>
              onChangeChoices(
                updateSectionTagColorChoiceColor(
                  colorChoices,
                  updateIdx,
                  newColor,
                ),
              )
            }
            updateDescription={(updateIdx, description) =>
              onChangeChoices(
                updateSectionTagColorChoiceDescription(
                  colorChoices,
                  updateIdx,
                  description,
                ),
              )
            }
            isDisabled={!canEditCategories}
          />
        </div>
      </StandardPopover>
    </div>
  );
}

function SectionTagColorValue({ value }: SectionTagColorValueProps) {
  if (!value) {
    return (
      <p className="text-[11px] font-semibold text-setta-500 dark:text-setta-500">
        None
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10"
        style={{ backgroundColor: value }}
      />
      <p className="truncate font-mono text-[11px] text-setta-600 dark:text-setta-400">
        {value}
      </p>
    </div>
  );
}

export function SectionTagColorSettings({ sectionId }: { sectionId: string }) {
  const projectConfigId = getCurrProjectConfigId();
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { tagColor, isFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      tagColor: impl.tagColor,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  const sectionTagColorChoices =
    useSettings((x) => x.gui.sectionTagColorChoices, _.isEqual) ||
    DEFAULT_SECTION_TAG_COLOR_CHOICES;
  const [localTagColor, setLocalTagColor] = useState<string | null>(tagColor);
  useEffect(() => {
    setLocalTagColor(tagColor);
  }, [tagColor]);
  const canEditTagColor = (!isDeploymentMode || canEditLayout) && !isFrozen;
  const setTagColor = useCallback(
    (nextTagColor: string | null) => {
      if (!canEditTagColor) {
        return;
      }
      setLocalTagColor(nextTagColor);
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BaseSection">(state, sectionId, {
            tagColor: nextTagColor,
          });
        },
        send: (frontendOpId) =>
          callOpenAPI(
            setSectionTagColor({
              body: {
                projectConfigId,
                sectionId,
                tagColor: nextTagColor,
                frontendOpId,
              },
            } as Parameters<typeof setSectionTagColor>[0]),
          ),
      });
    },
    [canEditTagColor, projectConfigId, sectionId],
  );
  const saveSettingsDebounced = useMemo(
    () =>
      _.debounce(() => {
        if (!canEditStructure) {
          return;
        }
        void callOpenAPI(
          saveSettings({
            body: { settings: useSettings.getState() },
          } as Parameters<typeof saveSettings>[0]),
        );
      }, 400),
    [canEditStructure],
  );
  useEffect(() => {
    return () => {
      saveSettingsDebounced.cancel();
    };
  }, [saveSettingsDebounced]);
  const setSectionTagColorChoices = useCallback(
    (nextChoices: ColorPickerChoice[]) => {
      if (!canEditStructure) {
        return;
      }
      useSettings.setState((state) => ({
        ...state,
        gui: {
          ...state.gui,
          sectionTagColorChoices: nextChoices,
        },
      }));
      saveSettingsDebounced();
    },
    [canEditStructure, saveSettingsDebounced],
  );
  const canEditCategories = canEditStructure;
  const isResetDisabled = !canEditTagColor || localTagColor === null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-setta-100/70 px-3 py-2 dark:bg-setta-900/60">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-setta-600 dark:text-setta-400">
          Color Tag
        </h3>
        <SectionTagColorActions
          canEditCategories={canEditCategories}
          isResetDisabled={isResetDisabled}
          onResetTagColor={() => setTagColor(null)}
          colorChoices={sectionTagColorChoices}
          onChangeChoices={setSectionTagColorChoices}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="single-cell-container h-8 min-h-0 w-36 min-w-0">
          <ColorPickerInput
            colorChoices={sectionTagColorChoices}
            value={
              localTagColor ?? sectionTagColorChoices[0]?.color ?? "#3b82f6"
            }
            onChange={(v) => setTagColor(v)}
            isDisabled={!canEditTagColor}
            wrapperClassName="single-cell-container h-8 min-h-0 w-full min-w-0"
            colorPickerChoicesClasses="flex w-full cursor-pointer items-center overflow-hidden rounded-lg single-cell-container colorpicker h-8 min-h-0 min-w-0 items-center text-white disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>

        <div className="min-w-0">
          <SectionTagColorValue value={localTagColor} />
        </div>
      </div>
    </div>
  );
}
