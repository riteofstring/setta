import _ from "lodash";
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_code_file_binding } from "utils/generatedEndpoints";
import {
  CodeFileAccessMode,
  CodeFileAccessModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

type CodeBindingState = {
  canonicalPath: string;
  accessMode: CodeFileAccessMode;
  isFrozen: boolean;
};

const ACCESS_MODE_LABELS: Record<CodeFileAccessMode, string> = {
  [CodeFileAccessModeEnum.read_write]: "Read & Write",
  [CodeFileAccessModeEnum.read_only]: "Read Only",
  [CodeFileAccessModeEnum.write_only]: "Write Only",
};

export function CodeAreaSettings({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  const { canonicalPath, accessMode, isFrozen } = useProjectState(
    (state): CodeBindingState => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Code,
      );
      const binding = impl.codeFileBinding;
      return {
        canonicalPath: binding?.canonical_path ?? "",
        accessMode: binding?.access_mode ?? CodeFileAccessModeEnum.read_write,
        isFrozen: impl.isFrozen,
      };
    },
    _.isEqual,
  );

  const [localCanonicalPath, setLocalCanonicalPath] = useState(canonicalPath);

  useEffect(() => {
    setLocalCanonicalPath(canonicalPath);
  }, [canonicalPath]);

  const sendBinding = useCallback(
    (nextCanonicalPath: string, nextAccessMode: CodeFileAccessMode) => {
      if (!canEditStructure) {
        return;
      }
      const trimmedPath = nextCanonicalPath.trim();
      if (!trimmedPath) {
        setLocalCanonicalPath(canonicalPath);
        return;
      }

      void route_set_code_file_binding({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        binding: {
          canonical_path: trimmedPath,
          access_mode: nextAccessMode,
        },
      });

      setLocalCanonicalPath(trimmedPath);
    },
    [canEditStructure, canonicalPath, sectionId],
  );

  const onCanonicalPathBlur = useCallback(() => {
    sendBinding(localCanonicalPath, accessMode);
  }, [accessMode, localCanonicalPath, sendBinding]);

  const onCanonicalPathKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
    },
    [],
  );

  const onAccessModeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextMode = event.target.value as CodeFileAccessMode;
      sendBinding(canonicalPath, nextMode);
    },
    [canonicalPath, sendBinding],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-setta-700 dark:text-setta-300">
          File Path
        </label>
        <input
          data-testid="code-area-settings-file-path-input"
          className="box-border w-full min-w-0 truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
          value={localCanonicalPath}
          onChange={(event) => setLocalCanonicalPath(event.target.value)}
          onBlur={onCanonicalPathBlur}
          onKeyDown={onCanonicalPathKeyDown}
          disabled={isFrozen || !canEditStructure}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Access Mode
        </label>
        <select
          data-testid="code-area-settings-access-mode-select"
          className="box-border w-full min-w-0 rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
          value={accessMode}
          onChange={onAccessModeChange}
          disabled={isFrozen || !canEditStructure}
        >
          {Object.values(CodeFileAccessModeEnum).map((mode) => (
            <option key={mode} value={mode}>
              {ACCESS_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
