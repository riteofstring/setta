import { WorkspaceQuickStart } from "@riteofstring/setta";
import { useReview } from "./reviewContext";
import { requestSectionId } from "./reviewProjection";

export function ReviewPlayground({ onNavigate }: { onNavigate: () => void }) {
  const review = useReview();
  const steps = [
    {
      id: "launch-poster",
      title: "Be the art director",
      description:
        "Compare three posters. Pick a favorite, or draw on a candidate and request a revision. Selecting is a preview; Confirm records your choice.",
      actionLabel: "Compare the posters",
    },
    {
      id: "checkout-completion",
      title: "Play detective",
      description:
        "Is the checkout work really done? Select a claim to follow its evidence. Expand assessments to see who agrees, then resolve, qualify, or request evidence with your own note.",
      actionLabel: "Investigate the claims",
    },
    {
      id: "schema-rollout",
      title: "Make the tradeoff",
      description:
        "Compare rollout options in the matrix. Select a factor to see its supporting evidence, then choose an option or ask for changes. There is no single required answer.",
      actionLabel: "Explore the rollout options",
    },
  ].map(({ id, ...step }) => ({
    ...step,
    sectionId: requestSectionId(id),
    viewId:
      review.snapshot.requests.find((request) => request.request.id === id)
        ?.response?.status === "final"
        ? "old"
        : "current",
  }));
  return (
    <WorkspaceQuickStart
      title="You make the call"
      description="Three fictional reviews. Inspect the evidence, make a decision, and see how a clear response helps the next person. Nothing here sends feedback to a real team."
      onNavigate={onNavigate}
      steps={steps}
      tip="Finished requests move from Current to Old; these buttons can find them there too. Unsent feedback survives refresh in this tab. Start new reviews with pnpm review:playground --fresh."
    />
  );
}
