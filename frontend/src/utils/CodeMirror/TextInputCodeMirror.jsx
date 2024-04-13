import { autocompletion } from "@codemirror/autocomplete";
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
import { useSectionInfos } from "models/info/sectionInfos";
import { useCallback } from "react";
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

function getContentDomEventListener(editor, sectionId, paramInfoId) {
  return (event) => {
    if (!variableClick(event)) {
      dbTextFieldInitializeCode({ sectionId, paramInfoId });
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
      goToSectionOnNameClick(editor, event, match[0]);
    }
  };
}

function getOnCreateEditor({ sectionId, paramInfoId }) {
  return (view) => {
    view.contentDOM.addEventListener(
      "click",
      getContentDomEventListener(view, sectionId, paramInfoId),
    );
  };
}

function getCompletionsFn(sectionId, paramInfoId) {
  return async (context) => {
    const fullText = context.state.doc.toString();
    if (!fullText.trim()) return null;
    const before = context.matchBefore(/([^.=\\(]*)$/);
    const res = await dbTextFieldCompletion({
      sectionId,
      paramInfoId,
      fullText,
      beforeText: before.text,
      position: context.pos,
    });
    if (res.status === 200) {
      return {
        filter: false,
        from: before ? before.from : context.pos,
        options: res.data.map((x) => ({
          label: x.completion,
          type: x.type,
        })),
        // validFor: /([^.=\\(]*)$/,
      };
    }
    return null;
  };
}

function goToSectionOnNameClick(editor, event, variable) {
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
    editor.contentDOM.blur(); //blur the input field we just clicked on
    goToSection(id);
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
}) {
  function localOnChange(newVal) {
    if (value === newVal) {
      return;
    }
    onChange(newVal);
  }

  const { pattern, colorMap } = useKeywordRegex((x) => x, _.isEqual);
  const { theme } = useCodeMirrorStyle();
  const keywordStylizer = getKeywordStylizer(pattern, colorMap);

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

  return (
    <CodeMirror
      className={className}
      value={value}
      placeholder={defaultVal}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
      }}
      onCreateEditor={getOnCreateEditor({ sectionId, paramInfoId })}
      theme={theme}
      extensions={extensions}
      onChange={localOnChange}
    />
  );
}
