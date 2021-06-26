import { Stack, Spacer, Select } from "@chakra-ui/react";
import SectionTitle from "./Title/SectionTitle";
import { useStoreState, useStoreActions } from "easy-peasy";
import Incrementer from "../Incrementer/Incrementer";

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
          />
        </>
      )}
    </Stack>
  );
}
