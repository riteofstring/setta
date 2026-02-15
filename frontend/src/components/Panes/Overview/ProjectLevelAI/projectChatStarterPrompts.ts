export const DESIGN_FIRST_FIGMA_STARTER_PROMPT = [
  "I want to run a design-first workflow before implementation.",
  "",
  "Please do this in order:",
  "1. Ask me 8-12 concise questions to lock visual direction and product intent before generating anything.",
  "2. Explicitly ask whether I want to attach a visual style reference (style tile, style anchor image, moodboard, or screenshot).",
  "3. Ask enough detail to design in Figma confidently: audience, tone, layout density, spacing rhythm, typography, color direction, interaction style, and responsive behavior.",
  "4. After I answer, summarize the design brief and list any open risks/assumptions.",
  "5. Propose a concrete Figma execution plan and wait for my confirmation.",
  "6. Once approved, run the MCP/Figma flow to create or pull the design, then map it back into an implementation-ready frontend output.",
].join("\n");

export function buildDesignFirstFigmaStarterPrompt(): string {
  return DESIGN_FIRST_FIGMA_STARTER_PROMPT;
}
