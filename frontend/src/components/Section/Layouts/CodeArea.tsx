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
import { buildLspDiagnosticsExtensions } from "components/Utils/CodeMirror/lspDiagnostics";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCodeMirrorTooltipParent } from "components/Utils/CodeMirror/useCodeMirrorTooltipParent";
import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { DNDSortable } from "forks/dnd-kit/DNDSortable";
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
  queueCodeUpdate,
  queueGenCodePrefixUpdate,
  queueGenCodeSuffixUpdate,
} from "state/actions/codeUpdates";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  useLspDiagnostics,
  useLocalStorage,
  useMisc,
  useProjectState,
  useResizeEvent,
  useSettings,
  useShareSession,
  useToolArgumentPreview,
} from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import {
  getMinSectionHeight,
  useSectionMinMaxDims,
} from "state/hooks/sectionSizes";
import { C } from "utils/c";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { CodeLanguage } from "utils/codeLanguage";
import {
  CODEMIRROR_TOOLTIP_PARENT_ID,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_code_area_completion,
  route_gen_code_prefix_completion,
  route_gen_code_suffix_completion,
} from "utils/generatedEndpoints";
import { CodeLanguageEnum, SectionTypeEnum } from "utils/generatedTypes";
import { SortableSectionContainer } from "../Container/SortableSectionContainer";

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

const EMBEDDED_TERMINAL_SPLIT_DEFAULT_RATIO = 0.65;
const EMBEDDED_TERMINAL_SPLIT_HANDLE_HEIGHT = 8;
const EMBEDDED_TERMINAL_MIN_FRACTION = 0.2;

type EmbeddedTerminalSplitBounds = {
  minRatio: number;
  maxRatio: number;
};

type EmbeddedTerminalSplitState = {
  containerRef: React.RefObject<HTMLDivElement>;
  gridTemplateRows: string;
  handleHeight: number;
  onHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHandleMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
};

const GEN_CODE_SEPARATOR = "\n".repeat(C.GEN_CODE_SEPARATOR_NEWLINES);
const GEN_CODE_SEPARATOR_LENGTH = GEN_CODE_SEPARATOR.length;
const GEN_CODE_RADIUS = "6px";
const GEN_CODE_RADIUS_TOP = `${GEN_CODE_RADIUS} ${GEN_CODE_RADIUS} 0 0`;
const GEN_CODE_RADIUS_BOTTOM = `0 0 ${GEN_CODE_RADIUS} ${GEN_CODE_RADIUS}`;
const GEN_CODE_LINE_OVERLAP = "2px";
const GEN_CODE_LINE_EDGE_OFFSET = `calc(80% - ${GEN_CODE_LINE_OVERLAP})`;
const EMBEDDED_CODE_EDITOR_THEME = EditorView.baseTheme({
  "&": {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    height: "100%",
    maxHeight: "100%",
    minHeight: "0",
  },
  ".cm-scroller": {
    flex: "1 1 auto",
    height: "100%",
    maxHeight: "100%",
    minHeight: "0",
    overflow: "auto",
  },
});
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

function _CodeArea({ sectionId }: { sectionId: string }) {
  const language = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Code,
    );
    return impl.codeLanguage;
  });
  if (language === CodeLanguageEnum.python) {
    return <PythonCodeArea sectionId={sectionId} language={language} />;
  }
  return <BasicCodeArea sectionId={sectionId} language={language} />;
}

export const CodeArea = React.memo(_CodeArea);

function PythonCodeArea({
  sectionId,
  language,
}: {
  sectionId: string;
  language: CodeLanguage;
}) {
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

function BasicCodeArea({
  sectionId,
  language,
}: {
  sectionId: string;
  language: CodeLanguage;
}) {
  return <CoreCodeArea sectionId={sectionId} language={language} />;
}

function _GenPythonCodeArea({ sectionId }: { sectionId: string }) {
  const hasPythonCodegen = useProjectState((x) =>
    projectConfigHasPythonCodegen(x.projectConfig),
  );
  if (!hasPythonCodegen) {
    return <GenPythonCodeAreaDisabled />;
  }
  return <GenPythonCodeAreaContent sectionId={sectionId} />;
}

function GenPythonCodeAreaDisabled() {
  return null;
}

function GenPythonCodeAreaContent({ sectionId }: { sectionId: string }) {
  const { code, prefix, suffix } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.GenPythonCode,
    );
    const pythonTarget = getPythonCodegenTarget(x.projectConfig);
    return {
      code: impl.code,
      prefix: pythonTarget?.genCodePrefix ?? "",
      suffix: pythonTarget?.genCodeSuffix ?? "",
    };
  });

  const combinedDoc = `${prefix}${GEN_CODE_SEPARATOR}${code}${GEN_CODE_SEPARATOR}${suffix}`;
  const [value, setValue] = useState<string>(combinedDoc);
  const [generatedCodeForValue, setGeneratedCodeForValue] =
    useState<string>(code);
  const skipNextChangeRef = useRef<string | null>(null);

  useEffect(() => {
    skipNextChangeRef.current = combinedDoc;
    setValue(combinedDoc);
    setGeneratedCodeForValue(code);
  }, [combinedDoc, code]);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();

  const isShareMode = useShareSession((x) => x.isShareMode);
  const canUseLsp = !isShareMode;
  const isShareReadOnly = isShareMode;
  const unmappedGenCodeDiagnostics = useLspDiagnostics(
    (x) => x.unmappedGenCode,
  );
  const completionsFn = useCallback(
    getGenPythonCodeAreaCompletionsFn(generatedCodeForValue, canUseLsp),
    [generatedCodeForValue, canUseLsp],
  );

  function onChange(nextValue: string) {
    if (skipNextChangeRef.current === nextValue) {
      skipNextChangeRef.current = null;
      return;
    }
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = null;
    }
    if (isShareReadOnly) {
      return;
    }
    setValue(nextValue);
    const nextParts = splitGenPythonDoc(nextValue, generatedCodeForValue);
    if (!nextParts.isValid) {
      return;
    }
    if (nextParts.prefix !== prefix) {
      queueGenCodePrefixUpdate(nextParts.prefix);
    }
    if (nextParts.suffix !== suffix) {
      queueGenCodeSuffixUpdate(nextParts.suffix);
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

  const tooltipParent = useCodeMirrorTooltipParent(
    CODEMIRROR_TOOLTIP_PARENT_ID,
  );
  const extensions = getExtensions({
    parent: tooltipParent,
    language: "python",
    completionsFn,
    onEscape: onEscapeFocusOnArticleDiv,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled: isShareReadOnly,
  });
  const lspLintExtensions = useMemo(() => {
    if (isShareMode) {
      return [];
    }
    return buildLspDiagnosticsExtensions(unmappedGenCodeDiagnostics);
  }, [isShareMode, unmappedGenCodeDiagnostics]);
  const finalExtensions = extensions.concat(
    readOnlyGeneratedRange,
    readOnlyDecorations,
    GEN_CODE_READONLY_THEME,
    lspLintExtensions,
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
        extensions={finalExtensions}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false} // I take care of this in getExtensions
        basicSetup={{ tabSize: 4, drawSelection: false }}
      />
    </article>
  );
}

export const GenPythonCodeArea = React.memo(_GenPythonCodeArea);

function _GenPythonMetadataArea({ sectionId }: { sectionId: string }) {
  const metadataEnabled = useProjectState(
    (x) => getPythonCodegenTarget(x.projectConfig)?.generateMetadata ?? false,
  );
  if (!metadataEnabled) {
    return <GenPythonMetadataAreaDisabled />;
  }
  return <GenPythonMetadataAreaContent sectionId={sectionId} />;
}

function GenPythonMetadataAreaDisabled() {
  return null;
}

function GenPythonMetadataAreaContent({ sectionId }: { sectionId: string }) {
  const code = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.GenPythonMetadata,
    );
    return impl.code;
  });

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });
  const theme = useCodeMirrorStyle();

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);
  const tooltipParent = useCodeMirrorTooltipParent(
    CODEMIRROR_TOOLTIP_PARENT_ID,
  );

  const extensions = getExtensions({
    parent: tooltipParent,
    language: "python",
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
        maxHeight={maxHeight}
        value={code}
        theme={theme}
        extensions={extensions}
        onChange={() => {}}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false}
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );
}

export const GenPythonMetadataArea = React.memo(_GenPythonMetadataArea);

function CoreCodeArea({ sectionId, language, completionsFn }) {
  const {
    value: baseValue,
    variantIsFrozen,
    bindingPath,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Code,
    );
    return {
      value: impl.code,
      variantIsFrozen: impl.isFrozen,
      bindingPath: impl.codeFileBinding?.canonical_path ?? null,
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

  const attachedTerminalId = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplOfType(
      state,
      sectionId,
      SectionTypeEnum.Code,
    );
    if (!impl.attachedTerminalSectionId) {
      return null;
    }
    const terminalId = impl.attachedTerminalSectionId;
    if (!(terminalId in state.sections)) {
      return null;
    }
    const terminalImpl = getCurrEffectiveSectionImpl(state, terminalId);
    if (terminalImpl.type !== SectionTypeEnum.Terminal) {
      return null;
    }
    return terminalId;
  }, _.isEqual);
  const dndChildIds = useDndChildren((x) => x.x[sectionId] ?? []);
  let embeddedChildIds = dndChildIds;
  if (embeddedChildIds.length === 0 && attachedTerminalId) {
    embeddedChildIds = [attachedTerminalId];
  }
  const hasEmbeddedTerminal = embeddedChildIds.length > 0;
  const dndChildIdsKey = useMemo(() => dndChildIds.join("|"), [dndChildIds]);
  const embeddedChildIdsKey = useMemo(
    () => embeddedChildIds.join("|"),
    [embeddedChildIds],
  );
  const disablePointerEvents = useShouldDisablePointerEvents();

  useEffect(() => {
    const fallbackChildId =
      !attachedTerminalId && dndChildIds.length === 1 ? dndChildIds[0] : null;
    const candidateId = attachedTerminalId ?? fallbackChildId;
    if (!candidateId) {
      return;
    }
    useProjectState.setState((state) => {
      if (!(candidateId in state.sections)) {
        return;
      }
      const candidateImpl = getCurrEffectiveSectionImpl(state, candidateId);
      if (candidateImpl.type !== SectionTypeEnum.Terminal) {
        return;
      }
      const codeImpl = getCurrEffectiveSectionImplOfType(
        state,
        sectionId,
        SectionTypeEnum.Code,
      );
      const hasChild = codeImpl.children.includes(candidateId);
      const currentParent = state.parentSectionMap[candidateId] ?? null;
      const attachedId = codeImpl.attachedTerminalSectionId;
      if (hasChild && currentParent === sectionId && attachedId === candidateId) {
        return;
      }
      if (!hasChild) {
        codeImpl.children = [candidateId];
      }
      if (!attachedId) {
        codeImpl.attachedTerminalSectionId = candidateId;
      }
      state.parentSectionMap[candidateId] = sectionId;
    });
  }, [attachedTerminalId, dndChildIdsKey, sectionId]);

  useEffect(() => {
    console.info(
      JSON.stringify({
        event: "code-area-attached-terminal",
        sectionId,
        attachedTerminalId,
        dndChildIds,
        embeddedChildIds,
        hasEmbeddedTerminal,
      }),
    );
  }, [
    attachedTerminalId,
    dndChildIdsKey,
    embeddedChildIdsKey,
    hasEmbeddedTerminal,
    sectionId,
  ]);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const isShareReadOnly = isShareMode;
  const isDisabled = variantIsFrozen || isShareReadOnly;
  const codeSectionDiagnostics = useLspDiagnostics((x) => {
    const diagnostics = x.codeSections[sectionId];
    return diagnostics ?? [];
  });
  const useJsx = useMemo(() => {
    if (!bindingPath) {
      return false;
    }
    if (
      language !== CodeLanguageEnum.typescript &&
      language !== CodeLanguageEnum.javascript
    ) {
      return false;
    }
    const normalized = bindingPath.toLowerCase();
    return normalized.endsWith(".tsx") || normalized.endsWith(".jsx");
  }, [bindingPath, language]);

  function onChange(v) {
    if (isDisabled) {
      return;
    }
    queueCodeUpdate(sectionId, v);
  }

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);
  const tooltipParent = useCodeMirrorTooltipParent(
    CODEMIRROR_TOOLTIP_PARENT_ID,
  );

  const extensions = getExtensions({
    parent: tooltipParent,
    language,
    completionsFn,
    onEscape: onEscapeFocusOnArticleDiv,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled,
    useJsx,
  });
  const lspLintExtensions = useMemo(() => {
    if (isShareMode) {
      return [];
    }
    return buildLspDiagnosticsExtensions(codeSectionDiagnostics);
  }, [codeSectionDiagnostics, isShareMode]);
  const finalExtensions = extensions.concat(
    lspLintExtensions,
    hasEmbeddedTerminal ? [EMBEDDED_CODE_EDITOR_THEME] : [],
  );
  const codeAreaMaxHeight = hasEmbeddedTerminal ? "100%" : maxHeight;
  let codeAreaLayoutClassName = "section-full-no-title";
  if (hasEmbeddedTerminal) {
    codeAreaLayoutClassName = "flex h-full min-h-0 flex-1 flex-col";
  }
  const embeddedOverflowClassName = hasEmbeddedTerminal ? "overflow-hidden" : "";
  const embeddedCodeMirrorClassName = hasEmbeddedTerminal
    ? "[&_.cm-theme]:flex [&_.cm-theme]:flex-col [&_.cm-theme]:h-full [&_.cm-theme]:min-h-0 [&_.cm-editor]:flex [&_.cm-editor]:flex-1 [&_.cm-editor]:flex-col [&_.cm-editor]:!h-full [&_.cm-editor]:!max-h-full [&_.cm-editor]:!min-h-0 [&_.cm-scroller]:!h-full [&_.cm-scroller]:!max-h-full [&_.cm-scroller]:min-h-0 [&_.cm-scroller]:overflow-auto"
    : "";
  const codeAreaClassName = `${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} nodrag ${codeAreaLayoutClassName} cursor-auto rounded-lg focus:bg-blue-200/70 focus:outline-none dark:focus:bg-blue-950/70 [&_*]:!outline-0 [&_.cm-activeLineGutter]:focus:!bg-transparent [&_.cm-activeLine]:focus:!bg-transparent [&_.cm-gutters]:focus:!bg-transparent ${overflow} ${embeddedOverflowClassName} ${embeddedCodeMirrorClassName} ${nowheel} ${disablePointerEvents ? "pointer-events-none select-none" : ""}`;

  // TODO: replace the arbitrary inline tailwind styles with something more elegant

  const codeEditor = (
    <article
      ref={wrapperRef}
      className={codeAreaClassName}
      data-section-main-editor
      tabIndex={0}
      onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
    >
      <CodeMirror
        maxHeight={codeAreaMaxHeight}
        height={hasEmbeddedTerminal ? "100%" : undefined}
        value={value}
        theme={theme}
        extensions={finalExtensions}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false} // I take care of this in getExtensions
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );

  const embeddedSplit = useEmbeddedTerminalSplit({
    enabled: hasEmbeddedTerminal,
    sectionId,
    projectConfigId,
  });

  if (!hasEmbeddedTerminal) {
    return codeEditor;
  }

  return (
    <div
      ref={embeddedSplit.containerRef}
      className="section-full-no-title grid h-full w-full min-h-0"
      style={{ gridTemplateRows: embeddedSplit.gridTemplateRows }}
      data-embedded-terminal-split
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-embedded-code-pane
      >
        {codeEditor}
      </div>
      <div
        className={`nodrag group flex w-full items-center justify-center ${disablePointerEvents ? "pointer-events-none select-none" : "cursor-row-resize"} touch-none`}
        style={{ height: `${embeddedSplit.handleHeight}px` }}
        onPointerDown={embeddedSplit.onHandlePointerDown}
        onMouseDown={embeddedSplit.onHandleMouseDown}
        data-embedded-terminal-resize-handle
        role="separator"
        aria-label="Resize embedded terminal"
        aria-orientation="horizontal"
      >
        <div className="h-[2px] w-full rounded-full bg-slate-200/80 transition-colors group-hover:bg-blue-400 dark:bg-slate-700/80 dark:group-hover:bg-blue-500" />
      </div>
      <div className="flex h-full min-h-0 flex-col" data-embedded-terminal-pane>
        <EmbeddedTerminalStack
          parentId={sectionId}
          childIds={embeddedChildIds}
          className="flex min-h-0 flex-1"
        />
      </div>
    </div>
  );
}

type EmbeddedTerminalStackProps = {
  parentId: string;
  childIds: string[];
  className?: string;
};

function EmbeddedTerminalStack({
  parentId,
  childIds,
  className = "",
}: EmbeddedTerminalStackProps) {
  if (childIds.length === 0) {
    return null;
  }
  return (
    <div className={className}>
      <DNDSortable sectionId={parentId} items={childIds}>
        {childIds.map((childId) => (
          <SortableSectionContainer
            key={`embedded-terminal-${childId}`}
            sectionId={childId}
            renderMode="embedded"
            className="nodrag min-h-0 flex-1"
          />
        ))}
      </DNDSortable>
    </div>
  );
}

function getEmbeddedTerminalSplitBounds({
  availableHeight,
  minCodeHeight,
  minTerminalHeight,
}: {
  availableHeight: number;
  minCodeHeight: number;
  minTerminalHeight: number;
}): EmbeddedTerminalSplitBounds {
  if (availableHeight <= 0) {
    return { minRatio: 0.5, maxRatio: 0.5 };
  }

  const cappedCodeMin = Math.min(
    minCodeHeight,
    availableHeight * EMBEDDED_TERMINAL_MIN_FRACTION,
  );
  const cappedTerminalMin = Math.min(
    minTerminalHeight,
    availableHeight * EMBEDDED_TERMINAL_MIN_FRACTION,
  );
  const minRatio = cappedCodeMin / availableHeight;
  const maxRatio = 1 - cappedTerminalMin / availableHeight;
  if (minRatio > maxRatio) {
    const midpoint = _.clamp((minRatio + maxRatio) / 2, 0, 1);
    return { minRatio: midpoint, maxRatio: midpoint };
  }

  return {
    minRatio: _.clamp(minRatio, 0, 1),
    maxRatio: _.clamp(maxRatio, 0, 1),
  };
}

function useEmbeddedTerminalSplit({
  enabled,
  sectionId,
  projectConfigId,
}: {
  enabled: boolean;
  sectionId: string;
  projectConfigId: string;
}): EmbeddedTerminalSplitState {
  const sizingPolicy = useSettings((x) => x.sectionSizingPolicy, _.isEqual);
  const storedRatio = useLocalStorage((state) => {
    const projectRatios =
      state.codeSectionSplitRatiosByProjectConfigId[projectConfigId];
    if (!projectRatios) {
      return null;
    }
    const ratio = projectRatios[sectionId];
    if (typeof ratio !== "number") {
      return null;
    }
    return ratio;
  });
  const initialRatio =
    typeof storedRatio === "number"
      ? storedRatio
      : EMBEDDED_TERMINAL_SPLIT_DEFAULT_RATIO;
  const [splitRatio, setSplitRatio] = useState(initialRatio);
  const splitRatioRef = useRef(splitRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const dragStateRef = useRef<{
    startY: number;
    startRatio: number;
    availableHeight: number;
    minRatio: number;
    maxRatio: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRatioRef = useRef<number | null>(null);
  const bodyStyleRef = useRef<{ userSelect: string; cursor: string } | null>(
    null,
  );

  useEffect(() => {
    splitRatioRef.current = splitRatio;
  }, [splitRatio]);

  useEffect(() => {
    if (typeof storedRatio !== "number") {
      return;
    }
    if (storedRatio === splitRatioRef.current) {
      return;
    }
    setSplitRatio(storedRatio);
  }, [storedRatio]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!containerRef.current || typeof ResizeObserver === "undefined") {
      return;
    }
    const resizeObserver = new ResizeObserver(([entry]) => {
      const nextHeight = Math.floor(entry.contentRect.height);
      setContainerHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [enabled]);

  const saveSplitRatio = useCallback(
    (ratio: number) => {
      if (!enabled) {
        return;
      }
      if (!Number.isFinite(ratio)) {
        return;
      }
      useLocalStorage.setState((state) => {
        const projectRatios =
          state.codeSectionSplitRatiosByProjectConfigId[projectConfigId] ?? {};
        return {
          codeSectionSplitRatiosByProjectConfigId: {
            ...state.codeSectionSplitRatiosByProjectConfigId,
            [projectConfigId]: {
              ...projectRatios,
              [sectionId]: ratio,
            },
          },
        };
      });
    },
    [enabled, projectConfigId, sectionId],
  );

  const scheduleSplitRatio = useCallback((ratio: number) => {
    pendingRatioRef.current = ratio;
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingRatioRef.current;
      if (typeof pending !== "number") {
        return;
      }
      setSplitRatio(pending);
    });
  }, []);

  const onWindowDragMove = useCallback(
    (event: PointerEvent | MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      const delta = event.clientY - dragState.startY;
      const nextRatio =
        (dragState.startRatio * dragState.availableHeight + delta) /
        dragState.availableHeight;
      const clamped = _.clamp(nextRatio, dragState.minRatio, dragState.maxRatio);
      scheduleSplitRatio(clamped);
    },
    [scheduleSplitRatio],
  );

  const endDrag = useCallback(
    (event: PointerEvent | MouseEvent | null) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      dragStateRef.current = null;
      window.removeEventListener("pointermove", onWindowDragMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("mousemove", onWindowDragMove);
      window.removeEventListener("mouseup", endDrag);

      let nextRatio = splitRatioRef.current;
      if (event) {
        const delta = event.clientY - dragState.startY;
        const rawRatio =
          (dragState.startRatio * dragState.availableHeight + delta) /
          dragState.availableHeight;
        nextRatio = _.clamp(rawRatio, dragState.minRatio, dragState.maxRatio);
        setSplitRatio(nextRatio);
      }
      saveSplitRatio(nextRatio);

      if (bodyStyleRef.current) {
        document.body.style.userSelect = bodyStyleRef.current.userSelect;
        document.body.style.cursor = bodyStyleRef.current.cursor;
        bodyStyleRef.current = null;
      }
    },
    [onWindowDragMove, saveSplitRatio],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onWindowDragMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("mousemove", onWindowDragMove);
      window.removeEventListener("mouseup", endDrag);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (bodyStyleRef.current) {
        document.body.style.userSelect = bodyStyleRef.current.userSelect;
        document.body.style.cursor = bodyStyleRef.current.cursor;
        bodyStyleRef.current = null;
      }
    };
  }, [endDrag, onWindowDragMove]);

  const startDrag = useCallback(
    (clientY: number, target: HTMLDivElement | null, pointerId?: number) => {
      if (!enabled) {
        return;
      }
      if (dragStateRef.current) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const availableHeight = Math.max(
        0,
        rect.height - EMBEDDED_TERMINAL_SPLIT_HANDLE_HEIGHT,
      );
      if (availableHeight <= 0) {
        return;
      }
      const codeMinHeight = getMinSectionHeight({
        sectionType: SectionTypeEnum.Code,
        sizingPolicy,
      });
      const terminalMinHeight = getMinSectionHeight({
        sectionType: SectionTypeEnum.Terminal,
        sizingPolicy,
      });
      const { minRatio, maxRatio } = getEmbeddedTerminalSplitBounds({
        availableHeight,
        minCodeHeight: codeMinHeight,
        minTerminalHeight: terminalMinHeight,
      });
      const baseRatio = _.clamp(
        splitRatioRef.current ?? EMBEDDED_TERMINAL_SPLIT_DEFAULT_RATIO,
        minRatio,
        maxRatio,
      );

      dragStateRef.current = {
        startY: clientY,
        startRatio: baseRatio,
        availableHeight,
        minRatio,
        maxRatio,
      };
      scheduleSplitRatio(baseRatio);

      if (!bodyStyleRef.current) {
        bodyStyleRef.current = {
          userSelect: document.body.style.userSelect,
          cursor: document.body.style.cursor,
        };
      }
      document.body.style.userSelect = "none";
      document.body.style.cursor = "row-resize";

      window.addEventListener("pointermove", onWindowDragMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
      window.addEventListener("mousemove", onWindowDragMove);
      window.addEventListener("mouseup", endDrag);
      if (target && pointerId !== undefined) {
        target.setPointerCapture(pointerId);
      }
    },
    [enabled, endDrag, onWindowDragMove, scheduleSplitRatio, sizingPolicy],
  );

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      startDrag(event.clientY, event.currentTarget, event.pointerId);
    },
    [startDrag],
  );

  const onHandleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      startDrag(event.clientY, event.currentTarget);
    },
    [startDrag],
  );

  const codeMinHeight = getMinSectionHeight({
    sectionType: SectionTypeEnum.Code,
    sizingPolicy,
  });
  const terminalMinHeight = getMinSectionHeight({
    sectionType: SectionTypeEnum.Terminal,
    sizingPolicy,
  });
  const availableHeight = Math.max(
    0,
    containerHeight - EMBEDDED_TERMINAL_SPLIT_HANDLE_HEIGHT,
  );
  const { minRatio, maxRatio } = getEmbeddedTerminalSplitBounds({
    availableHeight,
    minCodeHeight: codeMinHeight,
    minTerminalHeight: terminalMinHeight,
  });
  const clampedRatio = _.clamp(splitRatio, minRatio, maxRatio);
  const hasMeasuredHeight = availableHeight > 0;
  let gridTemplateRows = `minmax(0, 3fr) ${EMBEDDED_TERMINAL_SPLIT_HANDLE_HEIGHT}px minmax(0, 2fr)`;
  if (hasMeasuredHeight) {
    const codeHeight = Math.round(availableHeight * clampedRatio);
    const terminalHeight = Math.max(0, availableHeight - codeHeight);
    gridTemplateRows = `${codeHeight}px ${EMBEDDED_TERMINAL_SPLIT_HANDLE_HEIGHT}px ${terminalHeight}px`;
  }

  return {
    containerRef,
    gridTemplateRows,
    handleHeight: EMBEDDED_TERMINAL_SPLIT_HANDLE_HEIGHT,
    onHandlePointerDown,
    onHandleMouseDown,
  };
}

export function useCodeAreaHeight({ sectionId }) {
  const height = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.size.height;
  });
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  const { maxHeight: sectionMaxHeight } = useSectionMinMaxDims(sectionId);

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

  const isAutoHeight = height === "auto";
  const maxHeight =
    resizeEvent === "start"
      ? undefined
      : isAutoHeight
        ? `${Math.max(0, sectionMaxHeight - 30)}px`
        : `${height - 30}px`;
  const overflow =
    resizeEvent === "start" || isAutoHeight ? "overflow-y-auto" : "";

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
