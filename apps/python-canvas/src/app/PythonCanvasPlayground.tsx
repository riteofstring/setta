import { WorkspaceQuickStart } from "@setta/workspace";

export function PythonCanvasPlayground({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  return (
    <WorkspaceQuickStart
      title="Rocket flight lab"
      description="One launch. Two worlds. Explore how the same rocket flies on Earth and the Moon while Python Canvas turns your controls into real Python."
      onNavigate={onNavigate}
      steps={[
        {
          title: "Launch your first rocket",
          description:
            "Find Generated Python, then press Run in its header. The terminal below the code prints both flight paths, their range, and time in the air.",
          actionLabel: "Show Run & results",
          sectionId: "python-canvas:generated-python",
        },
        {
          title: "Beat your distance",
          description:
            "Move the speed (m/s) and angle (degrees) sliders in Launch settings, then Run again. Can you find the angle that travels farthest? Try 30°, 45°, and 60° at the same speed.",
          actionLabel: "Show launch settings",
          sectionId: "python-canvas:parameter-dictionary:launch-settings",
        },
        {
          title: "Invent another world",
          description:
            "Flights is a List of Objects containing two Python callables. In Moon, set world to 'Mars' and gravity to 3.71. Press Enter to commit a code value, then Run again.",
          actionLabel: "Edit the Moon flight",
          sectionId: "python-canvas:callable:moon",
        },
      ]}
      tip="Your settings save as you edit. Running is always explicit. This toy model ignores air resistance; experiment freely, and use the terminal command with --fresh for a new copy that keeps your previous work."
    />
  );
}
