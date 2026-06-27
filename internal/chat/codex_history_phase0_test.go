package chat

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"setta/internal/codexapp"
	"setta/internal/workspace"
)

const (
	codexMethodThreadList      = "thread/list"
	codexMethodThreadRead      = "thread/read"
	codexMethodThreadTurnsList = "thread/turns/list"
	codexMethodThreadNameSet   = "thread/name/set"
)

func TestCodexHistoryPhase0ValidatesSettaDiscoveryAndWritableSurfaces(t *testing.T) {
	ctx := context.Background()
	workspaceRoot := t.TempDir()
	manager := newCodexHistoryPhase0Manager(CodexInitializeParams(CodexHarnessConfig{}))
	defer shutdownCodexHistoryPhase0Manager(t, manager)
	harness := NewCodexHarness(CodexHarnessConfig{Manager: manager})

	userTurn := startCodexHistoryPhase0Turn(t, ctx, harness, workspaceRoot, codexHistoryPhase0UserConversation(), "user")
	workflowTurn := startCodexHistoryPhase0Turn(t, ctx, harness, workspaceRoot, codexHistoryPhase0WorkflowConversation(), "workflow")
	internalThreadID := startCodexHistoryPhase0ThreadOnly(t, manager, workspaceRoot, codexThreadSourceSettaSemanticCartographer)
	threads := requireCodexHistoryPhase0Discovery(t, manager, workspaceRoot, userTurn.threadID, workflowTurn.threadID, internalThreadID)
	index := newPhase0SettaThreadIndex()
	index.mustWrite(t, phase0SettaThreadIndexRecord{
		CodexThreadID: userTurn.threadID,
		Surface:       phase0SettaSurfaceUser,
		WorkspaceCWD:  workspaceRoot,
		WorkspaceID:   "workspace_phase0",
	})
	index.mustWrite(t, phase0SettaThreadIndexRecord{
		CodexThreadID: workflowTurn.threadID,
		Surface:       phase0SettaSurfaceWorkflow,
		WorkspaceCWD:  workspaceRoot,
		WorkspaceID:   "workspace_phase0",
	})
	index.mustWrite(t, phase0SettaThreadIndexRecord{
		CodexThreadID: internalThreadID,
		Surface:       phase0SettaSurfaceSemanticCartographer,
		WorkspaceCWD:  workspaceRoot,
		WorkspaceID:   "workspace_phase0",
	})
	requireCodexHistoryPhase0IndexedMembership(t, index, threads, userTurn.threadID, workflowTurn.threadID, internalThreadID)
	requireCodexHistoryPhase0Reads(t, manager, userTurn)
	requireCodexHistoryPhase0WritableSurfaces(t, ctx, manager, userTurn.threadID)
}

type codexHistoryPhase0StartedTurn struct {
	itemID   string
	threadID string
	turnID   string
}

func startCodexHistoryPhase0Turn(t *testing.T, ctx context.Context, harness *CodexHarness, workspaceRoot string, conversation Conversation, label string) codexHistoryPhase0StartedTurn {
	t.Helper()
	userSink := newRecordingSink()
	completion, err := harness.StartTurn(ctx, codexHistoryPhase0TurnRequest(workspaceRoot, conversation), userSink)
	if err != nil {
		t.Fatalf("start %s turn: %v", label, err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if userSink.threadID == "" || userSink.turnID == "" {
		t.Fatalf("%s sink thread refs = %q/%q, want linked Codex ids", label, userSink.threadID, userSink.turnID)
	}
	return codexHistoryPhase0StartedTurn{
		itemID:   requireSingleProviderItemID(t, userSink),
		threadID: userSink.threadID,
		turnID:   userSink.turnID,
	}
}

func startCodexHistoryPhase0ThreadOnly(t *testing.T, manager *codexapp.Manager, workspaceRoot string, threadSource string) string {
	t.Helper()
	startPage := phase0CallObject(t, manager, codexapp.CodexMethodThreadStart, map[string]any{
		"cwd":          workspaceRoot,
		"threadSource": threadSource,
	})
	thread := phase0ObjectField(t, startPage, "thread", "thread/start response")
	return phase0StringField(t, thread, "id", "thread/start response.thread")
}

func requireCodexHistoryPhase0Discovery(t *testing.T, manager *codexapp.Manager, workspaceRoot string, userThreadID string, workflowThreadID string, internalThreadID string) []map[string]any {
	t.Helper()
	listPage := phase0CallObject(t, manager, codexMethodThreadList, map[string]any{
		"cwd":         workspaceRoot,
		"limit":       100,
		"sourceKinds": []string{"appServer"},
	})
	threads := phase0ObjectArray(t, listPage, "data", "thread/list response")
	requirePhase0ThreadPresent(t, threads, userThreadID)
	requirePhase0ThreadPresent(t, threads, workflowThreadID)
	requirePhase0ThreadPresent(t, threads, internalThreadID)
	requirePhase0ThreadPresent(t, threads, "thread_phase0_unindexed_app_server")
	requirePhase0ThreadAbsent(t, threads, "thread_phase0_cli")
	requirePhase0ThreadAbsent(t, threads, "thread_phase0_vscode")
	requirePhase0ThreadAbsent(t, threads, "thread_phase0_other_cwd")
	return threads
}

func requireCodexHistoryPhase0IndexedMembership(t *testing.T, index *phase0SettaThreadIndex, threads []map[string]any, userThreadID string, workflowThreadID string, internalThreadID string) {
	t.Helper()
	assertPhase0StringSlice(t, "indexed user threads", index.hydratedThreadIDs("workspace_phase0", phase0SettaSurfaceUser, threads), []string{userThreadID})
	assertPhase0StringSlice(t, "indexed workflow threads", index.hydratedThreadIDs("workspace_phase0", phase0SettaSurfaceWorkflow, threads), []string{workflowThreadID})
	assertPhase0StringSlice(t, "indexed semantic cartographer threads", index.hydratedThreadIDs("workspace_phase0", phase0SettaSurfaceSemanticCartographer, threads), []string{internalThreadID})
	for _, surface := range []string{phase0SettaSurfaceUser, phase0SettaSurfaceWorkflow, phase0SettaSurfaceSemanticCartographer} {
		ids := index.hydratedThreadIDs("workspace_phase0", surface, threads)
		for _, id := range ids {
			if id == "thread_phase0_unindexed_app_server" {
				t.Fatalf("unknown Codex thread %s was inferred into Setta %s list", id, surface)
			}
		}
	}
}

func requireCodexHistoryPhase0Reads(t *testing.T, manager *codexapp.Manager, turn codexHistoryPhase0StartedTurn) {
	t.Helper()
	readPage := phase0CallObject(t, manager, codexMethodThreadRead, map[string]any{
		"includeTurns": true,
		"threadId":     turn.threadID,
	})
	readThread := phase0ObjectField(t, readPage, "thread", "thread/read response")
	readTurns := phase0ObjectArray(t, readThread, "turns", "thread/read response.thread")
	if got := phase0StringField(t, readTurns[0], "id", "thread/read turn"); got != turn.turnID {
		t.Fatalf("thread/read turn id = %q, want live turn id %q", got, turn.turnID)
	}
	if got := phase0FirstItemID(t, readTurns[0]); got != turn.itemID {
		t.Fatalf("thread/read item id = %q, want live item id %q", got, turn.itemID)
	}

	turnsPage := phase0CallObject(t, manager, codexMethodThreadTurnsList, map[string]any{
		"itemsView": "summary",
		"limit":     1,
		"threadId":  turn.threadID,
	})
	turns := phase0ObjectArray(t, turnsPage, "data", "thread/turns/list response")
	if got := phase0StringField(t, turns[0], "id", "thread/turns/list turn"); got != turn.turnID {
		t.Fatalf("thread/turns/list turn id = %q, want live turn id %q", got, turn.turnID)
	}
	if got := phase0FirstItemID(t, turns[0]); got != turn.itemID {
		t.Fatalf("thread/turns/list item id = %q, want live item id %q", got, turn.itemID)
	}
}

func requireCodexHistoryPhase0WritableSurfaces(t *testing.T, ctx context.Context, manager *codexapp.Manager, threadID string) {
	t.Helper()
	_, err := manager.Call(ctx, codexMethodThreadNameSet, map[string]any{
		"name":     "Phase 0 title",
		"threadId": threadID,
	})
	if err != nil {
		t.Fatalf("thread/name/set: %v", err)
	}
	renamed := phase0CallObject(t, manager, codexMethodThreadRead, map[string]any{"threadId": threadID})
	renamedThread := phase0ObjectField(t, renamed, "thread", "renamed thread/read response")
	if got := phase0StringField(t, renamedThread, "name", "renamed thread"); got != "Phase 0 title" {
		t.Fatalf("thread name = %q, want Phase 0 title", got)
	}
	requireCodexHistoryPhase0GoalSurface(t, ctx, manager, threadID)
	requireCodexHistoryPhase0SettingsSurface(t, ctx, manager, threadID)
}

func requireCodexHistoryPhase0GoalSurface(t *testing.T, ctx context.Context, manager *codexapp.Manager, threadID string) {
	t.Helper()
	goalBeforeRaw, err := manager.Call(ctx, codexapp.CodexMethodThreadGoalGet, codexapp.ThreadGoalGetParams{ThreadID: threadID})
	if err != nil {
		t.Fatalf("thread/goal/get before set: %v", err)
	}
	goalBefore, err := codexapp.DecodeThreadGoalGetResponse(goalBeforeRaw)
	if err != nil {
		t.Fatalf("decode empty goal: %v", err)
	}
	if goalBefore.Goal != nil {
		t.Fatalf("goal before set = %+v, want nil", goalBefore.Goal)
	}

	objective := "Validate Codex history ownership"
	status := codexapp.ThreadGoalStatusActive
	goalSetRaw, err := manager.Call(ctx, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		Objective: &objective,
		Status:    &status,
		ThreadID:  threadID,
	})
	if err != nil {
		t.Fatalf("thread/goal/set: %v", err)
	}
	goalSet, err := codexapp.DecodeThreadGoalSetResponse(goalSetRaw)
	if err != nil {
		t.Fatalf("decode set goal: %v", err)
	}
	if goalSet.Goal.Objective != objective || goalSet.Goal.Status != status {
		t.Fatalf("set goal = %+v, want objective/status", goalSet.Goal)
	}
	goalGetRaw, err := manager.Call(ctx, codexapp.CodexMethodThreadGoalGet, codexapp.ThreadGoalGetParams{ThreadID: threadID})
	if err != nil {
		t.Fatalf("thread/goal/get after set: %v", err)
	}
	goalGet, err := codexapp.DecodeThreadGoalGetResponse(goalGetRaw)
	if err != nil {
		t.Fatalf("decode get goal: %v", err)
	}
	if goalGet.Goal == nil || goalGet.Goal.Objective != objective || goalGet.Goal.Status != status {
		t.Fatalf("get goal = %+v, want persisted goal", goalGet.Goal)
	}
	goalClearRaw, err := manager.Call(ctx, codexapp.CodexMethodThreadGoalClear, codexapp.ThreadGoalClearParams{ThreadID: threadID})
	if err != nil {
		t.Fatalf("thread/goal/clear: %v", err)
	}
	goalClear, err := codexapp.DecodeThreadGoalClearResponse(goalClearRaw)
	if err != nil {
		t.Fatalf("decode clear goal: %v", err)
	}
	if !goalClear.Cleared {
		t.Fatal("thread/goal/clear cleared=false, want true")
	}
}

func requireCodexHistoryPhase0SettingsSurface(t *testing.T, ctx context.Context, manager *codexapp.Manager, threadID string) {
	t.Helper()
	session, err := manager.NewSession(ctx)
	if err != nil {
		t.Fatalf("new settings session: %v", err)
	}
	defer session.Close()
	if err := session.OwnThread(threadID); err != nil {
		t.Fatalf("own settings thread: %v", err)
	}
	model := "gpt-phase0"
	effort := codexapp.ReasoningEffort("high")
	if _, err := session.Call(ctx, codexapp.CodexMethodThreadSettingsUpdate, codexapp.ThreadSettingsUpdateParams{
		Effort:   &effort,
		Model:    &model,
		ThreadID: threadID,
	}); err != nil {
		t.Fatalf("thread/settings/update: %v", err)
	}
	settingsEvent := readPhase0SessionEvent(t, session)
	if settingsEvent.Kind != codexapp.EventNotification || settingsEvent.Message.Method != codexapp.CodexNotificationThreadSettingsUpdated {
		t.Fatalf("settings event = %+v, want thread/settings/updated notification", settingsEvent)
	}
	settingsUpdate, err := codexapp.DecodeThreadSettingsUpdatedNotification(settingsEvent.Message.Params)
	if err != nil {
		t.Fatalf("decode settings update: %v", err)
	}
	if settingsUpdate.ThreadID != threadID || settingsUpdate.ThreadSettings.Model != model ||
		settingsUpdate.ThreadSettings.Effort == nil || *settingsUpdate.ThreadSettings.Effort != effort {
		t.Fatalf("settings update = %+v, want linked model and effort update", settingsUpdate)
	}
}

func TestCodexHistoryPhase0TurnsListRequiresExperimentalCapability(t *testing.T) {
	ctx := context.Background()
	workspaceRoot := t.TempDir()
	manager := newCodexHistoryPhase0Manager(map[string]any{
		"clientInfo": map[string]any{"name": "setta", "title": "Setta", "version": "dev"},
	})
	defer shutdownCodexHistoryPhase0Manager(t, manager)

	startPage := phase0CallObject(t, manager, codexapp.CodexMethodThreadStart, map[string]any{
		"cwd":          workspaceRoot,
		"threadSource": codexThreadSourceSettaUser,
	})
	thread := phase0ObjectField(t, startPage, "thread", "thread/start response")
	threadID := phase0StringField(t, thread, "id", "thread/start response.thread")
	_, err := manager.Call(ctx, codexMethodThreadTurnsList, map[string]any{
		"itemsView": "summary",
		"threadId":  threadID,
	})
	if err == nil {
		t.Fatal("thread/turns/list succeeded without experimentalApi capability")
	}
	if !strings.Contains(err.Error(), "thread/turns/list requires experimentalApi capability") {
		t.Fatalf("thread/turns/list error = %q, want missing experimentalApi capability", err)
	}
}

func TestCodexHistoryPhase0IndexWriteFailureStopsFirstTurn(t *testing.T) {
	ctx := context.Background()
	workspaceRoot := t.TempDir()
	manager := newCodexHistoryPhase0Manager(CodexInitializeParams(CodexHarnessConfig{}))
	defer shutdownCodexHistoryPhase0Manager(t, manager)
	index := &phase0SettaThreadIndex{failWrites: true}

	threadID, err := phase0CreateIndexedThreadAndStartTurn(t, ctx, manager, index, workspaceRoot, phase0SettaSurfaceUser, "phase 0 prompt")
	if err == nil {
		t.Fatal("indexed chat creation succeeded with failing Setta thread index, want error")
	}
	if !strings.Contains(err.Error(), "write Setta thread index") {
		t.Fatalf("indexed chat creation error = %v, want Setta thread index failure", err)
	}
	if threadID == "" {
		t.Fatal("thread/start did not return a thread id before index write failure")
	}
	readPage := phase0CallObject(t, manager, codexMethodThreadRead, map[string]any{
		"includeTurns": true,
		"threadId":     threadID,
	})
	thread := phase0ObjectField(t, readPage, "thread", "thread/read response")
	if turns := phase0ObjectArray(t, thread, "turns", "thread/read response.thread"); len(turns) != 0 {
		t.Fatalf("thread %s has %d turns after index write failure, want no first turn started", threadID, len(turns))
	}
}

func TestCodexHistoryPhase0IndexAndOverlayExcludeTranscriptText(t *testing.T) {
	prohibited := []string{
		"phase0 user prompt secret",
		"phase0 assistant response secret",
		"phase0 persisted transcript item body secret",
	}
	command := "printf 'phase0 command detail is allowed\\n'"
	indexRecord := phase0SettaThreadIndexRecord{
		CodexThreadID: "thread_phase0_user",
		Surface:       phase0SettaSurfaceUser,
		WorkspaceCWD:  "/tmp/phase0-workspace",
		WorkspaceID:   "workspace_phase0",
	}
	overlayRecord := phase0SettaActivityOverlayRecord{
		ActivityKind:             "commandApproval",
		Command:                  command,
		CodexThreadID:            "thread_phase0_user",
		CodexTurnID:              "turn_phase0_user",
		LiveProviderOrRequestID:  "approval_request_phase0",
		Status:                   "requested",
		TurnScopedPresentationID: "thread_phase0_user:turn_phase0_user:commandApproval:approval_request_phase0",
	}
	requirePhase0NoTranscriptText(t, "thread index record", indexRecord, prohibited)
	requirePhase0NoTranscriptText(t, "activity overlay record", overlayRecord, prohibited)
}

func TestCodexHistoryPhase0MeasuresSyntheticHistoryLatency(t *testing.T) {
	workspaceRoot := t.TempDir()
	manager := newCodexHistoryPhase0Manager(CodexInitializeParams(CodexHarnessConfig{}))
	defer shutdownCodexHistoryPhase0Manager(t, manager)

	seed := phase0CallObject(t, manager, "phase0/seedSyntheticHistory", map[string]any{
		"cwd":         workspaceRoot,
		"itemCount":   6,
		"threadCount": 1000,
		"turnCount":   120,
	})
	transcriptThreadID := phase0StringField(t, seed, "transcriptThreadId", "seed response")

	listDuration, listPage := phase0TimedCallObject(t, manager, codexMethodThreadList, map[string]any{
		"cwd":         workspaceRoot,
		"limit":       50,
		"sourceKinds": []string{"appServer"},
	})
	if got := len(phase0ObjectArray(t, listPage, "data", "latency thread/list response")); got != 50 {
		t.Fatalf("thread/list page size = %d, want 50", got)
	}
	firstPageDuration, firstPage := phase0TimedCallObject(t, manager, codexMethodThreadTurnsList, map[string]any{
		"itemsView": "full",
		"limit":     40,
		"threadId":  transcriptThreadID,
	})
	if got := len(phase0ObjectArray(t, firstPage, "data", "latency first turn page")); got != 40 {
		t.Fatalf("first transcript page size = %d, want 40", got)
	}
	olderCursor := phase0StringField(t, firstPage, "nextCursor", "latency first turn page")
	olderPageDuration, olderPage := phase0TimedCallObject(t, manager, codexMethodThreadTurnsList, map[string]any{
		"cursor":    olderCursor,
		"itemsView": "full",
		"limit":     40,
		"threadId":  transcriptThreadID,
	})
	if got := len(phase0ObjectArray(t, olderPage, "data", "latency older turn page")); got != 40 {
		t.Fatalf("older transcript page size = %d, want 40", got)
	}
	t.Logf("phase0 synthetic history latency: thread/list 50 of 1000 threads=%s first transcript page 40 of 120 turns=%s older page=%s", listDuration, firstPageDuration, olderPageDuration)
}

func newCodexHistoryPhase0Manager(initializeParams any) *codexapp.Manager {
	return codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Args:    []string{"-test.run=TestCodexHistoryPhase0FakeAppServer", "--"},
			Command: os.Args[0],
			Env:     []string{"SETTA_CODEX_HISTORY_PHASE0_FAKE=1"},
		},
		InitializeParams: initializeParams,
	})
}

func TestCodexHistoryPhase0FakeAppServer(t *testing.T) {
	if os.Getenv("SETTA_CODEX_HISTORY_PHASE0_FAKE") == "" {
		return
	}
	runFakeCodexHistoryPhase0AppServer()
	os.Exit(0)
}

func runFakeCodexHistoryPhase0AppServer() {
	scanner := bufio.NewScanner(os.Stdin)
	state := fakeCodexHistoryPhase0ProcessState{}
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		if _, done := handleFakeCodexHistoryPhase0Method(&state, message); done {
			return
		}
	}
}

func shutdownCodexHistoryPhase0Manager(t *testing.T, manager *codexapp.Manager) {
	t.Helper()
	if err := manager.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown phase0 manager: %v", err)
	}
}

func codexHistoryPhase0TurnRequest(workspaceRoot string, conversation Conversation) TurnRequest {
	return TurnRequest{
		Workspace: workspace.WorkspaceSummary{
			ID:           "workspace_phase0",
			RootPath:     workspaceRoot,
			DisplayName:  "phase0",
			LastOpenedAt: "2026-06-26T00:00:00Z",
		},
		Conversation: conversation,
		Run: Run{
			ID:             "run_" + conversation.ID,
			WorkspaceID:    "workspace_phase0",
			ConversationID: conversation.ID,
		},
		Prompt: "phase 0 prompt",
	}
}

func codexHistoryPhase0UserConversation() Conversation {
	return Conversation{
		ID:          "conversation_phase0_user",
		WorkspaceID: "workspace_phase0",
	}
}

func codexHistoryPhase0WorkflowConversation() Conversation {
	return Conversation{
		ID:          "conversation_phase0_workflow",
		WorkspaceID: "workspace_phase0",
		Internal:    true,
		Workflow: &ConversationWorkflowMetadata{
			DefinitionID:        "workflow_phase0_definition",
			DefinitionVersionID: "workflow_phase0_version",
			ExecutionID:         "workflow_phase0_execution",
			NodeExecutionID:     "workflow_phase0_node_execution",
			NodeID:              "workflow_phase0_node",
		},
	}
}

func requireSingleProviderItemID(t *testing.T, sink *recordingSink) string {
	t.Helper()
	if len(sink.items) != 1 {
		t.Fatalf("provider items = %+v, want one live item", sink.items)
	}
	if sink.items[0].ProviderItemID == "" {
		t.Fatalf("provider item = %+v, want provider item id", sink.items[0])
	}
	return sink.items[0].ProviderItemID
}

const (
	phase0SettaSurfaceSemanticCartographer = "semantic_cartographer"
	phase0SettaSurfaceUser                 = "user"
	phase0SettaSurfaceWorkflow             = "workflow"
)

type phase0SettaThreadIndexRecord struct {
	CodexThreadID string `json:"codexThreadId"`
	Surface       string `json:"surface"`
	WorkspaceCWD  string `json:"workspaceCwd"`
	WorkspaceID   string `json:"workspaceId"`
}

type phase0SettaThreadIndex struct {
	failWrites bool
	records    []phase0SettaThreadIndexRecord
}

func newPhase0SettaThreadIndex() *phase0SettaThreadIndex {
	return &phase0SettaThreadIndex{}
}

func (index *phase0SettaThreadIndex) mustWrite(t *testing.T, record phase0SettaThreadIndexRecord) {
	t.Helper()
	if err := index.write(record); err != nil {
		t.Fatalf("write phase0 Setta thread index: %v", err)
	}
}

func (index *phase0SettaThreadIndex) write(record phase0SettaThreadIndexRecord) error {
	if index.failWrites {
		return fmt.Errorf("phase0 injected index write failure")
	}
	if record.WorkspaceID == "" || record.CodexThreadID == "" || record.Surface == "" {
		return fmt.Errorf("workspace id, Codex thread id, and surface are required")
	}
	index.records = append(index.records, record)
	return nil
}

func (index *phase0SettaThreadIndex) hydratedThreadIDs(workspaceID string, surface string, codexThreads []map[string]any) []string {
	codexThreadIDs := map[string]struct{}{}
	for _, thread := range codexThreads {
		id, _ := thread["id"].(string)
		if id != "" {
			codexThreadIDs[id] = struct{}{}
		}
	}
	ids := []string{}
	for _, record := range index.records {
		if record.WorkspaceID != workspaceID || record.Surface != surface {
			continue
		}
		if _, ok := codexThreadIDs[record.CodexThreadID]; ok {
			ids = append(ids, record.CodexThreadID)
		}
	}
	sort.Strings(ids)
	return ids
}

type phase0SettaActivityOverlayRecord struct {
	ActivityKind             string `json:"activityKind"`
	Command                  string `json:"command,omitempty"`
	CodexThreadID            string `json:"codexThreadId"`
	CodexTurnID              string `json:"codexTurnId"`
	LiveProviderOrRequestID  string `json:"liveProviderOrRequestId"`
	Status                   string `json:"status"`
	TurnScopedPresentationID string `json:"turnScopedPresentationId"`
}

func phase0CreateIndexedThreadAndStartTurn(t *testing.T, ctx context.Context, manager *codexapp.Manager, index *phase0SettaThreadIndex, workspaceRoot string, surface string, prompt string) (string, error) {
	t.Helper()
	startPage := phase0CallObject(t, manager, codexapp.CodexMethodThreadStart, map[string]any{
		"cwd":          workspaceRoot,
		"threadSource": "setta:" + surface,
	})
	thread := phase0ObjectField(t, startPage, "thread", "thread/start response")
	threadID := phase0StringField(t, thread, "id", "thread/start response.thread")
	if err := index.write(phase0SettaThreadIndexRecord{
		CodexThreadID: threadID,
		Surface:       surface,
		WorkspaceCWD:  workspaceRoot,
		WorkspaceID:   "workspace_phase0",
	}); err != nil {
		return threadID, fmt.Errorf("write Setta thread index: %w", err)
	}
	_, err := manager.Call(ctx, codexapp.CodexMethodTurnStart, map[string]any{
		"input":    []map[string]any{{"text": prompt, "type": "text"}},
		"threadId": threadID,
	})
	if err != nil {
		return threadID, fmt.Errorf("start first turn: %w", err)
	}
	return threadID, nil
}

func requirePhase0NoTranscriptText(t *testing.T, label string, record any, prohibited []string) {
	t.Helper()
	raw, err := json.Marshal(record)
	if err != nil {
		t.Fatalf("marshal %s: %v", label, err)
	}
	text := string(raw)
	for _, value := range prohibited {
		if strings.Contains(text, value) {
			t.Fatalf("%s contains prohibited transcript text %q: %s", label, value, text)
		}
	}
}

func assertPhase0StringSlice(t *testing.T, label string, got []string, want []string) {
	t.Helper()
	sort.Strings(got)
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", label, got, want)
	}
	for index := range got {
		if got[index] != want[index] {
			t.Fatalf("%s = %v, want %v", label, got, want)
		}
	}
}

func phase0CallObject(t *testing.T, manager *codexapp.Manager, method string, params any) map[string]any {
	t.Helper()
	raw, err := manager.Call(context.Background(), method, params)
	if err != nil {
		t.Fatalf("%s: %v", method, err)
	}
	return phase0DecodeObject(t, raw, method+" response")
}

func phase0TimedCallObject(t *testing.T, manager *codexapp.Manager, method string, params any) (time.Duration, map[string]any) {
	t.Helper()
	startedAt := time.Now()
	response := phase0CallObject(t, manager, method, params)
	return time.Since(startedAt), response
}

func phase0DecodeObject(t *testing.T, raw json.RawMessage, label string) map[string]any {
	t.Helper()
	var object map[string]any
	if err := json.Unmarshal(raw, &object); err != nil {
		t.Fatalf("decode %s: %v", label, err)
	}
	if object == nil {
		t.Fatalf("%s decoded nil object", label)
	}
	return object
}

func phase0ObjectField(t *testing.T, object map[string]any, field string, label string) map[string]any {
	t.Helper()
	raw, ok := object[field]
	if !ok || raw == nil {
		t.Fatalf("%s.%s missing", label, field)
	}
	value, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("%s.%s = %T, want object", label, field, raw)
	}
	return value
}

func phase0ObjectArray(t *testing.T, object map[string]any, field string, label string) []map[string]any {
	t.Helper()
	raw, ok := object[field]
	if !ok || raw == nil {
		t.Fatalf("%s.%s missing", label, field)
	}
	values, ok := raw.([]any)
	if !ok {
		t.Fatalf("%s.%s = %T, want array", label, field, raw)
	}
	result := make([]map[string]any, 0, len(values))
	for index, rawValue := range values {
		value, ok := rawValue.(map[string]any)
		if !ok {
			t.Fatalf("%s.%s[%d] = %T, want object", label, field, index, rawValue)
		}
		result = append(result, value)
	}
	return result
}

func phase0StringField(t *testing.T, object map[string]any, field string, label string) string {
	t.Helper()
	raw, ok := object[field]
	if !ok || raw == nil {
		t.Fatalf("%s.%s missing", label, field)
	}
	value, ok := raw.(string)
	if !ok {
		t.Fatalf("%s.%s = %T, want string", label, field, raw)
	}
	if value == "" {
		t.Fatalf("%s.%s is empty", label, field)
	}
	return value
}

func phase0FirstItemID(t *testing.T, turn map[string]any) string {
	t.Helper()
	items := phase0ObjectArray(t, turn, "items", "turn")
	if len(items) != 1 {
		t.Fatalf("turn items = %+v, want one item", items)
	}
	return phase0StringField(t, items[0], "id", "turn item")
}

func requirePhase0ThreadPresent(t *testing.T, threads []map[string]any, threadID string) map[string]any {
	t.Helper()
	for _, thread := range threads {
		if thread["id"] == threadID {
			return thread
		}
	}
	t.Fatalf("thread %s not found in %+v", threadID, threads)
	return nil
}

func requirePhase0ThreadAbsent(t *testing.T, threads []map[string]any, threadID string) {
	t.Helper()
	for _, thread := range threads {
		if thread["id"] == threadID {
			t.Fatalf("thread %s appeared in filtered history list", threadID)
		}
	}
}

func readPhase0SessionEvent(t *testing.T, session *codexapp.Session) codexapp.Event {
	t.Helper()
	select {
	case event, ok := <-session.Events():
		if !ok {
			t.Fatal("session closed before phase0 event")
		}
		return event
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for phase0 session event")
		return codexapp.Event{}
	}
}

type fakeCodexHistoryState struct {
	experimentalAPI bool
	nextThread      int
	nextTurn        int
	seededCWD       string
	threads         []fakeCodexHistoryThread
}

type fakeCodexHistoryPhase0ProcessState struct {
	history fakeCodexHistoryState
}

type fakeCodexHistoryThread struct {
	cwd          string
	goal         *fakeCodexHistoryGoal
	id           string
	model        string
	name         string
	reasoning    string
	sourceKind   string
	threadSource string
	turns        []fakeCodexHistoryTurn
}

type fakeCodexHistoryTurn struct {
	id     string
	items  []fakeCodexHistoryItem
	status string
}

type fakeCodexHistoryItem struct {
	id     string
	text   string
	status string
	typ    string
}

type fakeCodexHistoryGoal struct {
	objective string
	status    string
}

func handleFakeCodexHistoryPhase0Method(state *fakeCodexHistoryPhase0ProcessState, message map[string]any) (bool, bool) {
	if handled, done := handleFakeCodexHistoryPhase0LifecycleMethod(state, message); handled {
		return true, done
	}
	if handled, done := handleFakeCodexHistoryPhase0ReadMethod(state, message); handled {
		return true, done
	}
	if handled, done := handleFakeCodexHistoryPhase0WriteMethod(state, message); handled {
		return true, done
	}
	if message["method"] == "phase0/seedSyntheticHistory" {
		writeFakeResponse(message["id"], state.history.seedSyntheticHistory(fakeParams(message)))
		return true, false
	}
	return false, false
}

func handleFakeCodexHistoryPhase0LifecycleMethod(state *fakeCodexHistoryPhase0ProcessState, message map[string]any) (bool, bool) {
	switch message["method"] {
	case "initialize":
		params := fakeParams(message)
		state.history.experimentalAPI = phase0ExperimentalAPIEnabled(params)
		writeFakeInitializeResponse(message["id"])
		return true, false
	case "initialized":
		return true, false
	case codexapp.CodexMethodThreadStart:
		thread := state.history.startThread(fakeParams(message))
		writeFakeResponse(message["id"], state.history.threadStartResponse(thread))
		return true, false
	case codexapp.CodexMethodTurnStart:
		thread, turn := state.history.startTurn(fakeParams(message))
		writeFakeResponse(message["id"], map[string]any{"turn": turn.mapValue("full")})
		writeFakeHistoryTurnNotifications(thread, turn)
		return true, false
	default:
		return false, false
	}
}

func handleFakeCodexHistoryPhase0ReadMethod(state *fakeCodexHistoryPhase0ProcessState, message map[string]any) (bool, bool) {
	switch message["method"] {
	case codexMethodThreadList:
		writeFakeResponse(message["id"], state.history.threadListResponse(fakeParams(message)))
		return true, false
	case codexMethodThreadRead:
		response, ok := state.history.threadReadResponse(fakeParams(message))
		if !ok {
			writeFakeErrorResponse(message["id"], -32600, "thread/read thread not found")
			return true, false
		}
		writeFakeResponse(message["id"], response)
		return true, false
	case codexMethodThreadTurnsList:
		if !state.history.experimentalAPI {
			writeFakeErrorResponse(message["id"], -32600, "thread/turns/list requires experimentalApi capability")
			return true, false
		}
		response, ok := state.history.threadTurnsListResponse(fakeParams(message))
		if !ok {
			writeFakeErrorResponse(message["id"], -32600, "thread/turns/list thread not found")
			return true, false
		}
		writeFakeResponse(message["id"], response)
		return true, false
	default:
		return false, false
	}
}

func handleFakeCodexHistoryPhase0WriteMethod(state *fakeCodexHistoryPhase0ProcessState, message map[string]any) (bool, bool) {
	switch message["method"] {
	case codexMethodThreadNameSet:
		if !state.history.setThreadName(fakeParams(message)) {
			writeFakeErrorResponse(message["id"], -32600, "thread/name/set thread not found")
			return true, false
		}
		writeFakeResponse(message["id"], map[string]any{})
		return true, false
	case codexapp.CodexMethodThreadGoalGet:
		writeFakeResponse(message["id"], state.history.goalGetResponse(fakeParams(message)))
		return true, false
	case codexapp.CodexMethodThreadGoalSet:
		response, ok := state.history.goalSetResponse(fakeParams(message))
		if !ok {
			writeFakeErrorResponse(message["id"], -32600, "thread/goal/set thread not found")
			return true, false
		}
		writeFakeResponse(message["id"], response)
		return true, false
	case codexapp.CodexMethodThreadGoalClear:
		if !state.history.clearGoal(fakeParams(message)) {
			writeFakeErrorResponse(message["id"], -32600, "thread/goal/clear thread not found")
			return true, false
		}
		writeFakeResponse(message["id"], map[string]any{"cleared": true})
		return true, false
	case codexapp.CodexMethodThreadSettingsUpdate:
		thread, ok := state.history.updateSettings(fakeParams(message))
		if !ok {
			writeFakeErrorResponse(message["id"], -32600, "thread/settings/update thread not found")
			return true, false
		}
		writeFakeResponse(message["id"], map[string]any{})
		writeFakeNotification(codexapp.CodexNotificationThreadSettingsUpdated, map[string]any{
			"threadId":       thread.id,
			"threadSettings": thread.settingsMap(),
		})
		return true, false
	default:
		return false, false
	}
}

func phase0ExperimentalAPIEnabled(params map[string]any) bool {
	capabilities, ok := params["capabilities"].(map[string]any)
	if !ok {
		return false
	}
	enabled, ok := capabilities["experimentalApi"].(bool)
	return ok && enabled
}

func (state *fakeCodexHistoryState) startThread(params map[string]any) fakeCodexHistoryThread {
	cwd, _ := params["cwd"].(string)
	state.ensureBaselineThreads(cwd)
	source, _ := params["threadSource"].(string)
	state.nextThread++
	thread := fakeCodexHistoryThread{
		cwd:          cwd,
		id:           fmt.Sprintf("thread_phase0_%03d", state.nextThread),
		model:        "gpt-5-codex",
		reasoning:    "medium",
		sourceKind:   "appServer",
		threadSource: source,
	}
	state.threads = append(state.threads, thread)
	return thread
}

func (state *fakeCodexHistoryState) ensureBaselineThreads(cwd string) {
	if state.seededCWD != "" {
		return
	}
	state.seededCWD = cwd
	state.threads = append(state.threads,
		fakeCodexHistoryThread{id: "thread_phase0_cli", cwd: cwd, model: "gpt-5-codex", reasoning: "medium", sourceKind: "cli", threadSource: codexThreadSourceSettaUser},
		fakeCodexHistoryThread{id: "thread_phase0_vscode", cwd: cwd, model: "gpt-5-codex", reasoning: "medium", sourceKind: "vscode", threadSource: codexThreadSourceSettaUser},
		fakeCodexHistoryThread{id: "thread_phase0_unindexed_app_server", cwd: cwd, model: "gpt-5-codex", reasoning: "medium", sourceKind: "appServer", threadSource: codexThreadSourceSettaUser},
		fakeCodexHistoryThread{id: "thread_phase0_other_cwd", cwd: cwd + "/other", model: "gpt-5-codex", reasoning: "medium", sourceKind: "appServer", threadSource: codexThreadSourceSettaUser},
	)
}

func (state *fakeCodexHistoryState) startTurn(params map[string]any) (fakeCodexHistoryThread, fakeCodexHistoryTurn) {
	threadID, _ := params["threadId"].(string)
	thread, ok := state.threadByID(threadID)
	if !ok {
		panic("phase0 turn/start thread not found")
	}
	state.nextTurn++
	turnID := fmt.Sprintf("turn_phase0_%03d", state.nextTurn)
	item := fakeCodexHistoryItem{
		id:     "agent_message_" + turnID,
		status: "completed",
		text:   "phase 0 response for " + thread.threadSource,
		typ:    "agentMessage",
	}
	turn := fakeCodexHistoryTurn{
		id:     turnID,
		items:  []fakeCodexHistoryItem{item},
		status: "completed",
	}
	thread.turns = append(thread.turns, turn)
	return *thread, turn
}

func (state *fakeCodexHistoryState) threadByID(threadID string) (*fakeCodexHistoryThread, bool) {
	for index := range state.threads {
		if state.threads[index].id == threadID {
			return &state.threads[index], true
		}
	}
	return nil, false
}

func (state *fakeCodexHistoryState) threadStartResponse(thread fakeCodexHistoryThread) map[string]any {
	return map[string]any{
		"approvalPolicy":    "on-request",
		"approvalsReviewer": "user",
		"cwd":               thread.cwd,
		"model":             thread.model,
		"modelProvider":     "fake",
		"reasoningEffort":   thread.reasoning,
		"sandbox":           "workspace-write",
		"thread":            thread.mapValue(false),
	}
}

func (state *fakeCodexHistoryState) threadListResponse(params map[string]any) map[string]any {
	cwd := phase0OptionalStringParam(params, "cwd")
	sourceKinds := phase0StringSetParam(params, "sourceKinds")
	limit := phase0IntParam(params, "limit", len(state.threads))
	cursor := phase0IntParam(params, "cursor", 0)
	data := []any{}
	for _, thread := range state.threads {
		if cwd != "" && thread.cwd != cwd {
			continue
		}
		if len(sourceKinds) > 0 {
			if _, ok := sourceKinds[thread.sourceKind]; !ok {
				continue
			}
		}
		data = append(data, thread.mapValue(false))
	}
	if cursor > len(data) {
		cursor = len(data)
	}
	end := cursor + limit
	if end > len(data) {
		end = len(data)
	}
	var nextCursor any
	if end < len(data) {
		nextCursor = fmt.Sprintf("%d", end)
	}
	return map[string]any{
		"backwardsCursor": nil,
		"data":            data[cursor:end],
		"nextCursor":      nextCursor,
	}
}

func (state *fakeCodexHistoryState) threadReadResponse(params map[string]any) (map[string]any, bool) {
	threadID, _ := params["threadId"].(string)
	includeTurns, _ := params["includeTurns"].(bool)
	thread, ok := state.threadByID(threadID)
	if !ok {
		return nil, false
	}
	return map[string]any{"thread": thread.mapValue(includeTurns)}, true
}

func (state *fakeCodexHistoryState) threadTurnsListResponse(params map[string]any) (map[string]any, bool) {
	threadID, _ := params["threadId"].(string)
	thread, ok := state.threadByID(threadID)
	if !ok {
		return nil, false
	}
	itemsView := phase0OptionalStringParam(params, "itemsView")
	if itemsView == "" {
		itemsView = "summary"
	}
	limit := phase0IntParam(params, "limit", len(thread.turns))
	cursor := phase0IntParam(params, "cursor", 0)
	if cursor > len(thread.turns) {
		cursor = len(thread.turns)
	}
	end := cursor + limit
	if end > len(thread.turns) {
		end = len(thread.turns)
	}
	data := []any{}
	for _, turn := range thread.turns[cursor:end] {
		data = append(data, turn.mapValue(itemsView))
	}
	var nextCursor any
	if end < len(thread.turns) {
		nextCursor = fmt.Sprintf("%d", end)
	}
	return map[string]any{
		"backwardsCursor": nil,
		"data":            data,
		"nextCursor":      nextCursor,
	}, true
}

func (state *fakeCodexHistoryState) setThreadName(params map[string]any) bool {
	threadID, _ := params["threadId"].(string)
	name, _ := params["name"].(string)
	thread, ok := state.threadByID(threadID)
	if !ok {
		return false
	}
	thread.name = name
	return true
}

func (state *fakeCodexHistoryState) goalGetResponse(params map[string]any) map[string]any {
	threadID, _ := params["threadId"].(string)
	thread, ok := state.threadByID(threadID)
	if !ok || thread.goal == nil {
		return map[string]any{}
	}
	return map[string]any{"goal": thread.goal.mapValue(threadID)}
}

func (state *fakeCodexHistoryState) goalSetResponse(params map[string]any) (map[string]any, bool) {
	threadID, _ := params["threadId"].(string)
	thread, ok := state.threadByID(threadID)
	if !ok {
		return nil, false
	}
	objective, _ := params["objective"].(string)
	status, _ := params["status"].(string)
	if objective == "" && thread.goal != nil {
		objective = thread.goal.objective
	}
	if status == "" {
		status = string(codexapp.ThreadGoalStatusActive)
	}
	thread.goal = &fakeCodexHistoryGoal{objective: objective, status: status}
	return map[string]any{"goal": thread.goal.mapValue(threadID)}, true
}

func (state *fakeCodexHistoryState) clearGoal(params map[string]any) bool {
	threadID, _ := params["threadId"].(string)
	thread, ok := state.threadByID(threadID)
	if !ok {
		return false
	}
	thread.goal = nil
	return true
}

func (state *fakeCodexHistoryState) updateSettings(params map[string]any) (fakeCodexHistoryThread, bool) {
	threadID, _ := params["threadId"].(string)
	thread, ok := state.threadByID(threadID)
	if !ok {
		return fakeCodexHistoryThread{}, false
	}
	if model, ok := params["model"].(string); ok && model != "" {
		thread.model = model
	}
	if effort, ok := params["effort"].(string); ok && effort != "" {
		thread.reasoning = effort
	}
	return *thread, true
}

func (state *fakeCodexHistoryState) seedSyntheticHistory(params map[string]any) map[string]any {
	cwd := phase0OptionalStringParam(params, "cwd")
	threadCount := phase0IntParam(params, "threadCount", 1000)
	turnCount := phase0IntParam(params, "turnCount", 120)
	itemCount := phase0IntParam(params, "itemCount", 6)
	state.threads = []fakeCodexHistoryThread{}
	state.seededCWD = cwd
	for index := 0; index < threadCount; index++ {
		state.threads = append(state.threads, fakeCodexHistoryThread{
			cwd:          cwd,
			id:           fmt.Sprintf("thread_phase0_synthetic_%04d", index),
			model:        "gpt-5-codex",
			reasoning:    "medium",
			sourceKind:   "appServer",
			threadSource: codexThreadSourceSettaUser,
		})
	}
	transcriptThreadID := "thread_phase0_latency_transcript"
	transcript := fakeCodexHistoryThread{
		cwd:          cwd,
		id:           transcriptThreadID,
		model:        "gpt-5-codex",
		reasoning:    "medium",
		sourceKind:   "appServer",
		threadSource: codexThreadSourceSettaUser,
	}
	for turnIndex := 0; turnIndex < turnCount; turnIndex++ {
		items := []fakeCodexHistoryItem{}
		for itemIndex := 0; itemIndex < itemCount; itemIndex++ {
			items = append(items, fakeCodexHistoryItem{
				id:     fmt.Sprintf("item_phase0_%03d_%02d", turnIndex, itemIndex),
				status: "completed",
				text:   fmt.Sprintf("synthetic transcript item %03d/%02d", turnIndex, itemIndex),
				typ:    "agentMessage",
			})
		}
		transcript.turns = append(transcript.turns, fakeCodexHistoryTurn{
			id:     fmt.Sprintf("turn_phase0_%03d", turnIndex),
			items:  items,
			status: "completed",
		})
	}
	state.threads = append(state.threads, transcript)
	return map[string]any{"transcriptThreadId": transcriptThreadID}
}

func (thread fakeCodexHistoryThread) mapValue(includeTurns bool) map[string]any {
	result := map[string]any{
		"cliVersion":    "fake",
		"createdAt":     1,
		"cwd":           thread.cwd,
		"ephemeral":     false,
		"id":            thread.id,
		"modelProvider": "fake",
		"preview":       "",
		"sessionId":     "session_" + thread.id,
		"source":        map[string]any{"kind": thread.sourceKind},
		"status":        map[string]any{"type": "idle"},
		"turns":         []any{},
		"updatedAt":     2,
	}
	if thread.name != "" {
		result["name"] = thread.name
	}
	if thread.threadSource != "" {
		result["threadSource"] = thread.threadSource
	}
	if includeTurns {
		turns := []any{}
		for _, turn := range thread.turns {
			turns = append(turns, turn.mapValue("full"))
		}
		result["turns"] = turns
	}
	return result
}

func (turn fakeCodexHistoryTurn) mapValue(itemsView string) map[string]any {
	items := []any{}
	for _, item := range turn.items {
		items = append(items, item.mapValue(itemsView))
	}
	return map[string]any{
		"id":        turn.id,
		"items":     items,
		"itemsView": itemsView,
		"status":    turn.status,
	}
}

func (item fakeCodexHistoryItem) mapValue(itemsView string) map[string]any {
	result := map[string]any{
		"id":     item.id,
		"status": item.status,
		"type":   item.typ,
	}
	if itemsView == "full" {
		result["text"] = item.text
	}
	return result
}

func (goal fakeCodexHistoryGoal) mapValue(threadID string) map[string]any {
	return map[string]any{
		"createdAt":       1,
		"objective":       goal.objective,
		"status":          goal.status,
		"threadId":        threadID,
		"timeUsedSeconds": 0,
		"tokensUsed":      0,
		"updatedAt":       2,
	}
}

func (thread fakeCodexHistoryThread) settingsMap() map[string]any {
	return map[string]any{
		"approvalPolicy":    "on-request",
		"approvalsReviewer": "user",
		"collaborationMode": map[string]any{
			"mode": "default",
			"settings": map[string]any{
				"model":            thread.model,
				"reasoning_effort": thread.reasoning,
			},
		},
		"cwd":           thread.cwd,
		"effort":        thread.reasoning,
		"model":         thread.model,
		"modelProvider": "fake",
		"sandboxPolicy": map[string]any{"type": "workspaceWrite"},
	}
}

func writeFakeHistoryTurnNotifications(thread fakeCodexHistoryThread, turn fakeCodexHistoryTurn) {
	writeFakeNotification(codexapp.CodexNotificationTurnStarted, map[string]any{
		"threadId": thread.id,
		"turnId":   turn.id,
	})
	for _, item := range turn.items {
		writeFakeNotification(codexapp.CodexNotificationItemStarted, map[string]any{
			"item":        item.mapValue("full"),
			"startedAtMs": 1,
			"threadId":    thread.id,
			"turnId":      turn.id,
		})
		writeFakeNotification(codexapp.CodexNotificationItemAgentMessageDelta, map[string]any{
			"delta":    item.text,
			"itemId":   item.id,
			"threadId": thread.id,
			"turnId":   turn.id,
		})
	}
	writeFakeNotification(codexapp.CodexNotificationTurnCompleted, map[string]any{
		"threadId": thread.id,
		"turn":     turn.mapValue("full"),
	})
}

func phase0OptionalStringParam(params map[string]any, name string) string {
	value, _ := params[name].(string)
	return value
}

func phase0StringSetParam(params map[string]any, name string) map[string]struct{} {
	values := map[string]struct{}{}
	rawValues, ok := params[name].([]any)
	if !ok {
		return values
	}
	for _, raw := range rawValues {
		value, ok := raw.(string)
		if ok && value != "" {
			values[value] = struct{}{}
		}
	}
	return values
}

func phase0IntParam(params map[string]any, name string, fallback int) int {
	raw, ok := params[name]
	if !ok || raw == nil {
		return fallback
	}
	switch value := raw.(type) {
	case float64:
		return int(value)
	case string:
		var result int
		if _, err := fmt.Sscanf(value, "%d", &result); err == nil {
			return result
		}
	}
	return fallback
}
