import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { getKeywordStylizer } from "components/Utils/CodeMirror/getKeywordStylizer";
import { getCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
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
  dbCodeAreaCompletion,
  dbCodeAreaInitializeCode,
  getEVRefs,
} from "requests/sections";
import {
  getDisplayedSectionVariant,
  getSectionVariant,
} from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useMisc, useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";
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
  const [localEVRefs, setLocalEVRefs] = useState(evRefs);
  const keywordStylizer = useMemo(
    () => getKeywordStylizer(localEVRefs),
    [JSON.stringify(localEVRefs)],
  );
  const completionsFn = useCallback(
    getCompletionsFn(
      sectionId,
      null,
      dbCodeAreaCompletion,
      setLocalEVRefs,
      language,
    ),
    [sectionId],
  );

  useDeepCompareEffect(() => {
    setLocalEVRefs(evRefs);
  }, [evRefs]);

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

  function onChange(v) {
    useSectionInfos.setState((x) => {
      getSectionVariant(sectionId, x).code = v;
    });
    debouncedSetEVRefs(sectionId, v);
  }

  function onMouseDown() {
    dbCodeAreaInitializeCode({ sectionId });
  }

  const { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv } =
    codeAreaTabOnEnterKeyHandlers(wrapperRef);

  const extensions = getExtensions({
    sectionId,
    language,
    completionsFn,
    keywordStylizer,
    onModEnterDoNothing: true,
    onEscape: onEscapeFocusOnArticleDiv,
    escapeToBlur: true,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled: variantIsFrozen,
  });

  return (
    <article
      ref={wrapperRef}
      className={`nodrag section-full-no-title cursor-auto [&_*]:!outline-0 ${overflow} ${nowheel}`}
      tabIndex="0"
      onKeyDown={onArticleDivEnterKeyFocusOnCodeMirror}
    >
      <CodeMirror
        maxHeight={maxHeight}
        value={value}
        theme={theme}
        extensions={extensions}
        onMouseDown={onMouseDown}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        indentWithTab={false} // I take care of this in getExtensions
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

  function onEscapeFocusOnArticleDiv() {
    wrapperRef.current.focus({ preventScroll: true });
  }

  return { onArticleDivEnterKeyFocusOnCodeMirror, onEscapeFocusOnArticleDiv };
}

const debouncedSetEVRefs = asyncDebounce(async (sectionId, value) => {
  const evRefs = await getEVRefs({
    sectionId,
    paramInfoId: null,
    fullText: value,
    regexPatternKey: "codeAreaPattern",
  });
  useSectionInfos.setState((x) => {
    getSectionVariant(sectionId, x).evRefs = evRefs;
  });
  maybeIncrementProjectStateVersion(true);
}, 500);
