import { EditorState, Facet, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
} from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useKeywordStylizer } from "components/Utils/CodeMirror/getKeywordStylizer";
import { getCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useReactFlow } from "forks/xyflow/core/store";
import { computeReadyToBeVisible } from "forks/xyflow/core/store/utils";
import _ from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { dbCodeAreaCompletion } from "requests/sections";
import {
  getDisplayedSectionVariant,
  getSectionVariant,
} from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useMisc, useSectionInfos } from "state/definitions";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { asyncDebounce } from "utils/utils";

function _CodeArea({ sectionId }) {
  const language = useSectionInfos((x) => x.x[sectionId].codeLanguage);

  switch (language) {
    case "python":
      return <PythonCodeArea sectionId={sectionId} language={language} />;
    case "bash":
      return <BashCodeArea sectionId={sectionId} language={language} />;
    case "javascript":
      return <JavascriptCodeArea sectionId={sectionId} language={language} />;
  }
}

export const CodeArea = React.memo(_CodeArea);

function PythonCodeArea({ sectionId, language }) {
  const evRefs = useSectionInfos(
    (x) => getDisplayedSectionVariant(sectionId, x).evRefs,
    _.isEqual,
  );

  const keywordStylizer = useKeywordStylizer(evRefs);

  const completionsFn = useCallback(
    getCompletionsFn(sectionId, null, dbCodeAreaCompletion, language),
    [sectionId],
  );

  return (
    <CoreCodeArea
      sectionId={sectionId}
      language={language}
      completionsFn={completionsFn}
      keywordStylizer={keywordStylizer}
    />
  );
}

function BashCodeArea({ sectionId, language }) {
  return <CoreCodeArea sectionId={sectionId} language={language} />;
}

function JavascriptCodeArea({ sectionId, language }) {
  return <CoreCodeArea sectionId={sectionId} language={language} />;
}

function CoreCodeArea({ sectionId, language, completionsFn, keywordStylizer }) {
  const { value, variantIsFrozen } = useSectionInfos((x) => {
    return {
      value: getDisplayedSectionVariant(sectionId, x).code,
      variantIsFrozen: getSectionVariant(sectionId).isFrozen,
    };
  }, _.isEqual);

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();
  const [localValue, setLocalValue] = useState(value);
  const abortController = useRef();

  useEffect(() => {
    if (value !== localValue) {
      setLocalValue(value);
    }
  }, [value]);

  function onChange(v) {
    abortController.current?.abort();
    setLocalValue(v);
    debouncedSetCode(sectionId, v, abortController);
  }

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);

  const extensions = getExtensions({
    sectionId,
    language,
    completionsFn,
    keywordStylizer,
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
      tabIndex="0"
      onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
    >
      <CodeMirror
        maxHeight={maxHeight}
        // value={localValue}
        value={
          "This is editable.\nThis is NOT editable.\nThis is editable again."
        }
        theme={theme}
        extensions={[
          ...extensions,
          uneditableRanges.of({ from: 10, to: 50 }), // Make characters 10-50 uneditable
          readOnlyRangesExtension,
          uneditableRangeStyle,
          uneditableStyles,
          labelDecorationField,
        ]}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false} // I take care of this in getExtensions
        basicSetup={{ tabSize: 4 }}
      />
    </article>
  );
}

export function useCodeAreaHeight({ sectionId }) {
  const { resizeEvent, height } = useSectionInfos((x) => {
    return {
      resizeEvent: x.x[sectionId].resizeEvent,
      height: x.x[sectionId].size.height,
    };
  }, _.isEqual);

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
        useSectionInfos.setState((state) => {
          const s = state.x[sectionId];
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

const debouncedSetCode = asyncDebounce(
  async (sectionId, value, abortControllerRef) => {
    const ac = new AbortController();
    abortControllerRef.current = ac;

    if (ac.signal.aborted) {
      return;
    }

    if (ac.signal.aborted) {
      return;
    }
    useSectionInfos.setState((x) => {
      const sectionVariant = getSectionVariant(sectionId, x);
      sectionVariant.code = value;
    });

    maybeIncrementProjectStateVersion(true);
  },
  50,
);

// Create a facet to store uneditable ranges
const uneditableRanges = Facet.define({
  combine: (ranges) => ranges,
});

// Create the extension that checks against these ranges
const readOnlyRangesExtension = EditorState.transactionFilter.of((tr) => {
  const ranges = tr.startState.facet(uneditableRanges) || [];

  // Check if any ranges are affected by this transaction
  for (let range of ranges) {
    if (tr.changes.touchesRange(range.from, range.to)) {
      return []; // Reject the transaction
    }
  }
  return tr;
});

// Create decorations for visual styling of uneditable regions
const uneditableRangeStyle = ViewPlugin.fromClass(
  class {
    decorations;

    constructor(view) {
      this.decorations = this.createDecorations(view);
    }

    update(update) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.facet(uneditableRanges) !==
          update.state.facet(uneditableRanges)
      ) {
        this.decorations = this.createDecorations(update.view);
      }
    }

    createDecorations(view) {
      const ranges = view.state.facet(uneditableRanges) || [];
      let decorations = [];

      for (let range of ranges) {
        // Add mark decoration for the uneditable range
        decorations.push(
          Decoration.mark({
            class: "cm-uneditable-region",
          }).range(range.from, range.to),
        );
      }

      return Decoration.set(decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

// CSS styles for the editor
const uneditableStyles = EditorView.theme({
  ".cm-uneditable-region": {
    backgroundColor: "#f0f0f0",
    color: "#666",
    cursor: "not-allowed",
  },
});

class BlockLabelWidget extends WidgetType {
  constructor(label) {
    super();
    this.label = label;
  }

  toDOM() {
    const div = document.createElement("div");
    div.textContent = this.label;
    div.style.backgroundColor = "#e0e0e0"; // Light gray background for visibility
    div.style.padding = "2px"; // Add some padding
    div.style.margin = "2px 0"; // Add vertical spacing
    div.style.width = "100%"; // Full width to act as a block
    return div;
  }

  ignoreEvent() {
    return true; // Prevent the widget from interfering with editor events
  }
}

function computeLabelDecorations(state) {
  const decorations = [];
  const doc = state.doc;

  // Iterate through each line in the document
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;

    // Check if the line contains "NOT"
    if (lineText.includes("NOT")) {
      // Place the widget at the end of the line
      const pos = line.to;
      const deco = Decoration.widget({
        widget: new BlockLabelWidget("Read-only"), // The label text
        block: true, // Treat it as a block-level element
        side: 1, // Place it after the line content
      });
      decorations.push(deco.range(pos));
    }
  }

  return Decoration.set(decorations);
}

// Define the StateField to hold the decorations
const labelDecorationField = StateField.define({
  create(state) {
    return computeLabelDecorations(state);
  },
  update(decorations, transaction) {
    return computeLabelDecorations(transaction.state);
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});
