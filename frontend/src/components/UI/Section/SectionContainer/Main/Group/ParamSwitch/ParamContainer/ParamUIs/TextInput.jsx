import { autocompletion } from "@codemirror/autocomplete";
import { python } from "@codemirror/lang-python";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin } from "@codemirror/view";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import _ from "lodash";
import { useKeywordRegex } from "models/info/keywordRegex";
import { useSectionInfos } from "models/info/sectionInfos";
import { goToSection } from "thunks/goToSection";
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
    // Convert click coordinates to a position in the editor
    const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) {
      return;
    }

    // Get the token at the clicked position
    const range = editor.state.wordAt(pos);
    console.log("range", range);
    if (range === null) {
      return;
    }
    const word = editor.state.doc.toString().substring(range.from, range.to);
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

function myCompletions(context) {
  let before = context.matchBefore(/\w+/);
  // If completion wasn't explicitly started and there
  // is no word before the cursor, don't open completions.
  if (!context.explicit && !before) return null;
  return {
    from: before ? before.from : context.pos,
    options: completions,
    validFor: /^\w*$/,
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
  // const [results, send] = useTextFieldCompletionWebsocketRoom(
  //   sectionId,
  //   paramInfoId,
  // );

  // const [isFocused, setIsFocused] = useState(false);

  // const handleFocus = () => {
  //   setIsFocused(true);
  // };

  // const handleBlur = () => {
  //   setIsFocused(false);
  // };

  // const allItems = [{ group: "search results", items: results }];

  // function updateValue(newVal, requestCompletions = false) {
  //   if (value === newVal) {
  //     return;
  //   }
  //   onChange(newVal);
  //   if (requestCompletions) {
  //     send(newVal);
  //   }
  // }

  // const {
  //   isOpen,
  //   getMenuProps,
  //   getInputProps,
  //   highlightedIndex,
  //   getItemProps,
  // } = useTextFieldCombobox({ allItems, value, updateValue });

  // function onClick(e) {
  //   if (variableClick(e)) {
  //     ctrlClick(e);
  //   } else {
  //     textFieldInitializeCode(sectionId, paramInfoId);
  //   }
  // }

  const { pattern, colorMap } = useKeywordRegex((x) => x);
  const { theme } = useCodeMirrorStyle();
  const keywordStylizer = getKeywordStylizer(pattern, colorMap);

  return (
    <div className="nodrag">
      <CodeMirror
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
        }}
        onCreateEditor={onCreateEditor}
        theme={theme}
        extensions={[
          python(),
          autocompletion({ override: [myCompletions] }),
          keywordStylizer,
          EditorView.lineWrapping,
        ]}
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

function StyledText({ value }) {
  // Split text into segments
  const segments = value.split(pattern);
  return segments.map((segment, index) => {
    const color = colorMap[segment];
    return (
      <span
        key={index}
        style={{ color }}
        onClick={getOnTextInputVariableClick(color, segment)}
      >
        {segment}
      </span>
    );
  });
}

function getOnTextInputVariableClick(color, variable) {
  if (color) {
    return (e) => {
      const section =
        color === "green"
          ? useSectionInfos.getState().x[SINGLETON_SECTIONS.globalVariables]
          : _.find(useSectionInfos.getState().x, (s) => s.name === variable);
      const id = section?.id;
      if (id) {
        e.stopPropagation(); //prevent SectionContainerCore onClick from triggering
        e.relatedTarget.blur(); //blur the input field we just clicked on
        goToSection(id);
      }
    };
  }
  return undefined;
}
