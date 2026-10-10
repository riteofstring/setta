import { WorkspaceQuickStart } from "@setta/workspace";
import { getPlayground } from "./playgroundCatalog";

export function PythonCanvasPlayground({
  onNavigate,
  projectId,
}: {
  onNavigate: () => void;
  projectId: string;
}) {
  const playground = getPlayground(projectId);
  if (!playground) return null;
  return (
    <>
      <WorkspaceQuickStart
        title={playground.title}
        description={playground.description}
        onNavigate={onNavigate}
        steps={playground.steps}
        tip={
          playground.tip ??
          "Your inputs save automatically. Running is explicit. Use Explore, Compare/Gallery, Build, and Python in Saved Views to move around. Download Python saves the current recipe; keep it beside the helper in your working folder. --fresh makes a new copy without removing your work."
        }
      />
    </>
  );
}
