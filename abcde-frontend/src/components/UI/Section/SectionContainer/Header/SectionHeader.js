import { Stack, Spacer } from "@chakra-ui/react";

import Incrementer from "../Incrementer/Incrementer";
import CustomCloseButton from "./CustomCloseButton";
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
    <Stack direction="row" align="center" w="100%" pl="0.75em">
      <SectionTitle
        heading={variableName}
        requiresKeyInput={requiresKeyInput}
        onTitleInputChange={onTitleInputChange}
      />
      <Spacer />
      {(isList || isListRoot) && (
        <>
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
      <CustomCloseButton />
    </Stack>
  );
}
