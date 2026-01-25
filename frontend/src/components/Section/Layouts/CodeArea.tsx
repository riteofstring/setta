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
import {
  useMisc,
  useProjectState,
  useResizeEvent,
  useShareSession,
  useToolArgumentPreview,
} from "state/definitions";
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

type GenPythonLineStartInfo = {
  pos: number;
  lineIndex: number;
};

const GEN_CODE_SEPARATOR = "\n".repeat(C.GEN_CODE_SEPARATOR_NEWLINES);
const GEN_CODE_SEPARATOR_LENGTH = GEN_CODE_SEPARATOR.length;
const GEN_CODE_RADIUS = "6px";
const GEN_CODE_RADIUS_TOP = `${GEN_CODE_RADIUS} ${GEN_CODE_RADIUS} 0 0`;
const GEN_CODE_RADIUS_BOTTOM = `0 0 ${GEN_CODE_RADIUS} ${GEN_CODE_RADIUS}`;
const GEN_CODE_LINE_OVERLAP = "2px";
const GEN_CODE_LINE_EDGE_OFFSET = `calc(80% - ${GEN_CODE_LINE_OVERLAP})`;
const GEN_CODE_READONLY_THEME = EditorView.baseTheme({
  "&": {
    "--gen-code-bg": "rgb(219 234 254)",
    "--gen-code-rail": "rgb(96 165 250)",
    "--gen-code-label-bg": "rgb(37 99 235)",
    "--gen-code-label-text": "rgb(239 246 255)",
    "--gen-code-selection-bg": "hsl(246, 98%, 23%)",
  },
  "&.cm-dark": {
    "--gen-code-bg": "rgb(23 37 84)",
    "--gen-code-rail": "rgb(37 99 235)",
    "--gen-code-label-bg": "rgb(30 64 175)",
    "--gen-code-label-text": "rgb(239 246 255)",
    "--gen-code-selection-bg": "hsl(246, 98%, 23%)",
  },
  ".dark &": {
    "--gen-code-bg": "rgb(23 37 84)",
    "--gen-code-rail": "rgb(37 99 235)",
    "--gen-code-label-bg": "rgb(30 64 175)",
    "--gen-code-label-text": "rgb(239 246 255)",
    "--gen-code-selection-bg": "hsl(246, 98%, 23%)",
  },
  ".cm-gen-code-readonly-line": {
    cursor: "not-allowed",
    position: "relative",
    zIndex: "0",
  },
  "&.cm-focused .cm-selectionBackground, & .cm-line::selection, & .cm-line ::selection, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection":
    {
      background: "var(--gen-code-selection-bg) !important",
      color: "white !important",
    },
  ".cm-gen-code-readonly-line::before": {
    content: '""',
    position: "absolute",
    top: `-${GEN_CODE_LINE_OVERLAP}`,
    right: "4px",
    bottom: `-${GEN_CODE_LINE_OVERLAP}`,
    left: 0,
    background:
      "linear-gradient(90deg, var(--gen-code-rail) 0 3px, var(--gen-code-bg) 3px)",
    zIndex: "-1",
  },
  ".cm-gen-code-readonly-line-start": {
    borderRadius: GEN_CODE_RADIUS_TOP,
    zIndex: "2",
  },
  ".cm-gen-code-readonly-line-start.cm-activeLine": {
    borderRadius: "0",
  },
  ".cm-gen-code-readonly-line-end": {
    borderRadius: GEN_CODE_RADIUS_BOTTOM,
    zIndex: "2",
  },
  ".cm-gen-code-readonly-line-end.cm-activeLine": {
    borderRadius: "0",
  },
  ".cm-gen-code-readonly-line-start::before": {
    top: GEN_CODE_LINE_EDGE_OFFSET,
    borderRadius: GEN_CODE_RADIUS_TOP,
  },
  ".cm-gen-code-readonly-line-end::before": {
    bottom: GEN_CODE_LINE_EDGE_OFFSET,
    borderRadius: GEN_CODE_RADIUS_BOTTOM,
  },
  ".cm-gen-code-readonly-line-after-start::before": {
    top: 0,
  },
  ".cm-gen-code-readonly-line-before-end::before": {
    bottom: 0,
  },
  ".cm-gen-code-readonly-line-start::after": {
    content: '"Generated read-only"',
    position: "absolute",
    top: "calc(50% - 0px)",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "1px 5px",
    borderRadius: "999px",
    backgroundColor: "var(--gen-code-label-bg)",
    color: "var(--gen-code-label-text)",
    fontSize: "8px",
    // letterSpacing: "0.1em",
    lineHeight: "1.3",
    textTransform: "uppercase",
    pointerEvents: "none",
    zIndex: "2",
  },
  ".cm-gen-code-placeholder": {
    color: "rgba(100, 116, 139, 0.9)",
    fontStyle: "italic",
    pointerEvents: "none",
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

function getLineStartsInRange(
  doc: string,
  from: number,
  to: number,
): GenPythonLineStartInfo[] {
  const clampedFrom = Math.max(0, Math.min(doc.length, from));
  const clampedTo = Math.max(clampedFrom, Math.min(doc.length, to));
  const lineStarts: GenPythonLineStartInfo[] = [];
  let lineStart = 0;
  let lineIndex = 0;
  while (lineStart <= doc.length) {
    let lineEnd = doc.indexOf("\n", lineStart);
    if (lineEnd === -1) {
      lineEnd = doc.length;
    }
    if (lineStart < clampedTo && lineEnd > clampedFrom) {
      lineStarts.push({ pos: lineStart, lineIndex });
    }
    if (lineEnd === doc.length) {
      break;
    }
    lineStart = lineEnd + 1;
    lineIndex += 1;
  }
  return lineStarts;
}

function getGenReadOnlyLineDecorations(doc: string, from: number, to: number) {
  const lineStarts = getLineStartsInRange(doc, from, to);
  if (lineStarts.length === 0) {
    return [];
  }
  const firstLineIndex = lineStarts[0].lineIndex;
  const lastLineIndex = lineStarts[lineStarts.length - 1].lineIndex;
  const afterStartIndex = firstLineIndex + 1;
  const beforeEndIndex = lastLineIndex - 1;
  return lineStarts.map(({ pos, lineIndex }) => {
    const classes = ["cm-gen-code-readonly-line"];
    if (lineIndex === firstLineIndex) {
      classes.push("cm-gen-code-readonly-line-start");
    } else if (lineIndex === afterStartIndex) {
      classes.push("cm-gen-code-readonly-line-after-start");
    }
    if (lineIndex === lastLineIndex) {
      classes.push("cm-gen-code-readonly-line-end");
    } else if (lineIndex === beforeEndIndex && lineIndex !== firstLineIndex) {
      classes.push("cm-gen-code-readonly-line-before-end");
    }
    return Decoration.line({ class: classes.join(" ") }).range(pos);
  });
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
  const isShareMode = useShareSession((x) => x.isShareMode);
  const canUseLsp = !isShareMode;
  const completionsFn = useCallback(
    getPythonCodeAreaCompletionsFn(sectionId, canUseLsp),
    [sectionId, canUseLsp],
  );

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

  const isShareMode = useShareSession((x) => x.isShareMode);
  const canUseLsp = !isShareMode;
  const isShareReadOnly = isShareMode;
  const completionsFn = useCallback(
    getGenPythonCodeAreaCompletionsFn(generatedCodeForValue, canUseLsp),
    [generatedCodeForValue, canUseLsp],
  );

  function onChange(nextValue: string) {
    if (isShareReadOnly) {
      return;
    }
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
      const decorations = [
        ...getGenReadOnlyLineDecorations(doc, readOnlyStart, readOnlyEnd),
      ];
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
    isDisabled: isShareReadOnly,
  }).concat(
    readOnlyGeneratedRange,
    readOnlyDecorations,
    GEN_CODE_READONLY_THEME,
  );

  return (
    <article
      ref={wrapperRef}
      className={`${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag section-full-no-title cursor-auto rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_*]:!outline-0 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent [&_.cm-gutters]:focus:!bg-transparent ${overflow} ${nowheel}`}
      data-section-main-editor
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
        basicSetup={{ tabSize: 4, drawSelection: false }}
      />
    </article>
  );
}

export const GenPythonCodeArea = React.memo(_GenPythonCodeArea);

function CoreCodeArea({ sectionId, language, completionsFn }) {
  const { value: baseValue, variantIsFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Code,
    );
    return {
      value: impl.code,
      variantIsFrozen: impl.isFrozen,
    };
  }, _.isEqual);
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const previewCode = useToolArgumentPreview((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return null;
    }
    const entry = previewState.previewCodeBySectionId[sectionId];
    return entry ? entry.value : null;
  });
  const value = previewCode ?? baseValue;

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const isShareReadOnly = isShareMode;
  const isDisabled = variantIsFrozen || isShareReadOnly;

  function onChange(v) {
    if (isDisabled) {
      return;
    }
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
    isDisabled,
  });

  // TODO: replace the arbitrary inline tailwind styles with something more elegant

  return (
    <article
      ref={wrapperRef}
      className={`${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag section-full-no-title cursor-auto rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_*]:!outline-0 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent [&_.cm-gutters]:focus:!bg-transparent ${overflow} ${nowheel}`}
      data-section-main-editor
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

function getPythonCodeAreaCompletionsFn(sectionId: string, canUseLsp: boolean) {
  const fn = async (fullText: string, position: number) => {
    if (!canUseLsp) {
      return [];
    }
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

function getGenPythonCodeAreaCompletionsFn(
  generatedCode: string,
  canUseLsp: boolean,
) {
  const fn = async (fullText: string, position: number) => {
    if (!canUseLsp) {
      return [];
    }
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
