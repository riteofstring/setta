import React, { useState } from "react";
import { useProjectConfig } from "state/definitions";

export const Interactive = React.forwardRef(() => {
  const path = useProjectConfig((x) => x.interactivePath);
  const [localVal, setLocalVal] = useState(path);

  function onChange(e) {
    setLocalVal(e.target.value);
  }

  function onBlur() {
    useProjectConfig.setState({ interactivePath: localVal });
  }

  return (
    <input
      type="text"
      value={localVal}
      onChange={onChange}
      onBlur={onBlur}
      className="rounded bg-setta-400 px-4 py-2 text-white dark:bg-setta-800"
    />
  );
});
