import type { ChangeEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import { useSettings } from "state/stores/uiPreferenceStores";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import { route_save_settings } from "utils/generatedEndpoints";
import { createSettingsState } from "utils/generatedTypes";

export function ProjectAISettingsGuardrails({ canEdit }: { canEdit: boolean }) {
  const completionGuardEnabled = useSettings(
    (settings) => settings.backend.completionGuardEnabled,
  );
  const [isSavingCompletionGuard, setIsSavingCompletionGuard] = useState(false);
  const completionGuardSaveRequestIdRef = useRef(0);

  const handleCompletionGuardEnabledChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (!canEdit || isSavingCompletionGuard) {
        return;
      }
      const checked = event.target.checked;
      const currentSettings = createSettingsState(useSettings.getState());
      const nextSettings = {
        ...currentSettings,
        backend: {
          ...currentSettings.backend,
          completionGuardEnabled: checked,
        },
      };
      const requestId = completionGuardSaveRequestIdRef.current + 1;
      completionGuardSaveRequestIdRef.current = requestId;
      setIsSavingCompletionGuard(true);
      void (async () => {
        const response = await route_save_settings({ settings: nextSettings });
        if (requestId !== completionGuardSaveRequestIdRef.current) {
          return;
        }
        setIsSavingCompletionGuard(false);
        if (!res200(response)) {
          const detail = getErrorDetail(response.data);
          addTemporaryNotification(
            detail ?? "Failed to save completion guard setting.",
            "error",
          );
          return;
        }
        useSettings.setState(nextSettings);
      })();
    },
    [canEdit, isSavingCompletionGuard],
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-setta-200/70 bg-setta-50/70 p-3 text-xs text-setta-600 dark:border-setta-800/70 dark:bg-setta-900/40 dark:text-setta-300">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={completionGuardEnabled}
          onChange={handleCompletionGuardEnabledChange}
          disabled={!canEdit || isSavingCompletionGuard}
          data-testid="project-ai-settings-completion-guard-toggle"
          className="h-4 w-4 cursor-pointer rounded border border-setta-300 bg-white text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-600 dark:bg-setta-950"
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-setta-600 dark:text-setta-200">
          Require verification before completion
        </span>
      </label>
      <p className="m-0 text-[11px] leading-5 text-setta-500 dark:text-setta-400">
        When enabled, final completion responses require structured verification
        check results.
      </p>
      {!canEdit ? (
        <p className="m-0 text-[11px] text-setta-500 dark:text-setta-400">
          Guardrail settings are read-only in share mode.
        </p>
      ) : null}
    </div>
  );
}
