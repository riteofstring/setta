import { WorkspaceQuickStart } from "@setta/workspace";

export function ExperimentLensPlayground({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  return (
    <WorkspaceQuickStart
      title="Find the tired batteries"
      description="Explore a simulated aging study: 24 cells, 864 observations, and a trail of thermal images. Which conditions make a battery lose capacity fastest?"
      onNavigate={onNavigate}
      steps={[
        {
          title: "Follow a hunch",
          description:
            "Filter by chemistry, temperature, or charge rate. The charts and visible count update together. Clear a filter to bring the full study back.",
          actionLabel: "Explore test conditions",
          sectionId: "cohort",
          viewId: "overview",
        },
        {
          title: "Choose your evidence",
          description:
            "Click a row to inspect it. Tick two or more observation checkboxes, then press Compare at the top. Your basket stays selected when you change filters.",
          actionLabel: "Find observations to compare",
          sectionId: "observations",
          viewId: "compare",
        },
        {
          title: "Look closer",
          description:
            "Select an observation in the table, then explore its aging trajectory and thermal frames. Move through the timeline to see how it changes. Export selection saves the evidence you picked.",
          actionLabel: "Inspect a cell over time",
          sectionId: "aging-timeline",
          viewId: "inspect",
        },
      ]}
      tip="The study stays intact; only your exploration is saved. Overview, Compare, and Inspect offer different views of the same data. Use pnpm experiment-lens:playground --fresh for a new investigation."
    />
  );
}
