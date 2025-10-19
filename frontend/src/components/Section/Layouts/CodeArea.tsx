import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { wrappedCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useReactFlow } from "forks/xyflow/core/store";
import { computeReadyToBeVisible } from "forks/xyflow/core/store/utils";
import _ from "lodash";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  dispatchSetCodeFileBinding,
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useMisc, useProjectState, useResizeEvent } from "state/definitions";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_code_area_completion,
  route_check_if_file_exists,
  route_set_code,
} from "utils/generatedEndpoints";
import {
  CodeFileAccessMode,
  CodeFileAccessModeEnum,
  CodeFileBinding,
  SectionTypeEnum,
} from "utils/generatedTypes";

function _CodeArea({ sectionId }) {
  const language = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Code,
    );
    return impl.codeLanguage;
  });

  switch (language) {
    case "python":
      return <PythonCodeArea sectionId={sectionId} language={language} />;
    case "bash":
      return <BashCodeArea sectionId={sectionId} language={language} />;
  }
}

export const CodeArea = React.memo(_CodeArea);

function PythonCodeArea({ sectionId, language }) {
  const completionsFn = useCallback(getPythonCodeAreaCompletionsFn(sectionId), [
    sectionId,
  ]);

  return (
    <CoreCodeArea
      sectionId={sectionId}
      language={language}
      completionsFn={completionsFn}
    />
  );
}

function BashCodeArea({ sectionId, language }) {
  return <CoreCodeArea sectionId={sectionId} language={language} />;
}

function _GenPythonCodeArea({ sectionId }) {
  const code = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.GenPythonCode,
    );
    return impl.code;
  });

  return (
    <ReadOnlyCoreCodeArea sectionId={sectionId} language="python" code={code} />
  );
}

export const GenPythonCodeArea = React.memo(_GenPythonCodeArea);

type FileCheckState = "idle" | "checking" | "found" | "missing";

function CodeFileBindingControls({
  sectionId,
  binding,
}: {
  sectionId: string;
  binding: CodeFileBinding | null;
}) {
  const canonicalPath = binding?.canonical_path ?? "";
  const initialAccessMode =
    binding?.access_mode ?? CodeFileAccessModeEnum.read_write;
  const [pathDraft, setPathDraft] = useState(canonicalPath);
  const [accessModeDraft, setAccessModeDraft] =
    useState<CodeFileAccessMode>(initialAccessMode);
  const [pathDirty, setPathDirty] = useState(false);
  const [accessModeDirty, setAccessModeDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fileCheckState, setFileCheckState] =
    useState<FileCheckState>("idle");

  useEffect(() => {
    if (!pathDirty) {
      setPathDraft(canonicalPath);
    }
  }, [canonicalPath, pathDirty]);

  useEffect(() => {
    if (!accessModeDirty) {
      setAccessModeDraft(initialAccessMode);
    }
  }, [initialAccessMode, accessModeDirty]);

  useEffect(() => {
    if (!showSuccess) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const timeoutId = window.setTimeout(() => setShowSuccess(false), 2000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showSuccess]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = pathDraft.trim();

    if (!trimmed) {
      setFileCheckState("idle");
      return () => {
        cancelled = true;
      };
    }

    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    setFileCheckState("checking");
    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await route_check_if_file_exists({ filepath: trimmed });
        if (cancelled) {
          return;
        }
        if (res200(res)) {
          setFileCheckState(res.data ? "found" : "missing");
        } else if (!res.hasResponse) {
          setFileCheckState("missing");
        } else {
          setFileCheckState("missing");
        }
      } catch {
        if (!cancelled) {
          setFileCheckState("missing");
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [pathDraft]);

  const accessModeOptions = useMemo<
    Array<{ value: CodeFileAccessMode; label: string }>
  >(
    () => [
      {
        value: CodeFileAccessModeEnum.read_write,
        label: "Read & write",
      },
      {
        value: CodeFileAccessModeEnum.read_only,
        label: "Read only",
      },
    ],
    [],
  );

  const statusDetails = useMemo(() => {
    switch (fileCheckState) {
      case "checking":
        return {
          text: "Checking file...",
          className: "text-setta-500 dark:text-setta-400",
        };
      case "found":
        return {
          text: "File found.",
          className: "text-green-600 dark:text-green-400",
        };
      case "missing":
        return {
          text: "File not found.",
          className: "text-red-500 dark:text-red-400",
        };
      default:
        return {
          text: "Enter a canonical path to enable sync.",
          className: "text-setta-500 dark:text-setta-400",
        };
    }
  }, [fileCheckState]);

  const trimmedDraft = pathDraft.trim();
  const hasChanges =
    trimmedDraft !== canonicalPath || accessModeDraft !== initialAccessMode;
  const saveDisabled = pending || trimmedDraft.length === 0 || !hasChanges;
  const resetDisabled = pending || !hasChanges;

  const handlePathChange = useCallback(
    (value: string) => {
      setErrorMessage(null);
      setShowSuccess(false);
      setPathDraft(value);
      setPathDirty(value !== canonicalPath);
    },
    [canonicalPath],
  );

  const handleAccessModeChange = useCallback(
    (value: CodeFileAccessMode) => {
      setAccessModeDraft(value);
      setAccessModeDirty(value !== initialAccessMode);
      setShowSuccess(false);
    },
    [initialAccessMode],
  );

  const handleReset = useCallback(() => {
    setPathDraft(canonicalPath);
    setAccessModeDraft(initialAccessMode);
    setPathDirty(false);
    setAccessModeDirty(false);
    setErrorMessage(null);
    setShowSuccess(false);
  }, [canonicalPath, initialAccessMode]);

  const handleSave = useCallback(async () => {
    const canonicalValue = trimmedDraft;
    if (!canonicalValue) {
      setErrorMessage("Path is required.");
      return;
    }
    setPending(true);
    setErrorMessage(null);
    setShowSuccess(false);
    setPathDraft(canonicalValue);
    setPathDirty(false);
    setAccessModeDirty(false);

    try {
      const res = await dispatchSetCodeFileBinding({
        sectionId,
        canonicalPath: canonicalValue,
        accessMode: accessModeDraft,
      });
      if (res200(res)) {
        setShowSuccess(true);
      } else if (!res.hasResponse) {
        setErrorMessage("Update failed: unable to reach server.");
      } else {
        setErrorMessage(`Update failed (status ${res.status}).`);
      }
    } catch {
      setErrorMessage("Unable to update file binding.");
    } finally {
      setPending(false);
    }
  }, [accessModeDraft, sectionId, trimmedDraft]);

  return (
    <div className="w-full rounded-md border border-setta-200 bg-setta-50 px-3 py-2 text-xs shadow-sm dark:border-setta-800 dark:bg-setta-925">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          File Sync
        </span>
        {showSuccess && (
          <span className="text-[0.65rem] font-semibold text-green-600 dark:text-green-400">
            Synced
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <label className="text-[0.65rem] font-medium text-setta-600 dark:text-setta-300">
          Canonical path
        </label>
        <input
          type="text"
          className="w-full rounded-md border border-setta-300 bg-white px-2 py-1 font-mono text-xs text-setta-700 shadow-inner focus-visible:border-blue-500 focus-visible:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
          placeholder="app/src/my_script.py"
          value={pathDraft}
          onChange={(event) => handlePathChange(event.target.value)}
          disabled={pending}
          spellCheck={false}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex flex-col gap-1 text-[0.65rem] font-medium text-setta-600 dark:text-setta-300">
          Access mode
          <select
            className="rounded-md border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 focus-visible:border-blue-500 focus-visible:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
            value={accessModeDraft}
            onChange={(event) =>
              handleAccessModeChange(
                event.target.value as CodeFileAccessMode,
              )
            }
            disabled={pending}
          >
            {accessModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-setta-300 px-3 py-1 text-xs font-medium text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-850"
            disabled={resetDisabled}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={saveDisabled}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.65rem]">
        <span className={statusDetails.className}>{statusDetails.text}</span>
        {binding?.snapshot_dir && (
          <span className="truncate text-setta-500 dark:text-setta-400">
            Snapshot:{" "}
            <code className="font-mono">{binding.snapshot_dir}</code>
          </span>
        )}
      </div>
      {errorMessage && (
        <p className="mt-2 text-[0.65rem] text-red-500 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function ReadOnlyCoreCodeArea({ sectionId, code, language }) {
  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);

  const extensions = getExtensions({
    language,
    onEscape: onEscapeFocusOnArticleDiv,
    isDisabled: true,
  });

  return (
    <article
      ref={wrapperRef}
      className={`${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag section-full-no-title cursor-auto rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_*]:!outline-0 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent [&_.cm-gutters]:focus:!bg-transparent ${overflow} ${nowheel}`}
      tabIndex={0}
      onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
    >
      <CodeMirror
        extensions={extensions}
        value={code}
        maxHeight={maxHeight}
        theme={theme}
        onCreateEditor={handleCreateEditor}
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );
}

function CoreCodeArea({ sectionId, language, completionsFn }) {
  const { value, binding, variantIsFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Code,
    );
    return {
      value: impl.code,
      binding: impl.codeFileBinding,
      variantIsFrozen: impl.isFrozen ?? false,
    };
  }, _.isEqual);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();

  function onChange(v) {
    debouncedSetCode(sectionId, v);
  }

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);

  const extensions = getExtensions({
    parentDivId: `${sectionId}-CustomResizable`,
    language,
    completionsFn,
    onEscape: onEscapeFocusOnArticleDiv,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled: variantIsFrozen,
  });

  // TODO: replace the arbitrary inline tailwind styles with something more elegant

  return (
    <div className="flex w-full flex-col gap-2">
      <CodeFileBindingControls sectionId={sectionId} binding={binding} />
      <article
        ref={wrapperRef}
        className={`${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag section-full-no-title cursor-auto rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_*]:!outline-0 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent [&_.cm-gutters]:focus:!bg-transparent ${overflow} ${nowheel}`}
        tabIndex={0}
        onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
      >
        <CodeMirror
          maxHeight={maxHeight}
          value={value}
          theme={theme}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={handleCreateEditor}
          indentWithTab={false} // I take care of this in getExtensions
          basicSetup={{ tabSize: 4 }}
        />
      </article>
    </div>
  );
}

export function useCodeAreaHeight({ sectionId }) {
  const height = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.size.height;
  });
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);

  const wrapperRef = useRef(null);
  const editorRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const [nowheel, setNoWheel] = useState("");
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);
  const [didFirstRender, setDidFirstRender] = useState(false);

  const handleCreateEditor = useCallback((view) => {
    editorRef.current = view;
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!didFirstRender) {
        useMisc.setState((state) => {
          const newNumInitialized = state.numInitializedCodeAreas + 1;
          return {
            numInitializedCodeAreas: newNumInitialized,
            requestUpdateNodeDimensions:
              newNumInitialized === state.numDisplayedCodeAreas,
          };
        });
        useProjectState.setState((state) => {
          const s = state.sections[sectionId];
          if (s.tempSavedSize) {
            s.size = s.tempSavedSize;
            delete s.tempSavedSize;
          }
        });
        setDidFirstRender(true);
      }
      setNoWheel(
        entry.target.scrollHeight > entry.target.clientHeight ? "nowheel" : "",
      );
    });
    resizeObserver.observe(editorRef.current.scrollDOM);
    resizeObserverRef.current = resizeObserver;
  }, []);

  useEffect(() => {
    useMisc.setState((state) => ({
      numDisplayedCodeAreas: state.numDisplayedCodeAreas + 1,
    }));

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }

      // the math.max is to prevent it from going negative if that ever happens
      useMisc.setState((state) => {
        const output = {
          numDisplayedCodeAreas: Math.max(0, state.numDisplayedCodeAreas - 1),
        };
        if (didFirstRender) {
          output.numInitializedCodeAreas = Math.max(
            0,
            state.numInitializedCodeAreas - 1,
          );
        }
        return output;
      });
    };
  }, []);

  useEffect(() => {
    if (readyToBeVisible && editorRef.current) {
      // Need to basically get code mirror to refresh its display
      // after on fitview is done. Otherwise some of the lines
      // might not appear until you move around a bit.
      editorRef.current.requestMeasure();
    }
  }, [readyToBeVisible]);

  const maxHeight =
    height === "auto" || resizeEvent === "start"
      ? undefined
      : `${height - 30}px`;
  const overflow = resizeEvent === "start" ? "overflow-y-auto" : "";

  const editorScrollTop = editorRef.current?.scrollDOM.scrollTop;
  const wrapperScrollTop = wrapperRef.current?.scrollTop;

  useEffect(() => {
    if (wrapperRef.current && resizeEvent === "start") {
      wrapperRef.current.scrollTop = editorScrollTop;
    } else if (editorRef.current && resizeEvent === "end") {
      editorRef.current.scrollDOM.scrollTop = wrapperScrollTop;
    }
  }, [resizeEvent]);

  return {
    wrapperRef,
    handleCreateEditor,
    maxHeight,
    overflow,
    nowheel,
  };
}

export function codeAreaTabOnEnterKeyHandlers(wrapperRef) {
  function onArticleDivEnterKeyFocusOnCodeMirror(e) {
    if (e.code === "Enter") {
      const el = e.target.querySelector("[contenteditable]");
      if (el) {
        el.focus({ preventScroll: true });
      }
    }
  }

  function onEscapeFocusOnArticleDiv(completionResult) {
    if (!completionResult) {
      // Need the requestAnimationFrame to prevent scroll
      // in certain cases. Specifically, if you zoom in so that the code area
      // doesn't fit on screen, and then select some code and then press escape,
      // it'll scroll if you don't have the requestAnimationFrame
      requestAnimationFrame(() => {
        wrapperRef.current.focus({ preventScroll: true });
      });
    }
  }

  return { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv };
}

const debouncedSetCode = _.debounce((sectionId: string, code: string) => {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCurrEffectiveSectionImplValue<"CodeSection">(state, sectionId, {
        code,
      });
    },
    send: (frontendOpId) =>
      route_set_code({
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        code,
        frontendOpId,
      }),
  });
}, 200);

function getPythonCodeAreaCompletionsFn(sectionId) {
  const fn = async (fullText: string, position: number) => {
    const projectConfigId = getCurrProjectConfigId();
    const res = await route_code_area_completion({
      projectConfigId,
      sectionId,
      fullText,
      position,
    });

    if (res200(res)) {
      return res.data;
    }
    return [];
  };

  return wrappedCompletionsFn(fn);
}
