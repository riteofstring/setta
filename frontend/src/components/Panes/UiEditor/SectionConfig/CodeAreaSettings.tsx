import _ from "lodash";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { route_set_code_file_binding } from "utils/generatedEndpoints";
import {
  CodeFileAccessMode,
  CodeFileAccessModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function CodeAreaSettings({ sectionId }: { sectionId: string }) {
  const binding = useProjectState(
    (state) => {
      const impl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Code,
      );
      return impl.codeFileBinding;
    },
    _.isEqual,
  );

  const canonicalPath = binding?.canonical_path ?? "";
  const snapshotDir = binding?.snapshot_dir ?? "";
  const accessMode = binding?.access_mode ?? null;

  const [draftAccessMode, setDraftAccessMode] = useState<CodeFileAccessMode>(
    accessMode ?? CodeFileAccessModeEnum.read_write,
  );

  useEffect(() => {
    if (accessMode) {
      setDraftAccessMode(accessMode);
    }
  }, [accessMode]);

  const selectedAccessMode = accessMode ?? draftAccessMode;

  const {
    inputValue,
    onChange,
    onBlur,
    onKeyDown,
  } = useEditableOnSubmit(
    canonicalPath,
    (newCanonicalPath) => {
      const trimmedPath = newCanonicalPath.trim();
      if (!trimmedPath) {
        return;
      }
      dispatchSetCodeFileBinding({
        sectionId,
        canonicalPath: trimmedPath,
        accessMode: selectedAccessMode,
      });
    },
    (value) => value.trim().length > 0,
  );

  const accessModeLabel = useMemo(() => {
    switch (selectedAccessMode) {
      case CodeFileAccessModeEnum.read_only:
        return "Read Only";
      case CodeFileAccessModeEnum.read_write:
        return "Read & Write";
      case CodeFileAccessModeEnum.write_only:
        return "Write Only";
      default:
        return selectedAccessMode;
    }
  }, [selectedAccessMode]);

  function onChangeAccessMode(event: ChangeEvent<HTMLSelectElement>): void {
    const nextMode = event.target.value as CodeFileAccessMode;
    if (!canonicalPath) {
      setDraftAccessMode(nextMode);
      return;
    }

    if (binding?.access_mode === nextMode) {
      return;
    }

    dispatchSetCodeFileBinding({
      sectionId,
      canonicalPath,
      accessMode: nextMode,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          Code File Binding
        </h3>
        <label className="text-sm font-bold text-setta-400 dark:text-setta-600">
          Canonical Path
        </label>
        <input
          className="mr-[2px] w-full truncate rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-300 dark:ring-setta-700"
          value={inputValue}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="/Users/me/project/main.py"
        />
        <p className="text-xs text-setta-500 dark:text-setta-500">
          Set the absolute path to the file you want to edit from this code
          section.
        </p>
        {snapshotDir && (
          <p className="text-xs text-setta-500 dark:text-setta-500">
            Watching directory <span className="font-mono">{snapshotDir}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-bold text-setta-400 dark:text-setta-600">
          Access Mode
        </label>
        <select
          className="mr-[2px] w-full rounded-full bg-white px-4 py-1 text-sm text-setta-700 ring-2 ring-setta-200 focus:ring-2 focus:ring-blue-500 dark:bg-setta-900 dark:text-setta-300 dark:ring-setta-700"
          value={selectedAccessMode}
          onChange={onChangeAccessMode}
          disabled={!canonicalPath}
        >
          <option value={CodeFileAccessModeEnum.read_write}>
            Read &amp; Write
          </option>
          <option value={CodeFileAccessModeEnum.read_only}>Read Only</option>
          <option value={CodeFileAccessModeEnum.write_only}>Write Only</option>
        </select>
        <p className="text-xs text-setta-500 dark:text-setta-500">
          {selectedAccessMode === CodeFileAccessModeEnum.write_only
            ? "Write-only bindings push code from Setta but ignore disk edits."
            : `Current mode: ${accessModeLabel}.`}
        </p>
      </div>
    </div>
  );
}

function dispatchSetCodeFileBinding({
  sectionId,
  canonicalPath,
  accessMode,
}: {
  sectionId: string;
  canonicalPath: string;
  accessMode: CodeFileAccessMode;
}) {
  const snapshotDir = getSnapshotDir(canonicalPath);

  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"BaseCodeSection">(state, sectionId, {
        codeFileBinding: {
          canonical_path: canonicalPath,
          snapshot_dir: snapshotDir,
          access_mode: accessMode,
        },
      });
    },
    send: (frontendOpId) =>
      route_set_code_file_binding({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        canonicalPath,
        accessMode,
        frontendOpId,
      }),
  });
}

function getSnapshotDir(canonicalPath: string): string {
  const trimmed = canonicalPath.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) {
    return "";
  }
  if (lastSlash === 0) {
    return "/";
  }
  return normalized.slice(0, lastSlash);
}
