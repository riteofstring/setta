import React, { useEffect } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";
import SectionContainer from "./SectionContainer/SectionContainer";
import { Heading, Stack } from "@chakra-ui/react";
import { SectionInfo } from "../../../classes/jsonParser";
import { createNewId } from "../../../utils/sectionIds";
import { useIdsOverview } from "../../../utils/useIdsOverview";

function SingleSectionsPane({ minIdx, maxIdx, groupId, available }) {
  const uiSpecs = useStoreState((x) => x.master.uiSpecs);
  const [idsOverview, setIdsOverview] = useIdsOverview(groupId);
  const setIdNames = useStoreActions((x) => x.sections.setIdNames);
  const setSectionInfoAction = useStoreActions(
    (x) => x.sections.setSectionInfo
  );

  useEffect(() => {
    getSectionIds();
  }, []);

  function setSectionInfo(sectionId, idx) {
    const variableName = [...uiSpecs.keys()][idx];
    setSectionInfoAction({
      sectionId,
      sectionInfo: new SectionInfo(
        variableName,
        uiSpecs.get(variableName),
        available
      ),
    });
  }

  function getSectionIds() {
    let newIds = [];
    for (let idx = minIdx; idx < Math.min(maxIdx, uiSpecs.size); idx++) {
      const sectionId = createNewId();
      setSectionInfo(sectionId, idx);
      newIds.push(sectionId);
    }
    setIdsOverview(newIds);
  }

  return (
    <>
      <Stack>
        <Heading size="md" color="gray.300">
          Group {groupId}
        </Heading>
        {idsOverview.map((e, idx) => (
          <SectionContainer
            sectionId={e}
            parentId={null}
            // nextId={idx + 1}
            available={available}
            key={`${e}-${idx}`}
            depth={0}
            setIdNames={setIdNames}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SingleSectionsPane);
