import { useReactFlow } from "forks/xyflow/core/store";
import { dbTextFieldCompletion } from "requests/sections";
import { variableClick } from "state/actions/keyActivations";
import { setTextFieldWaitingForLSP } from "state/actions/lsp";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useKeywordRegex } from "state/definitions";
import { roundUpIdx } from "./utils";

function getContentDomEventListener(keywordPositions, editor) {
  return (event) => {
    if (!variableClick(event)) {
      return;
    }

    event.stopPropagation(); //prevent SectionContainerCore onClick from triggering

    // Convert click coordinates to a position in the editor
    const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) {
      return;
    }

    let keywordInfo = null;

    for (const k of keywordPositions) {
      if (pos >= k.startPos && pos < k.endPos) {
        keywordInfo = k;
        break;
      }
    }

    if (keywordInfo) {
      const { startPos, keyword } = keywordInfo;
      const endIdx = roundUpIdx(
        useKeywordRegex.getState().fullNameToInfo[keyword].componentIndices,
        pos - startPos,
      );
      goToSectionOnNameClick({
        editor,
        event,
        variable: keyword.slice(0, endIdx),
      });
    }
  };
}

function fixPlaceholderCursor(divId, value, defaultVal) {
  // The cursor appears the wrong size when there's a placeholder text and when you're zoomed in.
  // This is a hacky solution to that problem.
  if (!value && defaultVal) {
    const divs = document.querySelectorAll(`#${divId} .cm-cursor`);
    divs.forEach((div) => {
      div.style.height = `${14 * useReactFlow.getState().transform[2]}px`;
    });
  }
}

export function getOnCreateEditor({
  keywordPositions,
  initialEvent,
  setRealIsInitialized,
  divId,
  value,
  defaultVal,
}) {
  return (view) => {
    view.contentDOM.addEventListener(
      "click",
      getContentDomEventListener(keywordPositions, view),
    );
    view.focus();
    if (initialEvent !== "tab") {
      const { clientX, clientY } = initialEvent;
      const pos = view.posAtCoords({ x: clientX, y: clientY });
      view.dispatch({ selection: { anchor: pos, head: pos } });
    }

    fixPlaceholderCursor(divId, value, defaultVal);
    setRealIsInitialized(true);
  };
}

export function getCompletionsFn(sectionId, paramInfoId) {
  return async (context) => {
    const fullText = context.state.doc.toString();
    if (!fullText.trim()) return null;
    const before = context.matchBefore(/([^.=\\(+-\/ ]*)$/);
    const setToNotWaiting = setTextFieldWaitingForLSP({
      sectionId,
      paramInfoId,
    });
    const res = await dbTextFieldCompletion({
      sectionId,
      paramInfoId,
      fullText,
      beforeText: before.text,
      position: context.pos,
    });
    setToNotWaiting();
    console.log("res", res);
    if (res) {
      return {
        filter: true,
        from: before ? before.from : context.pos,
        options: res,
        // validFor: /([^.=\\(]*)$/,
      };
    }
    return null;
  };
}

export function goToSectionOnNameClick({ editor, event, variable }) {
  const { sectionId } = useKeywordRegex.getState().fullNameToInfo[variable];
  if (sectionId) {
    event.stopPropagation(); //prevent SectionContainerCore onClick from triggering
    if (editor) {
      editor.contentDOM.blur(); //blur the input field we just clicked on
    }
    goToSection(sectionId);
  }
}
