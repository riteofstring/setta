import { useEffect, useState } from "react";

export function useViewportSize() {
  const [size, setSize] = useState(() => ({
    height: browserViewportHeight(),
    width: browserViewportWidth(),
  }));

  useEffect(() => {
    const handleResize = () =>
      setSize({
        height: browserViewportHeight(),
        width: browserViewportWidth(),
      });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return size;
}

function browserViewportHeight(): number {
  return typeof window.innerHeight === "number" ? window.innerHeight : 820;
}

function browserViewportWidth(): number {
  return typeof window.innerWidth === "number" ? window.innerWidth : 1280;
}
