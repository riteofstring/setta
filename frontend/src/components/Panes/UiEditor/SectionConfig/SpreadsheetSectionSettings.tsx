import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { setSpreadsheetSectionSettings } from "openapi/http";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  SectionTypeEnum,
  SpreadsheetGridDensity,
  SpreadsheetGridDensityEnum,
} from "utils/generatedTypes";
export function SpreadsheetSectionSettings({
  sectionId,
}: {
  sectionId: string;
}) {
  const { canEditLayout } = useShareCapabilities();
  const {
    readOnly,
    showRowNumbers,
    density,
    autoReloadOnExternalChange,
    isFrozen,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Spreadsheet,
    );
    return {
      readOnly: impl.readOnly,
      showRowNumbers: impl.showRowNumbers,
      density: impl.density,
      autoReloadOnExternalChange: impl.autoReloadOnExternalChange,
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  const isDisabled = isFrozen || !canEditLayout;
  function persist(next: {
    readOnly: boolean;
    showRowNumbers: boolean;
    density: SpreadsheetGridDensity;
    autoReloadOnExternalChange: boolean;
  }) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"SpreadsheetSection">(
          state,
          sectionId,
          {
            readOnly: next.readOnly,
            showRowNumbers: next.showRowNumbers,
            density: next.density,
            autoReloadOnExternalChange: next.autoReloadOnExternalChange,
          },
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setSpreadsheetSectionSettings({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              readOnly: next.readOnly,
              showRowNumbers: next.showRowNumbers,
              density: next.density,
              autoReloadOnExternalChange: next.autoReloadOnExternalChange,
              frontendOpId,
            },
          } as Parameters<typeof setSpreadsheetSectionSettings>[0]),
        ),
    });
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 p-2 dark:border-setta-700/70">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Spreadsheet
      </p>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        Bind files via drag/drop from Browser or OS. Configure this section as a
        programmable data grid surface.
      </p>

      <label className="text-xs text-setta-600 dark:text-setta-300">
        Grid density
        <select
          value={density}
          onChange={(event) =>
            persist({
              readOnly,
              showRowNumbers,
              density: event.target.value as SpreadsheetGridDensity,
              autoReloadOnExternalChange,
            })
          }
          disabled={isDisabled}
          className="mt-1 w-full rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        >
          <option value={SpreadsheetGridDensityEnum.compact}>Compact</option>
          <option value={SpreadsheetGridDensityEnum.comfortable}>
            Comfortable
          </option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
        <input
          type="checkbox"
          checked={readOnly}
          onChange={(event) =>
            persist({
              readOnly: event.target.checked,
              showRowNumbers,
              density,
              autoReloadOnExternalChange,
            })
          }
          disabled={isDisabled}
        />
        Read-only grid
      </label>

      <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
        <input
          type="checkbox"
          checked={showRowNumbers}
          onChange={(event) =>
            persist({
              readOnly,
              showRowNumbers: event.target.checked,
              density,
              autoReloadOnExternalChange,
            })
          }
          disabled={isDisabled}
        />
        Show row numbers
      </label>

      <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
        <input
          type="checkbox"
          checked={autoReloadOnExternalChange}
          onChange={(event) =>
            persist({
              readOnly,
              showRowNumbers,
              density,
              autoReloadOnExternalChange: event.target.checked,
            })
          }
          disabled={isDisabled}
        />
        Auto-reload when file changes
      </label>
    </div>
  );
}
