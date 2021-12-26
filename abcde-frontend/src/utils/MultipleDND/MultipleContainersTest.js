import React, { useState } from "react";

import { MultipleContainers } from "./MultipleContainers";
import { createRange } from "./createRange";

export function BasicSetup() {
  const [items, setItems] = useState({
    A: createRange(3, (index) => `A${index + 1}`),
    B: createRange(4, (index) => `B${index + 1}`),
    C: createRange(2, (index) => `C${index + 1}`),
    D: createRange(5, (index) => `D${index + 1}`),
  });

  const [containers, setContainers] = useState(Object.keys(items));

  return (
    <MultipleContainers
      items={items}
      setItems={setItems}
      containers={containers}
      setContainers={setContainers}
    />
  );
}
