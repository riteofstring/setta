import { WorkspaceQuickStart } from "@setta/workspace";

export function RealtimePlayground({ onNavigate }: { onNavigate: () => void }) {
  return (
    <WorkspaceQuickStart
      title="Make a signal bloom"
      description="Turn a doodle into a print. Your sketch feeds two different ink treatments, then combines them into one poster."
      onNavigate={onNavigate}
      steps={[
        {
          title: "Make your mark",
          description:
            "Choose Pen above the drawing and add a stroke. Or use Select to move a petal. Each change updates the prints automatically; Undo lets you try again.",
          actionLabel: "Take me to the drawing",
          sectionId: "drawing",
        },
        {
          title: "See your poster",
          description:
            "The final poster combines the Aurora and Risograph plates. Give them a moment to finish after drawing. Try a spiral, a face, or just your initials.",
          actionLabel: "Show my poster",
          sectionId: "final-result",
        },
        {
          title: "Remix the recipe",
          description:
            "Open the Python source, change a color in _aurora_svg, then press Apply. It saves your code and reloads the recipe. If an edit fails, correct it and Apply again.",
          actionLabel: "Show the Python recipe",
          sectionId: "callback",
        },
      ]}
      tip="Drawings and applied code are saved in your working copy. Start another with pnpm realtime:playground --fresh; your previous experiments stay where they are."
    />
  );
}
