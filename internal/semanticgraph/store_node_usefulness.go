package semanticgraph

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
)

func (store *Store) semanticNodeUsefulness(ctx context.Context, workspaceID string, nodeID string, node SemanticNode, records semanticNodeDetailRecords) (SemanticNodeUsefulness, error) {
	retrievalUseCount, lastDeliveredAt := semanticNodeContextDeliveryStats(records.contextPacks, nodeID)
	lastPromotedAt, err := store.latestSemanticUserEventAt(ctx, workspaceID, nodeID, EventNodePromoted)
	if err != nil {
		return SemanticNodeUsefulness{}, err
	}
	usefulness := SemanticNodeUsefulness{
		WhyItExists:                  node.WhyItExists,
		FutureUse:                    node.FutureUse,
		SourceCoverage:               semanticNodeSourceCoverage(records.evidence),
		RetrievalUseCount:            retrievalUseCount,
		LastDeliveredInContextPackAt: lastDeliveredAt,
		LastUserPromotedAt:           lastPromotedAt,
		Diagnostics:                  []SemanticNodeUsefulnessDiagnostic{},
	}
	if node.WhyItExists == "" {
		usefulness.Diagnostics = append(usefulness.Diagnostics, SemanticNodeUsefulnessDiagnostic{
			Code:     "missing_why_it_exists",
			Severity: "warning",
			Message:  "Semantic node does not state why it exists beyond the current transcript.",
		})
	}
	if node.FutureUse == "" {
		usefulness.Diagnostics = append(usefulness.Diagnostics, SemanticNodeUsefulnessDiagnostic{
			Code:     "missing_future_use",
			Severity: "warning",
			Message:  "Semantic node does not state what future work it should influence.",
		})
	}
	if semanticNodeHasUnusedMemoryDiagnostic(node, records, usefulness) {
		usefulness.Diagnostics = append(usefulness.Diagnostics, SemanticNodeUsefulnessDiagnostic{
			Code:     "unused_semantic_memory",
			Severity: "warning",
			Message:  "Semantic node has not been opened, promoted, connected, or delivered in a context pack since creation.",
		})
	}
	return usefulness, nil
}

func semanticNodeContextDeliveryStats(contextPacks []SemanticContextPackRecord, nodeID string) (int, string) {
	count := 0
	lastDeliveredAt := ""
	for _, pack := range contextPacks {
		if !semanticContextPackIncludesNode(pack, nodeID) {
			continue
		}
		count++
		if pack.CreatedAt > lastDeliveredAt {
			lastDeliveredAt = pack.CreatedAt
		}
	}
	return count, lastDeliveredAt
}

func semanticNodeSourceCoverage(evidence []SemanticEvidenceAnchor) string {
	if len(evidence) == 0 {
		return "No evidence anchors are attached."
	}
	byKind := map[string]int{}
	for _, anchor := range evidence {
		if anchor.SourceKind == "" {
			continue
		}
		byKind[string(anchor.SourceKind)]++
	}
	if len(byKind) == 0 {
		return fmt.Sprintf("%d evidence anchor(s) attached.", len(evidence))
	}
	kinds := make([]string, 0, len(byKind))
	for kind := range byKind {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	parts := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		parts = append(parts, fmt.Sprintf("%s=%d", kind, byKind[kind]))
	}
	return fmt.Sprintf("%d evidence anchor(s): %s.", len(evidence), strings.Join(parts, ", "))
}

func semanticNodeHasUnusedMemoryDiagnostic(node SemanticNode, records semanticNodeDetailRecords, usefulness SemanticNodeUsefulness) bool {
	if node.Dismissed || usefulness.RetrievalUseCount > 0 || usefulness.LastUserPromotedAt != "" || usefulness.LastUserOpenedAt != "" {
		return false
	}
	return len(records.incoming) == 0 && len(records.outgoing) == 0
}

func (store *Store) latestSemanticUserEventAt(ctx context.Context, workspaceID string, targetEntityID string, eventType SemanticEventType) (string, error) {
	var observedAt string
	err := store.db.QueryRowContext(ctx, `
SELECT observed_at
FROM semantic_events
WHERE workspace_id = ? AND target_entity_id = ? AND event_type = ? AND actor_kind = ?
ORDER BY logical_clock DESC, event_id DESC
LIMIT 1
`, workspaceID, targetEntityID, eventType, ActorKindUser).Scan(&observedAt)
	if err == nil {
		return observedAt, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return "", store.persistenceError("read latest semantic user event", err)
}
