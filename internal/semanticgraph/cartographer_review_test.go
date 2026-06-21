package semanticgraph

import (
	"context"
	"testing"
)

func TestCartographerPatchReviewAcceptsPendingPatchAfterRevalidation(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	patch := cartographerRecordFindingPatch("cartographer_patch_review_accept", "node_review_accept", "Review accepted finding", 0.2)
	result, err := service.ApplyCartographerPatchEnvelope(ctx, cartographerPatchApplicationInput(t, "cartographer_run_review_accept", []CartographerPatch{patch}))
	if err != nil {
		t.Fatalf("apply pending cartographer patch: %v", err)
	}
	if result.Run.Status != CartographerRunPendingReview || len(result.Patches) != 1 || result.Patches[0].Status != CartographerPatchPendingReview {
		t.Fatalf("pending result = %+v, want pending-review run with pending patch", result)
	}
	before := semanticEventCount(t, store)

	review, err := service.AcceptCartographerPatch(ctx, testWorkspaceID, patch.ID)
	if err != nil {
		t.Fatalf("accept cartographer patch: %v", err)
	}
	if review.Run.Status != CartographerRunApplied || review.Patch.Status != CartographerPatchApplied || len(review.Events) != 2 {
		t.Fatalf("review result = %+v, want applied patch with two semantic events", review)
	}
	if after := semanticEventCount(t, store); after != before+2 {
		t.Fatalf("semantic event count after accept = %d, want %d", after, before+2)
	}
	detail, ok, err := service.ReadNodeDetail(ctx, testWorkspaceID, "node_review_accept")
	if err != nil {
		t.Fatalf("read accepted node detail: %v", err)
	}
	if !ok || len(detail.CartographerPatches) != 1 || detail.CartographerPatches[0].Status != CartographerPatchApplied {
		t.Fatalf("accepted node detail = %+v, want applied cartographer patch history", detail)
	}
	if _, err := service.AcceptCartographerPatch(ctx, testWorkspaceID, patch.ID); err == nil {
		t.Fatal("accepted already-applied patch, want status error")
	}
}

func TestCartographerPatchReviewRejectsPendingPatchWithoutGraphMutation(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	patch := cartographerRecordFindingPatch("cartographer_patch_review_reject", "node_review_reject", "Review rejected finding", 0.2)
	result, err := service.ApplyCartographerPatchEnvelope(ctx, cartographerPatchApplicationInput(t, "cartographer_run_review_reject", []CartographerPatch{patch}))
	if err != nil {
		t.Fatalf("apply pending cartographer patch: %v", err)
	}
	if result.Patches[0].Status != CartographerPatchPendingReview {
		t.Fatalf("patch status = %s, want pending_review", result.Patches[0].Status)
	}
	before := semanticEventCount(t, store)

	review, err := service.RejectCartographerPatch(ctx, testWorkspaceID, patch.ID)
	if err != nil {
		t.Fatalf("reject cartographer patch: %v", err)
	}
	if review.Patch.Status != CartographerPatchRejected || review.Patch.ApplicationResult.Applied {
		t.Fatalf("review result = %+v, want rejected unapplied patch", review)
	}
	if len(review.Patch.ApplicationResult.Diagnostics) != 1 || review.Patch.ApplicationResult.Diagnostics[0].Code != "review_rejected" {
		t.Fatalf("review diagnostics = %+v, want review_rejected", review.Patch.ApplicationResult.Diagnostics)
	}
	if after := semanticEventCount(t, store); after != before {
		t.Fatalf("semantic event count after reject = %d, want %d", after, before)
	}
	if _, ok, err := service.ReadNodeDetail(ctx, testWorkspaceID, "node_review_reject"); err != nil || ok {
		t.Fatalf("rejected node exists=%v err=%v, want no graph mutation", ok, err)
	}
}

func TestCartographerPatchReviewRevalidatesStoredPatchAgainstCurrentGraph(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	patch := cartographerRecordFindingPatch("cartographer_patch_review_stale", "node_review_stale", "Review stale finding", 0.2)
	if _, err := service.ApplyCartographerPatchEnvelope(ctx, cartographerPatchApplicationInput(t, "cartographer_run_review_stale", []CartographerPatch{patch})); err != nil {
		t.Fatalf("apply pending cartographer patch: %v", err)
	}
	appendTestEvent(t, store, EventNodeCreated, "node_review_stale", nodeCreatedPayload{
		NodeID:  "node_review_stale",
		Kind:    NodeKindFinding,
		Label:   "User-created stale target",
		Summary: "Current graph changed before review.",
	})
	before := semanticEventCount(t, store)

	review, err := service.AcceptCartographerPatch(ctx, testWorkspaceID, patch.ID)
	if err != nil {
		t.Fatalf("accept stale cartographer patch: %v", err)
	}
	if review.Patch.Status != CartographerPatchRejected || review.Patch.ValidationResult.Accepted {
		t.Fatalf("stale review result = %+v, want rejected validation result", review)
	}
	if len(review.Patch.ValidationResult.Diagnostics) != 1 || review.Patch.ValidationResult.Diagnostics[0].Code != "unknown_ref" {
		t.Fatalf("stale diagnostics = %+v, want unknown_ref", review.Patch.ValidationResult.Diagnostics)
	}
	if after := semanticEventCount(t, store); after != before {
		t.Fatalf("semantic event count after stale accept = %d, want %d", after, before)
	}
}
