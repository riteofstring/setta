import { useEffect, useState } from "react";
import { ensureRuntimeConfig } from "utils/runtimeConfig";

export function useRuntimeConfig(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void ensureRuntimeConfig().then(() => {
      if (isMounted) {
        setReady(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return ready;
}
