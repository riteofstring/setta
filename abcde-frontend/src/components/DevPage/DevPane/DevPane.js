import React, { useRef, useState } from "react";
import { Flex, Button } from "@chakra-ui/react";
import Editor from "@monaco-editor/react";

const DevPane = () => {
  const [isEditorReady, setIsEditorReady] = useState(false);
  const valueGetter = useRef();

  function handleEditorDidMount(_valueGetter) {
    setIsEditorReady(true);
    valueGetter.current = _valueGetter;
  }

  function handleShowValue() {
    alert(valueGetter.current());
  }

  return (
    <>
      <Button onClick={handleShowValue} disabled={!isEditorReady}>
        Show value
      </Button>
      <Flex width="90vw">
        <Editor
          height="90vh"
          language="yaml"
          value={"// write your code here"}
          editorDidMount={handleEditorDidMount}
        />
      </Flex>
    </>
  );
};

export default React.memo(DevPane);
