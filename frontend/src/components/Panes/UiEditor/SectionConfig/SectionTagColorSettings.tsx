import {
  AvailableColors,
  ColorPickerInput,
} from "components/Params/ParamUIs/ColorPickerInput";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import _ from "lodash";
import { saveSettings } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
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
import { route_set_section_tag_color } from "utils/generatedEndpoints";
import {
  createSettingsState,
  type ColorPickerChoice,
} from "utils/generatedTypes";

const DEFAULT_SECTION_TAG_COLOR_CHOICES: ColorPickerChoice[] =
  createSettingsState().gui.sectionTagColorChoices;

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
          route_set_section_tag_color({
            projectConfigId,
            sectionId,
            tagColor: nextTagColor,
            frontendOpId,
          }),
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
          }),
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-setta-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-setta-600 shadow-sm transition hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850"
            onClick={() => setTagColor(null)}
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
                className="rounded-full border border-setta-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-setta-600 shadow-sm transition hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850"
                disabled={!canEditCategories}
                title={
                  canEditCategories
                    ? "Edit reusable color categories"
                    : "Color categories can only be edited in IDE mode"
                }
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
                  className="rounded-full border border-setta-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-setta-600 shadow-sm transition hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850"
                  onClick={() =>
                    setSectionTagColorChoices(DEFAULT_SECTION_TAG_COLOR_CHOICES)
                  }
                  disabled={!canEditCategories}
                  title="Reset categories to defaults"
                >
                  Reset
                </button>
              </div>
              <AvailableColors
                colorChoices={sectionTagColorChoices}
                addColor={() =>
                  setSectionTagColorChoices([
                    ...sectionTagColorChoices,
                    { color: "#3b82f6", description: "" },
                  ])
                }
                removeColor={(removeIdx) =>
                  setSectionTagColorChoices(
                    sectionTagColorChoices.filter(
                      (_, idx) => idx !== removeIdx,
                    ),
                  )
                }
                updateColor={(updateIdx, newColor) =>
                  setSectionTagColorChoices(
                    sectionTagColorChoices.map((choice, idx) =>
                      idx === updateIdx
                        ? { ...choice, color: newColor }
                        : choice,
                    ),
                  )
                }
                updateDescription={(updateIdx, description) =>
                  setSectionTagColorChoices(
                    sectionTagColorChoices.map((choice, idx) =>
                      idx === updateIdx ? { ...choice, description } : choice,
                    ),
                  )
                }
                isDisabled={!canEditCategories}
              />
            </div>
          </StandardPopover>
        </div>
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
          {localTagColor ? (
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                style={{ backgroundColor: localTagColor }}
              />
              <p className="truncate font-mono text-[11px] text-setta-600 dark:text-setta-400">
                {localTagColor}
              </p>
            </div>
          ) : (
            <p className="text-[11px] font-semibold text-setta-500 dark:text-setta-500">
              None
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
