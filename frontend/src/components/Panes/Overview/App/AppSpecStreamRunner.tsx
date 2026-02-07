import type { Spec } from "@json-render/core";
import { useUIStream } from "@json-render/react";
import { useEffect } from "react";

type AppSpecStreamRunnerProps = {
  api: string;
  prompt: string;
  context: Record<string, unknown>;
  onSpec: (spec: Spec | null) => void;
  onComplete: (spec: Spec) => void;
  onError: (error: Error) => void;
};

export function AppSpecStreamRunner({
  api,
  prompt,
  context,
  onSpec,
  onComplete,
  onError,
}: AppSpecStreamRunnerProps) {
  const { spec, send } = useUIStream({
    api,
    onComplete,
    onError,
  });

  useEffect(() => {
    onSpec(spec);
  }, [onSpec, spec]);

  useEffect(() => {
    // Runner is mounted per streaming request; send exactly once.
    void send(prompt, context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
