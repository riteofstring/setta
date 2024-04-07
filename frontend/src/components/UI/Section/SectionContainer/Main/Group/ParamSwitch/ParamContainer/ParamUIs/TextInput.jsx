import { autocompletion } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { dbTextFieldInitializeCode } from "dbRequests/sections";
import { useTextFieldCompletionWebsocketRoom } from "hooks/useWebsocket";
import _ from "lodash";
import { useKeywordRegex } from "models/info/keywordRegex";
import { useSectionInfos } from "models/info/sectionInfos";
import { goToSection } from "thunks/goToSection";
import { variableClick } from "thunks/keyActivations";
import { useCodeMirrorStyle } from "utils/CodeMirror/useCodeMirrorStyle";
import { SINGLETON_SECTIONS } from "utils/constants";

// Step 1: Define the Decoration
const italicStyle = Decoration.mark({ class: "italic" });

// Step 2: Define the Extension

function getKeywordStylizer(pattern, colorMap) {
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
        for (const { from, to } of view.visibleRanges) {
          const text = view.state.doc.sliceString(from, to);
          let match;
          while ((match = pattern.exec(text))) {
            const startPos = from + match.index;
            const endPos = startPos + match[0].length;
            builder.add(startPos, endPos, italicStyle);
          }
        }
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

function getContentDomEventListener(editor) {
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

    // Get the token at the clicked position
    const range = editor.state.wordAt(pos);
    if (range === null) {
      return;
    }
    const word = editor.state.doc.toString().substring(range.from, range.to);
    let match;
    while ((match = useKeywordRegex.getState().pattern.exec(word))) {
      goToSectionOnNameClick(event, match[0]);
    }
  };
}

function onCreateEditor(view) {
  view.contentDOM.addEventListener("click", getContentDomEventListener(view));
}

export function TextInputConfig() {
  return null;
}

// Our list of completions (can be static, since the editor
/// will do filtering based on context).
const completions = [
  { label: "panic", type: "keyword" },
  { label: "park", type: "constant", info: "Test completion" },
  { label: "password", type: "variable" },
];

function getCompletionsFn() {
  return (context) => {
    let before = context.matchBefore(/\w+/);
    // If completion wasn't explicitly started and there
    // is no word before the cursor, don't open completions.
    if (!context.explicit && !before) return null;
    console.log("context", context);
    return {
      from: before ? before.from : context.pos,
      options: completions,
      validFor: /^\w*$/,
    };
  };
}

export function TextInput({
  sectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  isDisabled,
  className,
  classes,
  variants,
  area = "card-value",
}) {
  const [results, send] = useTextFieldCompletionWebsocketRoom(
    sectionId,
    paramInfoId,
  );

  function localOnChange(newVal) {
    if (value === newVal) {
      return;
    }
    onChange(newVal);
  }

  function onClick(e) {
    // if (variableClick(e)) {
    //   ctrlClick(e);
    // } else {
    dbTextFieldInitializeCode({ sectionId, paramInfoId });
    // }
  }

  const { pattern, colorMap } = useKeywordRegex((x) => x, _.isEqual);
  const { theme } = useCodeMirrorStyle();
  const keywordStylizer = getKeywordStylizer(pattern, colorMap);

  return (
    <div className="nodrag">
      <CodeMirror
        value={value}
        placeholder={defaultVal}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
        }}
        onCreateEditor={onCreateEditor}
        theme={theme}
        extensions={[
          python(),
          autocompletion({ override: [getCompletionsFn()] }),
          keywordStylizer,
          EditorView.lineWrapping,
        ]}
        onClick={onClick}
        onChange={localOnChange}
      />
    </div>
  );
}

function ctrlClick(e) {
  e.stopPropagation(); //prevent SectionContainerCore onClick from triggering
  const { clientX, clientY } = e;

  // Simulate click on the underlying element
  const simulatedEvent = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX,
    clientY,
    ctrlKey: true,
    relatedTarget: e.target,
  });

  e.target.style.pointerEvents = "none";
  const elementBelow = document.elementFromPoint(clientX, clientY);
  e.target.style.pointerEvents = "";
  elementBelow.dispatchEvent(simulatedEvent);
}

function goToSectionOnNameClick(event, variable) {
  let section = _.find(
    useSectionInfos.getState().x,
    (s) => s.name === variable,
  );
  if (!section) {
    section = useSectionInfos.getState().x[SINGLETON_SECTIONS.globalVariables];
  }
  const id = section?.id;
  if (id) {
    event.stopPropagation(); //prevent SectionContainerCore onClick from triggering
    // event.relatedTarget.blur(); //blur the input field we just clicked on
    goToSection(id);
  }
}
