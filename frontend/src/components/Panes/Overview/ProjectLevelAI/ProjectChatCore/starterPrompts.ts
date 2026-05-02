import { CHAT_STARTER_PROMPTS } from "components/Chat/chatComposerControls";
import { useMemo } from "react";
import { buildCreateProjectStarterPrompt } from "../projectChatStarterPrompts";

export function useProjectChatStarterPrompts(
  hasPythonInWorkspaceRoot: boolean,
) {
  const createProjectStarterPrompt = useMemo(
    () => buildCreateProjectStarterPrompt(hasPythonInWorkspaceRoot),
    [hasPythonInWorkspaceRoot],
  );
  return useMemo(
    () =>
      CHAT_STARTER_PROMPTS.filter(
        (starterPrompt) =>
          !starterPrompt.requiresPython || hasPythonInWorkspaceRoot,
      ).map((starterPrompt) => {
        if (starterPrompt.id !== "create-project") {
          return starterPrompt;
        }
        return {
          ...starterPrompt,
          prompt: createProjectStarterPrompt,
        };
      }),
    [createProjectStarterPrompt, hasPythonInWorkspaceRoot],
  );
}
