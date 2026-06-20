export const initialNodes = [
  {
    color: 0x14b8a6,
    height: 82,
    id: "source",
    label: "Source",
    width: 168,
    x: -360,
    y: -140,
  },
  {
    color: 0x8b5cf6,
    height: 90,
    id: "reason",
    label: "Reason",
    width: 184,
    x: -70,
    y: -40,
  },
  {
    color: 0xf59e0b,
    height: 82,
    id: "output",
    label: "Output",
    width: 168,
    x: 260,
    y: -150,
  },
  {
    color: 0x38bdf8,
    height: 76,
    id: "review",
    label: "Review",
    width: 160,
    x: 110,
    y: 150,
  },
];

export const initialEdges = [
  {
    id: "source-reason",
    sourceNodeId: "source",
    sourcePortId: "output",
    targetNodeId: "reason",
    targetPortId: "input",
  },
  {
    id: "reason-output",
    sourceNodeId: "reason",
    sourcePortId: "output",
    targetNodeId: "output",
    targetPortId: "input",
  },
  {
    id: "reason-review",
    sourceNodeId: "reason",
    sourcePortId: "output",
    targetNodeId: "review",
    targetPortId: "input",
  },
];
