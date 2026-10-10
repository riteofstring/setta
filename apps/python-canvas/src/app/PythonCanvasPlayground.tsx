import { WorkspaceQuickStart } from "@setta/workspace";

export function PythonCanvasPlayground({
  onNavigate,
}: {
  onNavigate: () => void;
}) {
  return (
    <WorkspaceQuickStart
      title="Model workshop"
      description="Teach a classifier to separate two interlocking moons. Your ingredients are real scikit-learn objects; Python Canvas assembles them into a runnable recipe."
      onNavigate={onNavigate}
      steps={[
        {
          title: "See what your model learns",
          description:
            "Press Run in Generated Python. The colored map shows the model's predictions; A and B are unseen samples, and × marks a mistake. The first recipe can only draw a straight boundary.",
          actionLabel: "Show Run & results",
          sectionId: "python-canvas:generated-python",
          viewId: "build",
        },
        {
          title: "Bend the boundary",
          description:
            "In Features, move degree from 1 to 3, then Run again. This adds curved features to the same classifier. Can you beat 90% on unseen samples? More complexity does not always help.",
          actionLabel: "Change the features",
          sectionId: "python-canvas:callable:features",
          viewId: "build",
        },
        {
          title: "Make it harder",
          description:
            "Raise noise in Data to blur the moons. Keep random_state unchanged for repeatable data. Compare training and unseen scores: a model that memorizes its training points may still miss new ones.",
          actionLabel: "Explore the data",
          sectionId: "python-canvas:callable:data",
          viewId: "data",
        },
        {
          title: "Change an ingredient",
          description:
            "Steps is a Python list, passed into make_pipeline. In Classifier, replace LogisticRegression with SVC and press Enter, then Run. You are swapping a real library object, not choosing a preset.",
          actionLabel: "Swap the classifier",
          sectionId: "python-canvas:callable:classifier",
          viewId: "build",
        },
      ]}
      tip="Edits save automatically; training happens only on Run. Download Python saves your current program: place it beside model_workshop.py in the working folder to run it without Setta. recipe.py is a short handwritten starting point for comparison. Use --fresh for a new copy that keeps your previous work."
    />
  );
}
