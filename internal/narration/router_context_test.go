package narration

import (
	"strings"
	"testing"

	"setta/internal/conversation"
)

func TestConversationRouteArtifactsDescribeCompiledDocuments(t *testing.T) {
	source := `root = Document([Text("Ready"), Metric("Completed", "2")])`
	artifacts, err := conversationRouteArtifacts([]conversation.Artifact{{
		ID:    "artifact-1",
		Title: "Build report",
		Document: conversation.ArtifactDocument{
			Language:  conversation.ArtifactDocumentLanguageOpenUI,
			CatalogID: conversation.ArtifactCatalogSettaV1,
			Source:    source,
		},
	}})
	if err != nil {
		t.Fatalf("describe route artifacts: %v", err)
	}
	if len(artifacts) != 1 ||
		!strings.Contains(artifacts[0].Summary, "using Document, Metric, Text") {
		t.Fatalf("route artifacts = %#v", artifacts)
	}
}

func TestConversationRouteArtifactsRejectUnreadableDocuments(t *testing.T) {
	artifacts, err := conversationRouteArtifacts([]conversation.Artifact{{
		ID:    "artifact-corrupt",
		Title: "Corrupt report",
		Document: conversation.ArtifactDocument{
			Language:  conversation.ArtifactDocumentLanguageOpenUI,
			CatalogID: conversation.ArtifactCatalogSettaV1,
			Source:    `report = Text("missing root")`,
		},
	}})
	if err == nil {
		t.Fatalf("route artifacts = %#v, want a compiler error", artifacts)
	}
	if artifacts != nil {
		t.Fatalf("route artifacts = %#v, want no partial context", artifacts)
	}
	if !strings.Contains(err.Error(), "artifact-corrupt") {
		t.Fatalf("route artifact error = %v, want artifact identity", err)
	}
}
