import { ColorPickerInput } from "components/Params/ParamUIs/ColorPickerInput";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import {
  useProjectState,
  useShareSession,
  useTemporaryMiscState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { route_set_section_style_color } from "utils/generatedEndpoints";

export function SectionStyleColorSettings({
  sectionId,
}: {
  sectionId: string;
}) {
  const projectConfigId = getCurrProjectConfigId();
  const { canEditLayout } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);

  const { styleColor, isFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      styleColor: impl.styleColor,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);

  const [localStyleColor, setLocalStyleColor] = useState<string | null>(
    styleColor,
  );
  const previewColorKey = getSectionStylePreviewColorKey(sectionId);

  const clearPreviewStyleColor = useCallback(() => {
    useTemporaryMiscState.setState(
      (state) => _.omit(state, [previewColorKey]),
      true,
    );
  }, [previewColorKey]);

  useEffect(() => {
    setLocalStyleColor(styleColor);
    clearPreviewStyleColor();
  }, [clearPreviewStyleColor, styleColor]);

  useEffect(() => clearPreviewStyleColor, [clearPreviewStyleColor]);

  const canEditStyleColor = (!isDeploymentMode || canEditLayout) && !isFrozen;

  const commitStyleColor = useCallback(
    (nextStyleColor: string | null) => {
      if (!canEditStyleColor) {
        return;
      }
      setLocalStyleColor(nextStyleColor);
      clearPreviewStyleColor();
      if (nextStyleColor === styleColor) {
        return;
      }
      dispatchOptimisticProjectStateUpdate({
        apply: (state) => {
          setCurrEffectiveSectionImplValue<"BaseSection">(state, sectionId, {
            styleColor: nextStyleColor,
          });
        },
        send: (frontendOpId) =>
          route_set_section_style_color({
            projectConfigId,
            sectionId,
            styleColor: nextStyleColor,
            frontendOpId,
          }),
      });
    },
    [
      canEditStyleColor,
      clearPreviewStyleColor,
      projectConfigId,
      sectionId,
      styleColor,
    ],
  );

  const previewStyleColor = useCallback(
    (nextStyleColor: string) => {
      if (!canEditStyleColor) {
        return;
      }
      setLocalStyleColor(nextStyleColor);
      useTemporaryMiscState.setState({
        [previewColorKey]: nextStyleColor,
      });
    },
    [canEditStyleColor, previewColorKey],
  );

  const isResetDisabled = !canEditStyleColor || localStyleColor === null;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-setta-100/70 px-3 py-2 dark:bg-setta-900/60">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-setta-600 dark:text-setta-400">
          Style
        </h3>
        <button
          type="button"
          className="rounded-full border border-setta-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-setta-600 shadow-sm transition hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850"
          onClick={() => commitStyleColor(null)}
          disabled={isResetDisabled}
          title="Reset to default (no custom style)"
        >
          Reset
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="single-cell-container h-8 min-h-0 w-36 min-w-0">
          <ColorPickerInput
            colorChoices={[]}
            value={localStyleColor ?? "#3b82f6"}
            onChange={(v) => previewStyleColor(v)}
            onCommit={(v) => commitStyleColor(v)}
            onEscape={() => {
              setLocalStyleColor(styleColor);
              clearPreviewStyleColor();
            }}
            isDisabled={!canEditStyleColor}
            wrapperClassName="single-cell-container h-8 min-h-0 w-full min-w-0"
            colorPickerChoicesClasses="flex w-full cursor-pointer items-center overflow-hidden rounded-lg single-cell-container h-8 min-h-0 min-w-0 items-center text-white disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>

        <div className="min-w-0">
          {localStyleColor ? (
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                style={{ backgroundColor: localStyleColor }}
              />
              <p className="truncate font-mono text-[11px] text-setta-600 dark:text-setta-400">
                {localStyleColor}
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
