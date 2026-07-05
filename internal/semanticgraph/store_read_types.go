package semanticgraph

type semanticNodeDetailRecords struct {
	incoming     []SemanticEdge
	outgoing     []SemanticEdge
	evidence     []SemanticEvidenceAnchor
	activity     []SemanticActivityInterval
	steering     []SemanticSteeringDirective
	contextPacks []SemanticContextPackRecord
}

type cartographerNodeDetailRecords struct {
	patches []CartographerPatchRecord
	runs    []CartographerRun
	windows []CartographerWindow
	cursors []CartographerCursor
}
