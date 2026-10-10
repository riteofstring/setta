export type Playground = {
  title: string;
  description: string;
  brief: string;
  control: string;
  objects: string[];
  panels: Array<{
    id: string;
    name: string;
    kind: "image" | "table" | "chart" | "markdown";
  }>;
  steps: Array<{
    title: string;
    description: string;
    actionLabel: string;
    sectionId: string;
    viewId: string;
  }>;
};

const display = (id: string) => `python-canvas:display:${id}`;
const dictionary = (id: string) => `python-canvas:parameter-dictionary:${id}`;
const list = (id: string) => `python-canvas:list:${id}`;

export const PLAYGROUNDS: Record<string, Playground> = {
  "rover-mission": {
    title: "Rover mission",
    description:
      "Three rovers. One hostile planet. Build a fleet that can bring the samples home before the batteries die.",
    brief:
      "## Bring the samples home\n\nYour rovers must visit the research sites and return to base. **A flag marks home; an × marks a stranded rover.**\n\nStart with a calm day. Then turn up the dust storm and find which design survives. Bigger batteries add weight; solar panels work poorly in dust.\n\n**Challenge:** bring every rover home at storm **0.6**, then compare science points per 100 credits.\n\nThis is a repeatable toy engineering model, not a flight simulator.",
    control: dictionary("mission"),
    objects: [
      list("fleet"),
      "python-canvas:callable:world",
      "python-canvas:callable:expedition",
    ],
    panels: [
      { id: "terrain", name: "Mission map", kind: "image" },
      { id: "energy", name: "Battery telemetry", kind: "chart" },
      { id: "scoreboard", name: "Fleet comparison", kind: "table" },
      { id: "report", name: "Mission debrief", kind: "markdown" },
    ],
    steps: [
      {
        title: "Launch your fleet",
        description:
          "Press Run experiment. The map shows the terrain, sample sites, and the route each rover actually completed.",
        actionLabel: "Explore the mission",
        sectionId: display("terrain"),
        viewId: "explore",
      },
      {
        title: "Send in a dust storm",
        description:
          "Raise storm in Mission to 0.6 and run again. Watch solar power fall and compare where the rovers run out of energy.",
        actionLabel: "Change the conditions",
        sectionId: dictionary("mission"),
        viewId: "explore",
      },
      {
        title: "Build a survivor",
        description:
          "In Fleet, change a rover's battery, solar panels, wheel size, or route caution. Everything here constructs real Python objects. Sliders commit automatically; press Enter for code values.",
        actionLabel: "Tune the rovers",
        sectionId: list("fleet"),
        viewId: "build",
      },
      {
        title: "Read the tradeoffs",
        description:
          "Compare battery curves and sort the fleet table. Returning with more samples matters; so does the cost of the vehicle. Keep the seed fixed for a fair comparison.",
        actionLabel: "Compare the fleet",
        sectionId: display("scoreboard"),
        viewId: "compare",
      },
    ],
  },
  "model-arena": {
    title: "Model arena",
    description:
      "Give three classifiers the same data and see which one understands the pattern. Change the world, the features, and the learning budget.",
    brief:
      "## Three models enter the arena\n\nLogistic regression, a kernel machine, and a random forest compete on exactly the same unseen samples.\n\n**Challenge:** reach **95% unseen accuracy with 100 training points**. Try moons, rings, and a checkerboard. Watch the learning curves before spending more data.\n\nThe maps show predictions; white rings mark mistakes. Preprocessing learns only from training data. This is a synthetic experiment, not a real-world benchmark.",
    control: dictionary("arena"),
    objects: [
      list("features"),
      list("models"),
      "python-canvas:callable:experiment",
    ],
    panels: [
      { id: "boundaries", name: "Decision maps", kind: "image" },
      { id: "learning", name: "Learning curves", kind: "chart" },
      { id: "leaderboard", name: "Model leaderboard", kind: "table" },
      { id: "report", name: "What changed?", kind: "markdown" },
    ],
    steps: [
      {
        title: "Start a tournament",
        description:
          "Run experiment trains all three models. Compare their boundaries and mistakes on the same unseen points.",
        actionLabel: "Show the decision maps",
        sectionId: display("boundaries"),
        viewId: "explore",
      },
      {
        title: "Change the world",
        description:
          "Choose rings or checkerboard in Arena. Raise noise or reduce training_points. A model that wins one world may lose another.",
        actionLabel: "Design the challenge",
        sectionId: dictionary("arena"),
        viewId: "explore",
      },
      {
        title: "Change how models think",
        description:
          "In Features, raise degree to add curved features. In Models, tune C, gamma, or tree depth. You can replace a library class and press Enter to discover its parameters.",
        actionLabel: "Open the model recipes",
        sectionId: list("models"),
        viewId: "build",
      },
      {
        title: "Spend your data wisely",
        description:
          "The learning curves retrain on increasing budgets. Toggle series in the legend, hover a point, and sort the leaderboard to compare accuracy and overfitting.",
        actionLabel: "Compare the evidence",
        sectionId: display("learning"),
        viewId: "compare",
      },
    ],
  },
  "art-studio": {
    title: "Generative art studio",
    description:
      "Compose flowing ink, orbital rings, and a field of stars. Mix colors and layers, explore variations, and save a vector artwork.",
    brief:
      "## Make something you want to keep\n\nYour artwork is a list of Python layer objects. Each layer contributes shapes, color, and motion. Change the palette, bend the flow, or switch a layer off.\n\n**Try:** neon on midnight, a quiet two-color print, or a dense cosmic storm. The same seed always gives the same composition.\n\nRun updates the artwork and four seeded variations. **Save image** downloads an SVG you can open independently or edit in a vector editor.",
    control: dictionary("canvas"),
    objects: [list("layers"), "python-canvas:callable:artwork"],
    panels: [
      { id: "artwork", name: "Your artwork", kind: "image" },
      { id: "variations", name: "Seed variations", kind: "image" },
      { id: "palette", name: "Palette & layers", kind: "table" },
      { id: "notes", name: "Studio notes", kind: "markdown" },
    ],
    steps: [
      {
        title: "Print your first artwork",
        description:
          "Run experiment renders your composition on the canvas. Every mark is generated by the Python recipe.",
        actionLabel: "Show the artwork",
        sectionId: display("artwork"),
        viewId: "explore",
      },
      {
        title: "Find your palette",
        description:
          "Change the background in Canvas. Open Build to pick colors for the ink, rings, and stars, then Run again.",
        actionLabel: "Mix colors and layers",
        sectionId: list("layers"),
        viewId: "build",
      },
      {
        title: "Bend the composition",
        description:
          "Adjust the ink's bend and strands, the ring count, or the star sizes. Switch layers off to see what each contributes.",
        actionLabel: "Shape the layers",
        sectionId: list("layers"),
        viewId: "build",
      },
      {
        title: "Find a variation worth saving",
        description:
          "Compare four nearby seeds in the gallery. Enter a favorite seed in Canvas, run again, then use Save image below the artwork to keep its SVG.",
        actionLabel: "Visit the gallery",
        sectionId: display("variations"),
        viewId: "compare",
      },
    ],
  },
};

export function getPlayground(
  projectId: string | undefined,
): Playground | undefined {
  return projectId !== undefined && Object.hasOwn(PLAYGROUNDS, projectId)
    ? PLAYGROUNDS[projectId]
    : undefined;
}
