import React from "react";

function _UserSpecifiedObjectArea({ sectionId }) {
  return "UserSpecifiedObjectArea";
  // return (
  //   <>
  //     <div className="px-6">
  //       <SectionSearch sectionId={sectionId} initialSelection={selectedItem} />
  //     </div>

  //     <KwargsControls sectionId={sectionId} objInfoId={selectedItem} />
  //   </>
  // );
}

export const UserSpecifiedObjectArea = React.memo(_UserSpecifiedObjectArea);

// function FreeFormObjectName({}){

// }
