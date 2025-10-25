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
import { route_set_code_file_binding } from "utils/generatedEndpoints";
import {
  CodeFileAccessMode,
  CodeFileAccessModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

type CodeBindingState = {
  canonicalPath: string;
  snapshotDir: string | null;
  accessMode: CodeFileAccessMode;
  isFrozen: boolean;
};

const ACCESS_MODE_LABELS: Record<CodeFileAccessMode, string> = {
  [CodeFileAccessModeEnum.read_write]: "Read & Write",
  [CodeFileAccessModeEnum.read_only]: "Read Only",
  [CodeFileAccessModeEnum.write_only]: "Write Only",
};

export function CodeAreaSettings({ sectionId }: { sectionId: string }) {
  const { canonicalPath, snapshotDir, accessMode, isFrozen } = useProjectState(
    (state): CodeBindingState => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Code,
      );
      const binding = impl.codeFileBinding;
      return {
        canonicalPath: binding?.canonical_path ?? "",
        snapshotDir: binding?.snapshot_dir ?? null,
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
          snapshot_dir: null,
          access_mode: nextAccessMode,
        },
      });

      setLocalCanonicalPath(trimmedPath);
    },
    [canonicalPath, sectionId],
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
          className="w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
          value={localCanonicalPath}
          onChange={(event) => setLocalCanonicalPath(event.target.value)}
          onBlur={onCanonicalPathBlur}
          onKeyDown={onCanonicalPathKeyDown}
          disabled={isFrozen}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-setta-700 dark:text-setta-300">
          Access Mode
        </label>
        <select
          className="rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-setta-900 dark:text-setta-400 dark:ring-setta-700"
          value={accessMode}
          onChange={onAccessModeChange}
          disabled={isFrozen}
        >
          {Object.values(CodeFileAccessModeEnum).map((mode) => (
            <option key={mode} value={mode}>
              {ACCESS_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>
      {snapshotDir ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-setta-700 dark:text-setta-300">
            Snapshot Directory
          </span>
          <span className="truncate text-xs text-setta-500 dark:text-setta-500">
            {snapshotDir}
          </span>
        </div>
      ) : null}
    </div>
  );
}
