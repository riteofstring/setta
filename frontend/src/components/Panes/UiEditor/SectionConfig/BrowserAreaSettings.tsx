import _ from "lodash";
import { setBrowserSavedSearches } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useCallback } from "react";
import { FiFileText, FiMusic, FiTrash2, FiVideo } from "react-icons/fi";
import { IoImageOutline } from "react-icons/io5";
import { MdDataArray } from "react-icons/md";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import type { FileBrowserSearchScope } from "utils/fileBrowserTypes";
import {
  BrowserSavedSearch,
  BrowserSavedSearchTypeFilters,
  BrowserSearchScopeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
type BrowserAreaSettingsProps = {
  sectionId: string;
};
const TYPE_FILTERS: Array<{
  key: keyof BrowserSavedSearchTypeFilters;
  label: string;
  icon: JSX.Element;
}> = [
  { key: "image", label: "Image", icon: <IoImageOutline /> },
  { key: "video", label: "Video", icon: <FiVideo /> },
  { key: "audio", label: "Audio", icon: <FiMusic /> },
  { key: "text", label: "Text", icon: <FiFileText /> },
  { key: "data", label: "Data", icon: <MdDataArray /> },
];
function updateSavedSearchesOptimistically({
  sectionId,
  nextSavedSearches,
}: {
  sectionId: string;
  nextSavedSearches: BrowserSavedSearch[];
}) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"BrowserSection">(state, sectionId, {
        savedSearches: nextSavedSearches,
      });
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setBrowserSavedSearches({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionId,
            savedSearches: nextSavedSearches,
            frontendOpId,
          },
        } as Parameters<typeof setBrowserSavedSearches>[0]),
      ),
  });
}
export function BrowserAreaSettings({ sectionId }: BrowserAreaSettingsProps) {
  const { canEditLayout } = useShareCapabilities();
  const { savedSearches, isFrozen } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Browser,
    );
    return {
      savedSearches: impl.savedSearches ?? [],
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  const isDisabled = !canEditLayout || isFrozen;
  const updateSearch = useCallback(
    (id: string, patch: Partial<BrowserSavedSearch>) => {
      if (isDisabled) {
        return;
      }
      const next = savedSearches.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      );
      updateSavedSearchesOptimistically({ sectionId, nextSavedSearches: next });
    },
    [isDisabled, savedSearches, sectionId],
  );
  const deleteSearch = useCallback(
    (id: string) => {
      if (isDisabled) {
        return;
      }
      const next = savedSearches.filter((s) => s.id !== id);
      updateSavedSearchesOptimistically({ sectionId, nextSavedSearches: next });
    },
    [isDisabled, savedSearches, sectionId],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold text-setta-500 dark:text-setta-400">
          Saved Searches
        </p>
        <p className="text-xs text-setta-400 dark:text-setta-600">
          Create saved searches from the Browser section, then customize them
          here.
        </p>
      </div>

      {savedSearches.length === 0 ? (
        <p className="text-xs text-setta-400 dark:text-setta-600">
          No saved searches yet.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-col gap-3">
        {savedSearches.map((search) => (
          <div
            key={search.id}
            className="rounded-lg border border-setta-200 bg-white/70 p-3 dark:border-setta-800 dark:bg-setta-950/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: search.color || "#3b82f6" }}
                    aria-hidden="true"
                  />
                  <input
                    className="w-full min-w-0 truncate border-solid border-setta-200 bg-transparent text-sm font-semibold text-setta-700 outline-none [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:border-setta-800 dark:text-setta-200"
                    value={search.name ?? ""}
                    placeholder="Saved search name"
                    disabled={isDisabled}
                    onChange={(e) =>
                      updateSearch(search.id, { name: e.target.value })
                    }
                  />
                </div>
                <input
                  className="mt-2 w-full min-w-0 truncate border-solid border-setta-200 bg-transparent text-xs text-setta-600 outline-none [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:border-setta-800 dark:text-setta-300"
                  value={search.query ?? ""}
                  placeholder="Search query"
                  disabled={isDisabled}
                  onChange={(e) =>
                    updateSearch(search.id, { query: e.target.value })
                  }
                />
              </div>

              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-setta-400 transition-colors hover:bg-setta-100 hover:text-setta-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50 dark:hover:bg-setta-900 dark:hover:text-setta-200"
                disabled={isDisabled}
                aria-label="Delete saved search"
                onClick={() => deleteSearch(search.id)}
              >
                <FiTrash2 />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-setta-500 dark:text-setta-500">
                Scope
                <select
                  className="rounded-md border border-setta-200 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200"
                  value={search.searchScope}
                  disabled={isDisabled}
                  onChange={(e) =>
                    updateSearch(search.id, {
                      searchScope: e.target.value as FileBrowserSearchScope,
                    })
                  }
                >
                  <option value={BrowserSearchScopeEnum.recursive}>
                    Recursive
                  </option>
                  <option value={BrowserSearchScopeEnum.local}>Local</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-setta-500 dark:text-setta-500">
                Color
                <input
                  type="color"
                  value={search.color || "#3b82f6"}
                  disabled={isDisabled}
                  onChange={(e) =>
                    updateSearch(search.id, { color: e.target.value })
                  }
                  className="h-7 w-10 cursor-pointer rounded-md border border-setta-200 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-800"
                  aria-label="Saved search color"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1">
              {TYPE_FILTERS.map((filter) => {
                const enabled = search.typeFilters?.[filter.key] === true;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50 ${
                      enabled
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200"
                        : "text-setta-600 hover:bg-setta-100 dark:text-setta-400 dark:hover:bg-setta-900"
                    }`}
                    disabled={isDisabled}
                    aria-pressed={enabled}
                    onClick={() => {
                      const nextTypeFilters: BrowserSavedSearchTypeFilters = {
                        ...search.typeFilters,
                        [filter.key]: !enabled,
                      };
                      updateSearch(search.id, { typeFilters: nextTypeFilters });
                    }}
                  >
                    <span className={enabled ? "text-blue-600" : ""}>
                      {filter.icon}
                    </span>
                    {filter.label}
                  </button>
                );
              })}
            </div>

            <textarea
              className="mt-3 w-full resize-none rounded-md border border-setta-200 bg-white px-3 py-2 text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-200"
              placeholder="Quick info (shown in tooltips)"
              value={search.quickInfo ?? ""}
              disabled={isDisabled}
              rows={3}
              onChange={(e) =>
                updateSearch(search.id, { quickInfo: e.target.value })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
