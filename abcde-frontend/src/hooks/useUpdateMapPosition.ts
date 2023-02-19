import { useReactFlow, useStoreApi } from "react-flow-renderer";

export function useUpdateMapPosition() {
  const store = useStoreApi();
  const { setViewport } = useReactFlow();

  return (widthDiff: number) => {
    const {
      transform: [x, y, zoom],
    } = store.getState();
    setViewport(
      { x: x + widthDiff, y, zoom },
      {
        duration: 100,
      }
    );
  };
}
