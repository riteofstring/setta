import React from "react";
import { useCurrInfoView } from "state/hooks/infoView";

export const InfoViewBig = React.forwardRef(() => {
  const currInfoView = useCurrInfoView();
  return (
    <aside className="self-start overflow-clip text-setta-500 dark:text-setta-200">
      {currInfoView}
    </aside>
  );
});
