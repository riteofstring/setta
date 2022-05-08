import { Stack, Spacer } from "@chakra-ui/react";

import Incrementer from "../Incrementer/Incrementer";
import SectionTitle from "./Title/SectionTitle";

export function SectionHeader({
  sectionId,
  variableName,
  parentId,
  nextId,
  isList,
  isListRoot,
  requiresKeyInput,
  onTitleInputChange,
  addChild,
  deleteChild,
  parentControls,
  hasNested,
}) {
  return (
    <Stack direction="row" align="center" w="100%">
      <SectionTitle
        heading={variableName}
        requiresKeyInput={requiresKeyInput}
        onTitleInputChange={onTitleInputChange}
      />

      {(isList || isListRoot) && (
        <>
          <Spacer />
          <Incrementer
            sectionId={sectionId}
            parentId={parentId}
            nextId={nextId}
            isListRoot={isListRoot}
            addChild={addChild}
            deleteChild={deleteChild}
            parentControls={parentControls}
            hasNested={hasNested}
          />
        </>
      )}
    </Stack>
  );
}
