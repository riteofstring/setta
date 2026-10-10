export type Playground = {
  title: string;
  description: string;
  brief: string;
  briefName?: string;
  tip?: string;
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

const PLAYGROUNDS: Record<string, Playground> = {
  "training-system": {
    title: "A whole training system",
    description:
      "71 sections. 111 references. One Python program. Explore the configuration of a vision training system, from input data to three experiments sharing the same model.",
    briefName: "Read the blueprint",
    brief:
      "## Configuration you can explore\n\nThe starting system contains **59 callable sections, 9 lists, and 3 dictionaries**. Every reference is a Python expression; the generated program constructs ordinary Python objects.\n\n**Start:** change **width** in Shared defaults from 192 to 384. Patch embedding, attention, feed forward, and the classifier head all use that one setting. All three experiments share the resulting Model object.\n\n**Explore:** Data, Model, Train, and Evaluate frame each subsystem. System shows the complete configuration. The Outline lists every section.\n\n**Try:** replace `ts.AdamW` with `ts.SGD` in Optimizer and press Enter to discover its parameters. Rename Model from its section menu and inspect the updated references.\n\n**Check:** open Python and press Run in its header. The standard-library example validates the assembled configuration and prints each run's resolved settings. It does not train a model, read datasets, or create output files.",
    tip: "Sliders save automatically. Press Enter to commit a Python expression or constructor; Escape cancels its draft. Use the tabs to explore subsystems and the Outline to find a section. Python → Run checks the configuration. Download Python saves your current program; keep training_system.py beside it. --fresh preserves this copy and starts another.",
    control: dictionary("defaults"),
    objects: [],
    panels: [],
    steps: [
      {
        title: "Change one shared default",
        description:
          "Set width to 384 in Shared defaults. Four model components reference it, and three experiments share that model. Change batch_size too: the update budget and both schedule stages derive from it.",
        actionLabel: "Edit shared defaults",
        sectionId: dictionary("defaults"),
        viewId: "explore",
      },
      {
        title: "Follow the object composition",
        description:
          "Model receives Patch embedding, Encoder, and Classifier head. Encoder receives Attention and Feed forward. These are references to real objects, with shared widths and class counts.",
        actionLabel: "Explore the model",
        sectionId: "python-canvas:callable:model",
        viewId: "model",
      },
      {
        title: "Swap a constructor",
        description:
          "In Optimizer, replace ts.AdamW with ts.SGD and press Enter. Discover the new signature while keeping the shared parameter groups and learning rate. Try changing momentum, then switch back.",
        actionLabel: "Change the optimizer",
        sectionId: "python-canvas:callable:optimizer",
        viewId: "train",
      },
      {
        title: "Compose and reuse lists",
        description:
          "Training pipeline combines Augmentations + Preprocessing. Evaluation reuses Preprocessing alone. Reorder the augmentation children, or duplicate the list from its section menu and reference your copy in Training pipeline.",
        actionLabel: "Open the data recipe",
        sectionId: list("augmentations"),
        viewId: "data",
      },
      {
        title: "See the whole system",
        description:
          "System includes data loaders, model parts, parameter groups, schedules, losses, callbacks, metrics, runtimes, and three runs. Pan around or use the subsystem tabs to inspect each part at a readable size.",
        actionLabel: "Inspect the run variants",
        sectionId: "python-canvas:callable:smoke",
        viewId: "system",
      },
      {
        title: "Check the assembled program",
        description:
          "Press Run in the Generated Python header. The terminal shows resolved widths, batches, update counts, optimizer types, and shared model identity. Configuration mistakes get an explanation. Download Python exports the current composition.",
        actionLabel: "Open Python & Run",
        sectionId: "python-canvas:generated-python",
        viewId: "python",
      },
    ],
  },
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
      "## Three models enter the arena\n\nLogistic regression, a kernel machine, and a random forest compete on exactly the same unseen samples.\n\n**Challenge:** help logistic regression reach **95% unseen accuracy with 100 training points**. Try moons, rings, and a checkerboard. Watch the learning curves before spending more data.\n\nThe maps show predictions; white rings mark mistakes. Preprocessing learns only from training data. This is a synthetic experiment, not a real-world benchmark.",
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
        sectionId: "python-canvas:callable:ink",
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
