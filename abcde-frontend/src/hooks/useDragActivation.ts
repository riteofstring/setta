import { useEffect, useState } from "react";

// not using reactflow's useKeyPress because: https://github.com/wbkd/react-flow/issues/2785
export function useDragActivation() {
  const [isSorting, setIsSorting] = useState(false);
  const [isMovingFree, setIsMovingFree] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      setIsSorting(e.key === "Control");
      setIsMovingFree(e.key === "Alt");
    };
    const handleKeyUp = () => {
      setIsSorting(false);
      setIsMovingFree(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  return { isSorting, isMovingFree };
}
