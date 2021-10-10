import { Stack } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import React, { useEffect } from "react";

import { SectionInfo } from "../../../classes/immutableInfo";
import { useSetSectionPosition } from "../../../hooks/useSetSectionPosition";
import { PANEID } from "../../../utils/constants";
import SingleSectionsPane from "./SingleSectionsPane";

function SectionsPane() {
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const pageMinMaxList = useStoreState((x) => x.master.pageMinMaxList);
  const spaceBetweenPages = useStoreState((x) => x.master.spaceBetweenPages);
  const refForPosition = useSetSectionPosition(PANEID);

  useEffect(() => {
    const newInfos = pageMinMaxList.map(
      (e, idx) => new SectionInfo({ id: idx })
    );
    const newIds = newInfos.map((x) => x.id);
    const newObjs = _.zipObject(newIds, newInfos);
    setSectionInfo((x) => ({ ...x, ...newObjs }));
  }, []);

  console.log("pageMinMaxList", pageMinMaxList);

  return (
    <>
      <Stack
        direction="row"
        spacing={`${spaceBetweenPages}px`}
        ref={refForPosition}
      >
        {pageMinMaxList.map((e, idx) => (
          <SingleSectionsPane
            minIdx={e.minIdx}
            maxIdx={e.maxIdx}
            groupId={idx}
            key={`SingleSectionsPane-${idx}`}
          />
        ))}
      </Stack>
    </>
  );
}

export default React.memo(SectionsPane);
