import { EditorState, Transaction } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { wrappedCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useReactFlow } from "forks/xyflow/core/store";
import { computeReadyToBeVisible } from "forks/xyflow/core/store/utils";
import _ from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useMisc, useProjectState, useResizeEvent } from "state/definitions";
import { C } from "utils/c";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_code_area_completion,
  route_gen_code_prefix_completion,
  route_gen_code_suffix_completion,
  route_set_code,
  route_set_gen_code_prefix,
  route_set_gen_code_suffix,
} from "utils/generatedEndpoints";
import { SectionTypeEnum } from "utils/generatedTypes";

type GenPythonDocParts = {
  isValid: boolean;
  generatedStart: number;
  generatedEnd: number;
  prefix: string;
  suffix: string;
  suffixBoundaryLength: number;
};

const GEN_CODE_SEPARATOR = "\n".repeat(C.GEN_CODE_SEPARATOR_NEWLINES);
const GEN_CODE_SEPARATOR_LENGTH = GEN_CODE_SEPARATOR.length;
const GEN_CODE_READONLY_THEME = EditorView.baseTheme({
  ".cm-gen-code-readonly-line": {
    backgroundColor: "rgba(253, 230, 138, 0.35)",
  },
  ".cm-gen-code-readonly-line.cm-activeLine": {
    backgroundColor: "rgba(253, 230, 138, 0.35)",
  },
  ".cm-gen-code-placeholder": {
    color: "rgba(100, 116, 139, 0.9)",
    fontStyle: "italic",
    pointerEvents: "none",
  },
  "&.cm-editor.cm-dark .cm-gen-code-readonly-line": {
    backgroundColor: "rgba(161, 98, 7, 0.25)",
  },
  "&.cm-editor.cm-dark .cm-gen-code-readonly-line.cm-activeLine": {
    backgroundColor: "rgba(161, 98, 7, 0.25)",
  },
  "&.cm-editor.cm-dark .cm-gen-code-placeholder": {
    color: "rgba(148, 163, 184, 0.9)",
  },
});

class GenPythonPlaceholderWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-gen-code-placeholder";
    span.textContent = this.text;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

const INVALID_GEN_PYTHON_DOC_PARTS: GenPythonDocParts = {
  isValid: false,
  generatedStart: 0,
  generatedEnd: 0,
  prefix: "",
  suffix: "",
  suffixBoundaryLength: 0,
};

function splitGenPythonDoc(doc: string, generated: string): GenPythonDocParts {
  if (!generated) {
    return INVALID_GEN_PYTHON_DOC_PARTS;
  }
  const wrappedGenerated = `${GEN_CODE_SEPARATOR}${generated}${GEN_CODE_SEPARATOR}`;
  const wrappedStart = doc.indexOf(wrappedGenerated);
  if (wrappedStart < 0) {
    return INVALID_GEN_PYTHON_DOC_PARTS;
  }
  const generatedStart = wrappedStart + GEN_CODE_SEPARATOR_LENGTH;
  const generatedEnd = generatedStart + generated.length;
  const prefixDoc = doc.slice(0, generatedStart);
  const suffixDoc = doc.slice(generatedEnd);
  const prefix =
    GEN_CODE_SEPARATOR_LENGTH > 0 && prefixDoc.endsWith(GEN_CODE_SEPARATOR)
      ? prefixDoc.slice(0, -GEN_CODE_SEPARATOR_LENGTH)
      : prefixDoc;
  const suffixBoundaryLength =
    GEN_CODE_SEPARATOR_LENGTH > 0 && suffixDoc.startsWith(GEN_CODE_SEPARATOR)
      ? GEN_CODE_SEPARATOR_LENGTH
      : 0;
  const suffix =
    suffixBoundaryLength > 0
      ? suffixDoc.slice(suffixBoundaryLength)
      : suffixDoc;
  return {
    isValid: true,
    generatedStart,
    generatedEnd,
    prefix,
    suffix,
    suffixBoundaryLength,
  };
}

function getLineStartsInRange(doc: string, from: number, to: number): number[] {
  const clampedFrom = Math.max(0, Math.min(doc.length, from));
  const clampedTo = Math.max(clampedFrom, Math.min(doc.length, to));
  const lineStarts: number[] = [];
  let lineStart = 0;
  while (lineStart <= doc.length) {
    let lineEnd = doc.indexOf("\n", lineStart);
    if (lineEnd === -1) {
      lineEnd = doc.length;
    }
    if (lineStart < clampedTo && lineEnd > clampedFrom) {
      lineStarts.push(lineStart);
    }
    if (lineEnd === doc.length) {
      break;
    }
    lineStart = lineEnd + 1;
  }
  return lineStarts;
}

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

function _GenPythonCodeArea({ sectionId }: { sectionId: string }) {
  const { code, prefix, suffix } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.GenPythonCode,
    );
    return {
      code: impl.code,
      prefix: x.projectConfig.genCodePrefix,
      suffix: x.projectConfig.genCodeSuffix,
    };
  });

  const combinedDoc = `${prefix}${GEN_CODE_SEPARATOR}${code}${GEN_CODE_SEPARATOR}${suffix}`;
  const [value, setValue] = useState<string>(combinedDoc);
  const [generatedCodeForValue, setGeneratedCodeForValue] =
    useState<string>(code);

  useEffect(() => {
    setValue(combinedDoc);
    setGeneratedCodeForValue(code);
  }, [combinedDoc, code]);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();

  const completionsFn = useCallback(
    getGenPythonCodeAreaCompletionsFn(generatedCodeForValue),
    [generatedCodeForValue],
  );

  function onChange(nextValue: string) {
    setValue(nextValue);
    const nextParts = splitGenPythonDoc(nextValue, generatedCodeForValue);
    if (!nextParts.isValid) {
      return;
    }
    if (nextParts.prefix !== prefix) {
      debouncedSetGenCodePrefix(nextParts.prefix);
    }
    if (nextParts.suffix !== suffix) {
      debouncedSetGenCodeSuffix(nextParts.suffix);
    }
  }

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);

  const readOnlyGeneratedRange = EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) {
      return tr;
    }
    if (!tr.annotation(Transaction.userEvent)) {
      return tr;
    }
    const currentDoc = tr.startState.doc.toString();
    const currentParts = splitGenPythonDoc(currentDoc, generatedCodeForValue);
    if (!currentParts.isValid) {
      return [];
    }
    const currentReadOnlyStart = Math.max(
      0,
      currentParts.generatedStart - GEN_CODE_SEPARATOR_LENGTH,
    );
    const currentReadOnlyEnd = Math.min(
      currentDoc.length,
      currentParts.generatedEnd + GEN_CODE_SEPARATOR_LENGTH,
    );
    let touchesReadOnly = false;
    tr.changes.iterChanges((from, to) => {
      if (from < currentReadOnlyEnd && to > currentReadOnlyStart) {
        touchesReadOnly = true;
      }
    });
    return touchesReadOnly ? [] : tr;
  });

  const readOnlyDecorations = useMemo(() => {
    const buildDecorations = (doc: string): DecorationSet => {
      const docParts = splitGenPythonDoc(doc, generatedCodeForValue);
      if (!docParts.isValid) {
        return Decoration.none;
      }
      const readOnlyStart = Math.max(
        0,
        docParts.generatedStart - GEN_CODE_SEPARATOR_LENGTH,
      );
      const readOnlyEnd = Math.min(
        doc.length,
        docParts.generatedEnd + GEN_CODE_SEPARATOR_LENGTH,
      );
      const decorations = getLineStartsInRange(
        doc,
        readOnlyStart,
        readOnlyEnd,
      ).map((pos) =>
        Decoration.line({ class: "cm-gen-code-readonly-line" }).range(pos),
      );
      if (docParts.prefix.length === 0) {
        decorations.push(
          Decoration.widget({
            widget: new GenPythonPlaceholderWidget("Add imports here"),
            side: 1,
          }).range(0),
        );
      }
      return Decoration.set(decorations, true);
    };

    return ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = buildDecorations(view.state.doc.toString());
        }

        update(update) {
          if (update.docChanged) {
            this.decorations = buildDecorations(update.state.doc.toString());
          }
        }
      },
      {
        decorations: (view) => view.decorations,
      },
    );
  }, [generatedCodeForValue]);

  const extensions = getExtensions({
    parentDivId: `${sectionId}-CustomResizable`,
    language: "python",
    completionsFn,
    onEscape: onEscapeFocusOnArticleDiv,
    tabToAutocomplete: true,
    indentWithTab: true,
  }).concat(
    readOnlyGeneratedRange,
    readOnlyDecorations,
    GEN_CODE_READONLY_THEME,
  );

  return (
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
  );
}

export const GenPythonCodeArea = React.memo(_GenPythonCodeArea);

function CoreCodeArea({ sectionId, language, completionsFn }) {
  const { value, variantIsFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Code,
    );
    return {
      value: impl.code,
      variantIsFrozen: false,
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

const debouncedSetGenCodePrefix = _.debounce((value: string) => {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      state.projectConfig.genCodePrefix = value;
    },
    send: (frontendOpId) =>
      route_set_gen_code_prefix({
        projectConfigId: getCurrProjectConfigId(),
        genCodePrefix: value,
        frontendOpId,
      }),
  });
}, 50);

const debouncedSetGenCodeSuffix = _.debounce((value: string) => {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      state.projectConfig.genCodeSuffix = value;
    },
    send: (frontendOpId) =>
      route_set_gen_code_suffix({
        projectConfigId: getCurrProjectConfigId(),
        genCodeSuffix: value,
        frontendOpId,
      }),
  });
}, 50);

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

function getGenPythonCodeAreaCompletionsFn(generatedCode: string) {
  const fn = async (fullText: string, position: number) => {
    const docParts = splitGenPythonDoc(fullText, generatedCode);
    if (!docParts.isValid) {
      return [];
    }
    const projectConfigId = getCurrProjectConfigId();
    if (position < docParts.generatedStart) {
      const prefixPosition = Math.min(position, docParts.prefix.length);
      const res = await route_gen_code_prefix_completion({
        projectConfigId,
        fullText: docParts.prefix,
        position: prefixPosition,
      });
      if (res200(res)) {
        return res.data;
      }
      return [];
    }
    if (position >= docParts.generatedEnd) {
      const suffixPosition = Math.max(
        0,
        position - docParts.generatedEnd - docParts.suffixBoundaryLength,
      );
      const res = await route_gen_code_suffix_completion({
        projectConfigId,
        fullText: docParts.suffix,
        position: suffixPosition,
      });
      if (res200(res)) {
        return res.data;
      }
      return [];
    }
    return [];
  };

  return wrappedCompletionsFn(fn);
}
