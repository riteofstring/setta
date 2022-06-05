import { Stack, Spacer } from "@chakra-ui/react";
import { useDeleteChild } from "hooks/useAddDeleteChild";

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
  idxForList
}) {
  const deleteSelf = useDeleteChild(parentId);

  const onCustomCloseButtonClick = () => {
    deleteSelf({ startId: sectionId });
  };

  return (
    <Stack direction="row" align="center" w="100%" pl="0.75em">
      <SectionTitle
        heading={variableName}
        requiresKeyInput={requiresKeyInput}
        onTitleInputChange={onTitleInputChange}
        isList={isList}
        idxForList={idxForList}
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
      <CustomCloseButton
        onClick={onCustomCloseButtonClick}
        aria-label="Delete self"
      />
    </Stack>
  );
}
