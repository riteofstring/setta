import { Button } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useRef, useState } from "react";
import { IoIosRocket } from "react-icons/io";

import styles from "./TextEditor.module.css";

export default function TextEditor({ idx, dimensions }) {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const valueGetter = useRef();
  const enteredText = useStoreState(
    (state) => state.yamlEntry.enteredText[idx]
  );
  const setEnteredText = useStoreActions(
    (actions) => actions.yamlEntry.setEnteredText
  );

  const handleEditorDidMount = (_valueGetter) => {
    setIsEditorReady(true);
    valueGetter.current = _valueGetter;
  };

  const handleCreateUI = async () => {
    // createUI();
  };

  const onChange = (newValue) => {
    setEnteredText({ idx, text: newValue });
  };
  return (
    <>
      <Button
        rightIcon={<IoIosRocket />}
        onClick={handleCreateUI}
        disabled={!isEditorReady}
        variant="outline"
        mb="1rem"
        borderRadius="full"
        // bg="gray.400"
        // color="gray.50"
      >
        Create UI
      </Button>
      <Editor
        language="yaml"
        value={enteredText}
        onMount={handleEditorDidMount}
        onChange={onChange}
        options={{ automaticLayout: true }}
        // className={styles.container}
        wrapperClassName={styles.wrapper}
        height={`calc(${dimensions.height}px - 8rem)`}
        width={`calc(${dimensions.width}px - .33rem)`}
        // w={`calc(${dimensions.width}px`}
      />
    </>
  );
}
