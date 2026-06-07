package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"setta/internal/appstate"
	"setta/internal/semanticgraph"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

const (
	seedActorID               = "semantic_graph_dev_seed"
	seedSessionID             = "semantic_graph_dev_seed_session"
	seedConstraintNodeID      = "semantic_seed_constraint"
	seedFindingNodeID         = "semantic_seed_finding"
	seedRiskNodeID            = "semantic_seed_risk"
	seedQuestionNodeID        = "semantic_seed_question"
	seedBaseObservedTimestamp = "2026-06-10T12:00:00Z"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

func run(args []string, stdout io.Writer, stderr io.Writer, getenv func(string) string) int {
	config, err := configFromArgs(args, stderr, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	result, err := seedSemanticGraph(context.Background(), config)
	if err != nil {
		fmt.Fprintf(stderr, "seed semantic graph: %v\n", err)
		return 1
	}
	if result.AlreadySeeded {
		fmt.Fprintf(stdout, "Semantic graph dev seed already exists in workspace %q.\n", result.Workspace.DisplayName)
	} else {
		fmt.Fprintf(stdout, "Seeded semantic graph dev data in workspace %q.\n", result.Workspace.DisplayName)
	}
	fmt.Fprintf(stdout, "workspaceId=%s rootPath=%s appDataDir=%s\n", result.Workspace.ID, result.Workspace.RootPath, config.appDataDir)
	return 0
}

type config struct {
	appDataDir    string
	workspacePath string
}

type seedResult struct {
	AlreadySeeded bool
	Workspace     workspace.WorkspaceSummary
}

func configFromArgs(args []string, stderr io.Writer, getenv func(string) string) (config, error) {
	appDataDir, err := defaultAppDataDir(getenv)
	if err != nil {
		return config{}, err
	}
	config := config{appDataDir: appDataDir}
	flagSet := flag.NewFlagSet("seed-semantic-graph-dev", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.appDataDir, "app-data-dir", config.appDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&config.workspacePath, "workspace-root", "", "workspace path to open, select, and seed")
	flagSet.StringVar(&config.workspacePath, "workspace-path", "", "alias for --workspace-root")
	if err := flagSet.Parse(args); err != nil {
		return config, err
	}
	if !filepath.IsAbs(config.appDataDir) {
		return config, fmt.Errorf("app data directory must be absolute: %s", config.appDataDir)
	}
	if config.workspacePath == "" {
		return config, fmt.Errorf("--workspace-root is required")
	}
	if !filepath.IsAbs(config.workspacePath) {
		return config, fmt.Errorf("workspace root must be absolute: %s", config.workspacePath)
	}
	return config, nil
}

func defaultAppDataDir(getenv func(string) string) (string, error) {
	if value := getenv("SETTA_APP_DATA_DIR"); value != "" {
		return value, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve default app data directory: %w", err)
	}
	return filepath.Join(homeDir, ".setta"), nil
}

func seedSemanticGraph(ctx context.Context, config config) (seedResult, error) {
	sessionService, err := newWorkspaceSessionService(config.appDataDir)
	if err != nil {
		return seedResult{}, err
	}
	summary, _, err := sessionService.OpenLocalFolder(config.workspacePath)
	if err != nil {
		return seedResult{}, err
	}

	store, err := semanticgraph.NewStore(config.appDataDir)
	if err != nil {
		return seedResult{}, err
	}
	defer store.Close()

	service, err := semanticgraph.NewService(store, sessionService)
	if err != nil {
		return seedResult{}, err
	}
	graph, err := service.ReadGraph(ctx, summary.ID)
	if err != nil {
		return seedResult{}, err
	}
	if semanticNodeExists(graph.Nodes, seedConstraintNodeID) {
		return seedResult{AlreadySeeded: true, Workspace: summary}, nil
	}
	for _, event := range seedEvents(summary.ID) {
		if _, err := service.AppendEvent(ctx, event); err != nil {
			return seedResult{}, err
		}
	}
	return seedResult{Workspace: summary}, nil
}

func newWorkspaceSessionService(appDataDir string) (*workspacesession.Service, error) {
	store, err := appstate.NewStore(appDataDir)
	if err != nil {
		return nil, err
	}
	manager, err := workspace.NewManager(appDataDir)
	if err != nil {
		return nil, err
	}
	return workspacesession.NewService(store, manager)
}

func semanticNodeExists(nodes []semanticgraph.SemanticNode, nodeID string) bool {
	for _, node := range nodes {
		if node.ID == nodeID {
			return true
		}
	}
	return false
}

func seedEvents(workspaceID string) []semanticgraph.SemanticEvent {
	confidence88 := 88
	confidence91 := 91
	return []semanticgraph.SemanticEvent{
		seedEvent(workspaceID, "semantic_seed_event_constraint_created", semanticgraph.EventNodeCreated, seedConstraintNodeID, 0, &confidence88, nodeCreatedPayload{
			NodeID:  seedConstraintNodeID,
			Kind:    semanticgraph.NodeKindConstraint,
			Label:   "Deterministic layout writes stay read-only",
			Summary: "Phase 2 semantic layout writes persist positions without creating or mutating semantic content.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_finding_created", semanticgraph.EventNodeCreated, seedFindingNodeID, 1, &confidence91, nodeCreatedPayload{
			NodeID:  seedFindingNodeID,
			Kind:    semanticgraph.NodeKindFinding,
			Label:   "Renderer reads semantic graph",
			Summary: "The renderer should load semantic graph data through main, preload, backend, and SQLite paths.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_risk_created", semanticgraph.EventNodeCreated, seedRiskNodeID, 2, nil, nodeCreatedPayload{
			NodeID:  seedRiskNodeID,
			Kind:    semanticgraph.NodeKindHypothesis,
			Label:   "Layout writes could mutate content",
			Summary: "A layout endpoint must reject unknown entities and avoid semantic event mutations.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_question_created", semanticgraph.EventNodeCreated, seedQuestionNodeID, 3, nil, nodeCreatedPayload{
			NodeID:  seedQuestionNodeID,
			Kind:    semanticgraph.NodeKindQuestion,
			Label:   "How is semantic graph phase 2 verified?",
			Summary: "Acceptance should be proven through deterministic Electron coverage.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_constraint_promoted", semanticgraph.EventNodePromoted, seedConstraintNodeID, 4, nil, nodePromotedPayload{
			NodeID: seedConstraintNodeID,
		}),
		seedEvent(workspaceID, "semantic_seed_event_support_edge_created", semanticgraph.EventEdgeCreated, "semantic_seed_supports", 5, nil, edgeCreatedPayload{
			EdgeID:     "semantic_seed_supports",
			Kind:       semanticgraph.EdgeKindSupports,
			FromNodeID: seedFindingNodeID,
			ToNodeID:   seedConstraintNodeID,
			Label:      "supports",
			Summary:    "Renderer data flow proves the read-only graph path.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_refute_edge_created", semanticgraph.EventEdgeCreated, "semantic_seed_refutes", 6, nil, edgeCreatedPayload{
			EdgeID:     "semantic_seed_refutes",
			Kind:       semanticgraph.EdgeKindRefutes,
			FromNodeID: seedRiskNodeID,
			ToNodeID:   seedConstraintNodeID,
			Label:      "refutes",
			Summary:    "Strict layout persistence checks disprove accidental semantic mutation.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_resolve_edge_created", semanticgraph.EventEdgeCreated, "semantic_seed_resolves", 7, nil, edgeCreatedPayload{
			EdgeID:     "semantic_seed_resolves",
			Kind:       semanticgraph.EdgeKindResolves,
			FromNodeID: seedConstraintNodeID,
			ToNodeID:   seedQuestionNodeID,
			Label:      "resolves",
			Summary:    "The Electron workflow verifies graph visibility, inspection, reload, and layout persistence.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_evidence_attached", semanticgraph.EventEvidenceAttached, seedConstraintNodeID, 8, nil, evidenceAttachedPayload{
			AnchorID:       "semantic_seed_evidence_plan",
			TargetEntityID: seedConstraintNodeID,
			SourceKind:     semanticgraph.EvidenceSourceDocument,
			SourceID:       "setta_semantic_work_graph_implementation_plan",
			Path:           "docs/plans/setta_semantic_work_graph_implementation_plan.md",
			RangeStart:     1,
			RangeEnd:       80,
			Text:           "Phase 2 renderer reads semantic graph data and persists layout positions.",
			Summary:        "Phase 2 plan excerpt",
		}),
		seedEvent(workspaceID, "semantic_seed_event_activity_started", semanticgraph.EventActivityStarted, seedConstraintNodeID, 9, nil, activityStartedPayload{
			IntervalID:     "semantic_seed_activity_validating",
			TargetEntityID: seedConstraintNodeID,
			Kind:           semanticgraph.ActivityKindValidating,
			Summary:        "Validating semantic graph renderer integration.",
		}),
		seedEvent(workspaceID, "semantic_seed_event_steering_created", semanticgraph.EventSteeringCreated, seedConstraintNodeID, 10, nil, steeringCreatedPayload{
			DirectiveID:    "semantic_seed_steering_readonly",
			TargetEntityID: seedConstraintNodeID,
			Instruction:    "Keep semantic graph rendering read-only except explicit layout positions.",
			Active:         true,
		}),
		seedEvent(workspaceID, "semantic_seed_event_context_pack_created", semanticgraph.EventContextPackCreated, seedConstraintNodeID, 11, nil, contextPackCreatedPayload{
			PackID:         "semantic_seed_context_phase2",
			TargetEntityID: seedConstraintNodeID,
			Summary:        "Phase 2 semantic graph renderer verification context",
			Prompt:         "Inspect semantic graph nodes, evidence, activity, steering, and event history.",
			ItemCount:      5,
		}),
		seedEvent(workspaceID, "semantic_seed_event_constraint_check_recorded", semanticgraph.EventConstraintCheckRecorded, seedConstraintNodeID, 12, nil, constraintCheckRecordedPayload{
			CheckID:        "semantic_seed_constraint_check",
			TargetEntityID: seedConstraintNodeID,
			Status:         "passed",
			Message:        "Layout writes remain outside semantic content events.",
		}),
	}
}

func seedEvent(workspaceID string, eventID string, eventType semanticgraph.SemanticEventType, targetEntityID string, minuteOffset int, confidence *int, payload any) semanticgraph.SemanticEvent {
	observedAt := seedObservedAt(minuteOffset)
	return semanticgraph.SemanticEvent{
		ActorID:        seedActorID,
		ActorKind:      semanticgraph.ActorKindService,
		Confidence:     confidence,
		EventID:        eventID,
		EventType:      eventType,
		ModelInfo:      map[string]string{"fixture": "semantic-graph-dev-seed"},
		ObservedAt:     observedAt,
		Payload:        mustMarshalPayload(payload),
		SessionID:      seedSessionID,
		TargetEntityID: targetEntityID,
		WorkspaceID:    workspaceID,
	}
}

func seedObservedAt(minuteOffset int) string {
	base, err := time.Parse(time.RFC3339, seedBaseObservedTimestamp)
	if err != nil {
		panic(err)
	}
	return base.Add(time.Duration(minuteOffset) * time.Minute).Format(time.RFC3339Nano)
}

func mustMarshalPayload(payload any) json.RawMessage {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	return json.RawMessage(data)
}

type nodeCreatedPayload struct {
	NodeID  string                         `json:"nodeId"`
	Kind    semanticgraph.SemanticNodeKind `json:"kind"`
	Label   string                         `json:"label"`
	Summary string                         `json:"summary"`
}

type nodePromotedPayload struct {
	NodeID string `json:"nodeId"`
}

type edgeCreatedPayload struct {
	EdgeID     string                         `json:"edgeId"`
	Kind       semanticgraph.SemanticEdgeKind `json:"kind"`
	FromNodeID string                         `json:"fromNodeId"`
	ToNodeID   string                         `json:"toNodeId"`
	Label      string                         `json:"label"`
	Summary    string                         `json:"summary"`
}

type evidenceAttachedPayload struct {
	AnchorID       string                                   `json:"anchorId"`
	TargetEntityID string                                   `json:"targetEntityId"`
	SourceKind     semanticgraph.SemanticEvidenceSourceKind `json:"sourceKind"`
	SourceID       string                                   `json:"sourceId"`
	URI            string                                   `json:"uri"`
	Path           string                                   `json:"path"`
	RangeStart     int                                      `json:"rangeStart"`
	RangeEnd       int                                      `json:"rangeEnd"`
	Text           string                                   `json:"text"`
	Summary        string                                   `json:"summary"`
}

type activityStartedPayload struct {
	IntervalID     string                             `json:"intervalId"`
	TargetEntityID string                             `json:"targetEntityId"`
	Kind           semanticgraph.SemanticActivityKind `json:"kind"`
	Summary        string                             `json:"summary"`
}

type steeringCreatedPayload struct {
	DirectiveID    string `json:"directiveId"`
	TargetEntityID string `json:"targetEntityId"`
	Instruction    string `json:"instruction"`
	Active         bool   `json:"active"`
}

type contextPackCreatedPayload struct {
	PackID         string `json:"packId"`
	TargetEntityID string `json:"targetEntityId"`
	Summary        string `json:"summary"`
	Prompt         string `json:"prompt"`
	ItemCount      int    `json:"itemCount"`
}

type constraintCheckRecordedPayload struct {
	CheckID        string `json:"checkId"`
	TargetEntityID string `json:"targetEntityId"`
	Status         string `json:"status"`
	Message        string `json:"message"`
}
