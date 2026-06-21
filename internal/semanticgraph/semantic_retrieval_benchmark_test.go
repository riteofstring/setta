package semanticgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func BenchmarkSemanticRetrievalLargeSyntheticEvidenceSet(b *testing.B) {
	store, err := NewStore(b.TempDir())
	if err != nil {
		b.Fatalf("new semantic graph store: %v", err)
	}
	b.Cleanup(func() {
		if err := store.Close(); err != nil {
			b.Fatalf("close semantic graph store: %v", err)
		}
	})
	service := newAssociationTestService(b, store, b.TempDir(), nil, nil)
	seedBenchmarkRetrievalGraph(b, store, 500)
	ctx := context.Background()
	request := semanticRetrievalRequest{
		WorkspaceID: testWorkspaceID,
		Query:       "phase7 retrieval target cache policy evidence",
		ExactPaths:  []string{"internal/semanticgraph/synthetic_target_250.go"},
		Limit:       defaultSemanticRetrievalLimit,
	}

	b.ResetTimer()
	for range b.N {
		retrieval, err := service.retrieveSemanticContext(ctx, request)
		if err != nil {
			b.Fatalf("retrieve semantic context: %v", err)
		}
		if len(retrieval.Results) == 0 {
			b.Fatal("retrieval returned no results")
		}
	}
}

func seedBenchmarkRetrievalGraph(b *testing.B, store *Store, count int) {
	b.Helper()
	ctx := context.Background()
	for index := 0; index < count; index++ {
		nodeID := fmt.Sprintf("node_synthetic_%03d", index)
		label := fmt.Sprintf("Synthetic semantic node %03d", index)
		summary := "General semantic evidence for retrieval ranking."
		if index == 250 {
			label = "Phase7 retrieval target cache policy"
			summary = "The target evidence should be found by FTS and exact path retrieval."
		}
		appendBenchmarkEvent(b, store, ctx, index*2+1, EventNodeCreated, nodeID, nodeCreatedPayload{
			NodeID:  nodeID,
			Kind:    NodeKindFinding,
			Label:   label,
			Summary: summary,
		})
		appendBenchmarkEvent(b, store, ctx, index*2+2, EventEvidenceAttached, nodeID, evidenceAttachedPayload{
			AnchorID:       fmt.Sprintf("evidence_synthetic_%03d", index),
			TargetEntityID: nodeID,
			SourceKind:     EvidenceSourceFileRange,
			Path:           fmt.Sprintf("internal/semanticgraph/synthetic_target_%03d.go", index),
			Text:           summary,
			Summary:        "Synthetic retrieval evidence",
		})
	}
}

func appendBenchmarkEvent(b *testing.B, store *Store, ctx context.Context, sequence int, eventType SemanticEventType, targetEntityID string, payload any) {
	b.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		b.Fatalf("marshal benchmark payload: %v", err)
	}
	_, err = store.AppendEvent(ctx, SemanticEvent{
		EventID:        fmt.Sprintf("event_benchmark_%04d", sequence),
		WorkspaceID:    testWorkspaceID,
		ActorKind:      ActorKindUser,
		ActorID:        testActorID,
		EventType:      eventType,
		TargetEntityID: targetEntityID,
		ObservedAt:     testTimestamp(sequence),
		Payload:        data,
		ModelInfo:      map[string]string{},
	})
	if err != nil {
		b.Fatalf("append benchmark event %d: %v", sequence, err)
	}
}
