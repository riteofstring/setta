import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { EditorState, Prec, RangeSetBuilder } from "@codemirror/state";
import { Decoration, keymap, ViewPlugin } from "@codemirror/view";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import {
  dbTextFieldCompletion,
  dbTextFieldInitializeCode,
} from "dbRequests/sections";
import _ from "lodash";
import { useKeywordRegex } from "models/info/keywordRegex";
import { useCallback, useRef, useState } from "react";
import { goToSection } from "thunks/goToSection";
import { variableClick } from "thunks/keyActivations";
import { useCodeMirrorStyle } from "utils/CodeMirror/useCodeMirrorStyle";
import { useReactFlow } from "xyflow/core/store";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { roundUpIdx } from "./utils";

// Step 1: Define the Decoration
const italicStyle = Decoration.mark({ class: "italic" });

// Step 2: Define the Extension
function getKeywordStylizer(keywordLocations, pattern) {
  return ViewPlugin.fromClass(
    class {
      decorations;

      constructor(view) {
        this.decorations = this.buildDecorations(view);
      }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const newKeywordLocations = [];
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.doc.sliceString(from, to);
          let match;
          while ((match = pattern.exec(text))) {
            const startPos = from + match.index;
            const endPos = startPos + match[0].length;
            newKeywordLocations.push({ startPos, endPos, keyword: match[0] });
            builder.add(startPos, endPos, italicStyle);
          }
        }
        keywordLocations.current = newKeywordLocations;
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

function getContentDomEventListener(keywordLocations, editor) {
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

    for (const k of keywordLocations.current) {
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

function getOnCreateEditor({
  keywordLocations,
  initialEvent,
  setRealIsInitialized,
  divId,
  value,
  defaultVal,
}) {
  return (view) => {
    view.contentDOM.addEventListener(
      "click",
      getContentDomEventListener(keywordLocations, view),
    );
    view.focus();
    const { clientX, clientY } = initialEvent;
    const pos = view.posAtCoords({ x: clientX, y: clientY });
    view.dispatch({ selection: { anchor: pos, head: pos } });

    fixPlaceholderCursor(divId, value, defaultVal);
    setRealIsInitialized(true);
  };
}

function getCompletionsFn(sectionId, paramInfoId) {
  return async (context) => {
    const fullText = context.state.doc.toString();
    if (!fullText.trim()) return null;
    const before = context.matchBefore(/([^.=\\(+-\/ ]*)$/);
    const res = await dbTextFieldCompletion({
      sectionId,
      paramInfoId,
      fullText,
      beforeText: before.text,
      position: context.pos,
    });
    if (res.status === 200) {
      return {
        filter: true,
        from: before ? before.from : context.pos,
        options: res.data,
        // validFor: /([^.=\\(]*)$/,
      };
    }
    return null;
  };
}

function goToSectionOnNameClick({ editor, event, variable }) {
  const { sectionId } = useKeywordRegex.getState().fullNameToInfo[variable];
  if (sectionId) {
    event.stopPropagation(); //prevent SectionContainerCore onClick from triggering
    if (editor) {
      editor.contentDOM.blur(); //blur the input field we just clicked on
    }
    goToSection(sectionId);
  }
}

export function TextInputCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  className,
  singleLine,
  onEnter,
  classes,
  variants,
  area,
}) {
  const [activationEvent, setActivationEvent] = useState(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const pattern = useKeywordRegex((x) => x.pattern, _.isEqual);

  function onBlur() {
    setActivationEvent(null);
    setRealIsInitialized(false);
  }

  function onMouseDown(event) {
    // if (!variableClick(event)) {
    if (!variableClick(event) && event.button === 0) {
      dbTextFieldInitializeCode({ sectionId, paramInfoId });
      setActivationEvent(event);
    }
  }

  const theme = useCodeMirrorStyle();

  return (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          code={value}
          onMouseDown={onMouseDown}
          className={`${className} nodrag cursor-text select-text break-words ${classes ? classes : "pl-[6px] pr-[2px]"} font-mono text-xs [tab-size:4] [word-break:break-word] ${area}`}
          theme={theme}
          keywordRegex={pattern}
          goToSectionOnNameClick={goToSectionOnNameClick}
          placeholder={defaultVal}
        />
      )}
      {activationEvent && (
        <CoreCodeMirror
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          className={`cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] ${className} ${variants ? variants : ""} ${area}`}
          singleLine={singleLine}
          onEnter={onEnter}
          onBlur={onBlur}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          theme={theme}
          keywordRegex={pattern}
        />
      )}
    </>
  );
}

function CoreCodeMirror({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  className,
  singleLine,
  onEnter,
  onBlur,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  theme,
  keywordRegex,
  keywordColorMap,
}) {
  function localOnChange(newVal) {
    if (value === newVal) {
      return;
    }
    onChange(newVal);
  }

  const keywordLocations = useRef([]);
  const keywordStylizer = getKeywordStylizer(keywordLocations, keywordRegex);

  const completionsFn = useCallback(getCompletionsFn(sectionId, paramInfoId), [
    sectionId,
    paramInfoId,
  ]);

  const extensions = [
    python(),
    autocompletion({
      override: [completionsFn],
    }),
    keywordStylizer,
    EditorView.lineWrapping,
  ];
  if (singleLine) {
    extensions.push(
      EditorState.transactionFilter.of((tr) => (tr.newDoc.lines > 1 ? [] : tr)),
    );
  }

  const tabToAutocomplete = keymap.of([
    {
      key: "Tab",
      preventDefault: true,
      // shift: indentLess,
      run: (e) => {
        if (completionStatus(e.state)) {
          return acceptCompletion(e);
        }
      },
    },
  ]);
  extensions.push(tabToAutocomplete);

  if (onEnter) {
    const keyBinding = Prec.highest(
      keymap.of([
        {
          key: "Enter",
          run: onEnter,
        },
      ]),
    );
    extensions.push(keyBinding);
  }

  const divId = `CodeMirror-${sectionId}-${paramInfoId}`;

  function onClick() {
    fixPlaceholderCursor(divId, value, defaultVal);
  }

  return (
    <CodeMirror
      id={divId}
      className={`nodrag [&_*]:!outline-0 ${className} ${!realIsInitialized ? "opacity-0" : ""}`}
      value={value}
      placeholder={defaultVal}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
      }}
      onCreateEditor={getOnCreateEditor({
        keywordLocations,
        initialEvent,
        setRealIsInitialized,
        divId,
        value,
        defaultVal,
      })}
      theme={theme}
      extensions={extensions}
      onChange={localOnChange}
      onBlur={onBlur}
      onClick={onClick}
      indentWithTab={false}
    />
  );
}

// <div class="cm-theme nodrag" onMouseDown={onMouseDown}>
// <div class="cm-editor ͼ1 ͼ3 ͼ4 ͼ10s ͼ21">
//   <div class="cm-announced" aria-live="polite"></div>
//   <div tabindex="-1" class="cm-scroller">
//     <div
//       spellcheck="false"
//       autocorrect="off"
//       autocapitalize="off"
//       translate="no"
//       contenteditable="true"
//       style={{ tabSize: 4 }}
//       class="cm-content cm-lineWrapping"
//       role="textbox"
//       aria-multiline="true"
//       data-language="python"
//       aria-autocomplete="list"
//     >
//       <div class="cm-activeLine cm-line">
//         <span class="ͼ25">Kevin</span>
//       </div>
//     </div>
//     <div
//       class="cm-layer cm-layer-above cm-cursorLayer"
//       aria-hidden="true"
//       style={{
//         zIndex: 150,
//         animationDuration: "1200ms",
//         transform: "scale(1.51907, 1.50454)",
//         animationName: "cm-blink",
//       }}
//     >
//       <div
//         class="cm-cursor cm-cursor-primary"
//         style={{
//           left: "18.0995px",
//           top: "3.43622px",
//           height: "9.99625px",
//         }}
//       ></div>
//     </div>
//     <div
//       class="cm-layer cm-selectionLayer"
//       aria-hidden="true"
//       style={{ zIndex: -2, transform: "scale(1.51907, 1.50454)" }}
//     ></div>
//   </div>
// </div>
// </div>
