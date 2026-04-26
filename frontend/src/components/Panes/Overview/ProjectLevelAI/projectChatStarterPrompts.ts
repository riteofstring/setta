import { CREATE_PROJECT_STARTER_PROMPT } from "components/Chat/chatComposerControls";

const CREATE_PROJECT_NO_CODEBASE_STARTER_PROMPT = [
  "No existing codebase was detected in this workspace.",
  "Before generating sections or code, ask me 8-12 concise clarifying questions about product goals, target users, preferred stack, constraints, deployment target, and scope boundaries.",
  "After I answer, summarize the agreed direction and open assumptions, then propose the initial Setta project structure and implementation plan.",
  "Before claiming completion, run error checks and report pass/fail explicitly.",
].join(" ");

export function buildCreateProjectStarterPrompt(hasCodebase: boolean): string {
  if (hasCodebase) {
    return CREATE_PROJECT_STARTER_PROMPT;
  }
  return CREATE_PROJECT_NO_CODEBASE_STARTER_PROMPT;
}
