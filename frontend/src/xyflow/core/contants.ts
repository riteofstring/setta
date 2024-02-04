export const errorMessages = {
  error001: () =>
    "[React Flow]: Seems like you have not used zustand provider as an ancestor. Help: https://reactflow.dev/error#001",
  error003: (nodeType: string) =>
    `Node type "${nodeType}" not found. Using fallback type "default".`,
  error004: () =>
    "The React Flow parent container needs a width and a height to render the graph.",
  error009: (type: string) => `Marker type "${type}" doesn't exist.`,
  error012: (id: string) =>
    `Node with id "${id}" does not exist, it may have been removed. This can happen when a node is deleted before the "onNodeClick" handler is called.`,
};
