import { memo } from "react";

import Handle from "../../components/Handle";
import type { NodeProps } from "../../types";
import { Position } from "../../types";

const InputNode = ({
  data,
  isConnectable,
  sourcePosition = Position.Bottom,
}: NodeProps) => (
  <>
    {data?.label}
    <Handle
      type="source"
      position={sourcePosition}
      isConnectable={isConnectable}
    />
  </>
);

InputNode.displayName = "InputNode";

export default memo(InputNode);
