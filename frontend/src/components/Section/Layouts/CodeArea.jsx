import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { getKeywordStylizer } from "components/Utils/CodeMirror/getKeywordStylizer";
import { getCompletionsFn } from "components/Utils/CodeMirror/getOnCreateEditor";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
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
  getKeywordPositionsAndEVRefs,
} from "requests/sections";
import {
  getDisplayedSectionVariant,
  setSectionVariantAttr,
} from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";
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
  const keywordPositions = useSectionInfos(
    (x) => getDisplayedSectionVariant(sectionId, x).keywordPositions,
  );
  const [localKeywordPositions, setLocalKeywordPositions] =
    useState(keywordPositions);
  const keywordStylizer = useMemo(
    () => getKeywordStylizer(localKeywordPositions),
    [JSON.stringify(localKeywordPositions)],
  );
  const completionsFn = useCallback(
    getCompletionsFn(
      sectionId,
      null,
      dbCodeAreaCompletion,
      setLocalKeywordPositions,
      language,
    ),
    [sectionId],
  );

  useDeepCompareEffect(() => {
    setLocalKeywordPositions(keywordPositions);
  }, [keywordPositions]);

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
  const value = useSectionInfos(
    (x) => getDisplayedSectionVariant(sectionId, x).code,
  );

  const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
    useCodeAreaHeight({ sectionId });

  const theme = useCodeMirrorStyle();
  const variantIsDisabled = useSectionVariantIsFrozen(sectionId);

  function onChange(v) {
    setSectionVariantAttr(sectionId, "code", v);
    debouncedSetKeywordPositions(sectionId, v);
  }

  function onMouseDown() {
    dbCodeAreaInitializeCode({ sectionId });
  }

  const extensions = getExtensions({
    sectionId,
    language,
    completionsFn,
    keywordStylizer,
    onModEnterDoNothing: true,
    escapeToBlur: true,
    tabToAutocomplete: true,
    indentWithTab: true,
    isDisabled: variantIsDisabled,
  });

  return (
    <article
      ref={wrapperRef}
      className={`nodrag section-full-no-title cursor-auto [&_*]:!outline-0 ${overflow} ${nowheel}`}
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

  const handleCreateEditor = useCallback((view) => {
    editorRef.current = view;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setNoWheel(
        entry.target.scrollHeight > entry.target.clientHeight ? "nowheel" : "",
      );
    });
    resizeObserver.observe(editorRef.current.scrollDOM);
    resizeObserverRef.current = resizeObserver;
  }, []);

  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

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

const debouncedSetKeywordPositions = asyncDebounce(async (sectionId, value) => {
  const { keywordPositions } = await getKeywordPositionsAndEVRefs({
    sectionId,
    paramInfoId: null,
    fullText: value,
    regexPatternKey: "codeAreaPattern",
  });
  setSectionVariantAttr(sectionId, "keywordPositions", keywordPositions);
}, 500);
