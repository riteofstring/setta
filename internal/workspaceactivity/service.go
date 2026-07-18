package workspaceactivity

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

const (
	defaultSnapshotLimit         = 200
	maxSnapshotLimit             = 500
	snapshotRunActivityPageLimit = maxSnapshotLimit
)

type ChatSource interface {
	ListWorkflowConversations(workspaceID string) ([]chat.Conversation, error)
	ListRuns(workspaceID string, conversationID string) ([]chat.Run, error)
	LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (chat.MessagePage, error)
	LoadRunActivityItemsBefore(workspaceID string, runID string, beforeItemID string, limit int) ([]chat.RunItem, string, bool, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
}

type WorkflowSource interface {
	ListExecutions(workspaceID string) ([]orchestrator.WorkflowExecution, error)
	ReadExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error)
	ReadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (orchestrator.WorkflowExecutionEventPage, error)
	SubscribeEvents(cursor orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error)
}

type Service struct {
	chat     ChatSource
	workflow WorkflowSource
	hub      *EventHub

	cancel               context.CancelFunc
	chatSubscription     *chat.EventSubscription
	workflowSubscription *orchestrator.EventSubscription
	wg                   sync.WaitGroup

	mu                    sync.Mutex
	conversationWorkflows map[string]*chat.ConversationWorkflowMetadata
	records               map[string]WorkspaceActivityRecord
}

type Option func(*serviceOptions)

type serviceOptions struct {
	bufferSize int
	newID      func(prefix string) (string, error)
	now        func() time.Time
}

func NewService(chatSource ChatSource, workflowSource WorkflowSource, options ...Option) (*Service, error) {
	if chatSource == nil {
		return nil, errors.New("workspace activity chat source is required")
	}
	if workflowSource == nil {
		return nil, errors.New("workspace activity workflow source is required")
	}
	config := serviceOptions{
		bufferSize: defaultEventBufferSize,
		newID:      randomID,
		now:        time.Now,
	}
	for _, option := range options {
		option(&config)
	}
	streamID, err := config.newID("workspace_activity_stream")
	if err != nil {
		return nil, fmt.Errorf("create workspace activity stream id: %w", err)
	}
	hub, err := NewEventHub(streamID, WithEventClock(config.now), WithEventBufferSize(config.bufferSize))
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	service := &Service{
		cancel:                cancel,
		chat:                  chatSource,
		conversationWorkflows: map[string]*chat.ConversationWorkflowMetadata{},
		hub:                   hub,
		records:               map[string]WorkspaceActivityRecord{},
		workflow:              workflowSource,
	}
	if err := service.startSubscriptions(ctx); err != nil {
		cancel()
		hub.Close()
		return nil, err
	}
	return service, nil
}

func WithIDGenerator(newID func(prefix string) (string, error)) Option {
	return func(options *serviceOptions) {
		options.newID = newID
	}
}

func WithClock(now func() time.Time) Option {
	return func(options *serviceOptions) {
		options.now = now
	}
}

func WithActivityEventBufferSize(size int) Option {
	return func(options *serviceOptions) {
		options.bufferSize = size
	}
}

func (service *Service) ReadSnapshot(workspaceID string, limit int) (WorkspaceActivitySnapshot, error) {
	limit = normalizeLimit(limit)
	state := service.hub.State()
	builder := newSnapshotBuilder(state.Revision, limit)
	if err := service.addWorkflowSnapshotRecords(builder, workspaceID, limit); err != nil {
		return WorkspaceActivitySnapshot{}, err
	}
	if err := service.addChatSnapshotRecords(builder, workspaceID, limit); err != nil {
		return WorkspaceActivitySnapshot{}, err
	}
	return WorkspaceActivitySnapshot{
		Activities:    builder.activities(),
		Revision:      state.Revision,
		SchemaVersion: SchemaVersion,
		Sequence:      state.Sequence,
		StreamID:      state.StreamID,
		WorkspaceID:   workspaceID,
	}, nil
}

// ReadExecutionSnapshot returns a workspace activity snapshot scoped to a single
// workflow execution. It is the durable source for historical run activity: the
// workspace-wide snapshot is bounded across every execution, so an older run's chips
// can be evicted by newer activity, and its records skew toward transient
// scheduled/started entries. Scoping to one execution lets the builder page through
// the selected run's terminal, command, file-change, and approval activity before the
// final snapshot limit is applied.
func (service *Service) ReadExecutionSnapshot(workspaceID string, executionID string, limit int) (WorkspaceActivitySnapshot, error) {
	limit = normalizeLimit(limit)
	state := service.hub.State()
	builder := newSnapshotBuilder(state.Revision, limit)
	if err := service.addExecutionSnapshotRecords(builder, workspaceID, executionID, limit); err != nil {
		return WorkspaceActivitySnapshot{}, err
	}
	if err := service.addExecutionChatSnapshotRecords(builder, workspaceID, executionID, limit); err != nil {
		return WorkspaceActivitySnapshot{}, err
	}
	return WorkspaceActivitySnapshot{
		Activities:    builder.activities(),
		Revision:      state.Revision,
		SchemaVersion: SchemaVersion,
		Sequence:      state.Sequence,
		StreamID:      state.StreamID,
		WorkspaceID:   workspaceID,
	}, nil
}

func (service *Service) SubscribeEvents(cursor EventCursor, workspaceID string) (*EventSubscription, error) {
	return service.hub.Subscribe(cursor, workspaceID)
}

func (service *Service) CloseEvents() {
	if service == nil {
		return
	}
	service.cancel()
	if service.chatSubscription != nil {
		service.chatSubscription.Unsubscribe()
	}
	if service.workflowSubscription != nil {
		service.workflowSubscription.Unsubscribe()
	}
	service.wg.Wait()
	service.hub.Close()
}

func (service *Service) startSubscriptions(ctx context.Context) error {
	chatSubscription, err := service.chat.SubscribeEvents(chat.EventCursor{})
	if err != nil {
		return fmt.Errorf("subscribe chat events for workspace activity: %w", err)
	}
	workflowSubscription, err := service.workflow.SubscribeEvents(orchestrator.WorkflowEventCursor{})
	if err != nil {
		chatSubscription.Unsubscribe()
		return fmt.Errorf("subscribe workflow events for workspace activity: %w", err)
	}
	service.chatSubscription = chatSubscription
	service.workflowSubscription = workflowSubscription
	service.wg.Add(2)
	go service.consumeChatEvents(ctx, chatSubscription)
	go service.consumeWorkflowEvents(ctx, workflowSubscription)
	return nil
}

func (service *Service) consumeChatEvents(ctx context.Context, subscription *chat.EventSubscription) {
	defer service.wg.Done()
	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := service.handleChatEvent(event); err != nil {
				panic(err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (service *Service) consumeWorkflowEvents(ctx context.Context, subscription *orchestrator.EventSubscription) {
	defer service.wg.Done()
	for {
		select {
		case envelope, ok := <-subscription.Events:
			if !ok {
				return
			}
			if err := service.handleWorkflowEvent(envelope); err != nil {
				panic(err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (service *Service) handleChatEvent(event chat.Event) error {
	var item chat.RunItem
	switch event.Type {
	case chat.EventTypeRunItemCreated:
		var payload chat.RunItemCreatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return fmt.Errorf("decode chat run item created activity event %s: %w", event.EventID, err)
		}
		item = payload.Item
	case chat.EventTypeRunItemUpdated:
		var payload chat.RunItemUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return fmt.Errorf("decode chat run item updated activity event %s: %w", event.EventID, err)
		}
		item = payload.Item
	default:
		return nil
	}
	workflowMetadata, err := service.workflowMetadataForConversation(item.WorkspaceID, item.ConversationID)
	if err != nil {
		return err
	}
	record, ok, err := ActivityRecordFromChatRunItem(item, ChatRunItemContext{
		ConversationWorkflow: workflowMetadata,
		Event:                &event,
	})
	if err != nil || !ok {
		return err
	}
	return service.publishUpsert(record)
}

func (service *Service) handleWorkflowEvent(envelope orchestrator.WorkflowEventEnvelope) error {
	sequence := envelope.Sequence
	records, err := ActivityRecordsFromWorkflowEvent(envelope.Event, WorkflowEventContext{
		StreamID:       envelope.StreamID,
		StreamSequence: &sequence,
	})
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := service.publishUpsert(record); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) publishUpsert(record WorkspaceActivityRecord) error {
	merged := service.mergeLiveRecord(record)
	event, err := service.hub.PublishUpsert(merged)
	if err != nil {
		return err
	}
	if event.Delta != nil && event.Delta.Activity != nil {
		service.storeLiveRecord(*event.Delta.Activity)
	}
	return nil
}

func (service *Service) mergeLiveRecord(next WorkspaceActivityRecord) WorkspaceActivityRecord {
	service.mu.Lock()
	defer service.mu.Unlock()
	existing, ok := service.records[next.ActivityID]
	if !ok {
		return next
	}
	return mergeActivityRecord(existing, next)
}

func (service *Service) storeLiveRecord(record WorkspaceActivityRecord) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.records[record.ActivityID] = record
}

func (service *Service) workflowMetadataForConversation(workspaceID string, conversationID string) (*chat.ConversationWorkflowMetadata, error) {
	key := workspaceID + "\x00" + conversationID
	service.mu.Lock()
	if metadata, ok := service.conversationWorkflows[key]; ok {
		service.mu.Unlock()
		return metadata, nil
	}
	service.mu.Unlock()

	page, err := service.chat.LoadMessagePage(workspaceID, conversationID, 0, 1)
	if err != nil {
		return nil, err
	}
	var metadata *chat.ConversationWorkflowMetadata
	if page.Conversation.Internal && page.Conversation.Workflow != nil {
		next := *page.Conversation.Workflow
		metadata = &next
	}
	service.mu.Lock()
	service.conversationWorkflows[key] = metadata
	service.mu.Unlock()
	return metadata, nil
}

func (service *Service) addWorkflowSnapshotRecords(builder *snapshotBuilder, workspaceID string, limit int) error {
	executions, err := service.workflow.ListExecutions(workspaceID)
	if err != nil {
		return err
	}
	for _, execution := range executions {
		if err := service.addExecutionWorkflowRecords(builder, workspaceID, execution, limit); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) addExecutionSnapshotRecords(builder *snapshotBuilder, workspaceID string, executionID string, limit int) error {
	execution, err := service.workflow.ReadExecution(workspaceID, executionID)
	if err != nil {
		return err
	}
	return service.addExecutionWorkflowRecords(builder, workspaceID, execution, limit)
}

func (service *Service) addExecutionWorkflowRecords(builder *snapshotBuilder, workspaceID string, execution orchestrator.WorkflowExecution, limit int) error {
	page, err := service.workflow.ReadExecutionEventPage(workspaceID, execution.ID, 0, limit)
	if err != nil {
		return err
	}
	terminalNodeExecutionIDs := map[string]struct{}{}
	for _, event := range page.Events {
		records, err := ActivityRecordsFromWorkflowEvent(event, WorkflowEventContext{Revision: builder.revision})
		if err != nil {
			return err
		}
		for _, record := range records {
			builder.upsert(record)
			if nodeExecutionID, ok := TerminalStatusNodeExecutionID(record); ok {
				terminalNodeExecutionIDs[nodeExecutionID] = struct{}{}
			}
		}
	}
	// Only a terminal execution needs synthesized terminal node activity. A running
	// execution's live event stream already supplies node chips, and synthesizing terminal
	// records for nodes that merely finished early (for example an entry node) would inject
	// chips the live run never showed. Once the run reaches a terminal state, nodes left
	// in-flight at termination have no per-node terminal event, so synthesis fills that gap.
	if executionIsTerminal(execution.Status) {
		for _, record := range TerminalNodeActivityRecords(execution, terminalNodeExecutionIDs, WorkflowEventContext{Revision: builder.revision}) {
			builder.upsert(record)
		}
	}
	return nil
}

func executionIsTerminal(status orchestrator.WorkflowExecutionStatus) bool {
	switch status {
	case orchestrator.ExecutionStatusCompleted,
		orchestrator.ExecutionStatusFailed,
		orchestrator.ExecutionStatusStopped,
		orchestrator.ExecutionStatusCancelled:
		return true
	default:
		return false
	}
}

func (service *Service) addChatSnapshotRecords(builder *snapshotBuilder, workspaceID string, limit int) error {
	conversations, err := service.chat.ListWorkflowConversations(workspaceID)
	if err != nil {
		return err
	}
	for _, conversation := range conversations {
		if err := service.addConversationSnapshotRecords(builder, workspaceID, conversation, limit); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) addExecutionChatSnapshotRecords(builder *snapshotBuilder, workspaceID string, executionID string, limit int) error {
	conversations, err := service.chat.ListWorkflowConversations(workspaceID)
	if err != nil {
		return err
	}
	for _, conversation := range conversations {
		if conversation.Workflow == nil || conversation.Workflow.ExecutionID != executionID {
			continue
		}
		if err := service.addConversationSnapshotRecords(builder, workspaceID, conversation, limit); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) addConversationSnapshotRecords(builder *snapshotBuilder, workspaceID string, conversation chat.Conversation, limit int) error {
	runs, err := service.chat.ListRuns(workspaceID, conversation.ID)
	if err != nil {
		return err
	}
	for _, run := range runs {
		if err := service.addRunSnapshotRecords(builder, workspaceID, conversation, run, limit); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) addRunSnapshotRecords(builder *snapshotBuilder, workspaceID string, conversation chat.Conversation, run chat.Run, limit int) error {
	beforeItemID := ""
	added := 0
	for added < limit {
		items, nextBeforeItemID, hasMoreItems, err := service.chat.LoadRunActivityItemsBefore(workspaceID, run.ID, beforeItemID, snapshotRunActivityPageLimit)
		if err != nil {
			return err
		}
		recordsAdded, err := addRunItemSnapshotRecords(builder, conversation, items)
		if err != nil {
			return err
		}
		added += recordsAdded
		if !hasMoreItems {
			return nil
		}
		if nextBeforeItemID == "" {
			return errors.New("run activity item tail page indicated more items without a next before item id")
		}
		beforeItemID = nextBeforeItemID
	}
	return nil
}

func addRunItemSnapshotRecords(builder *snapshotBuilder, conversation chat.Conversation, items []chat.RunItem) (int, error) {
	added := 0
	for _, runItem := range items {
		record, ok, err := ActivityRecordFromChatRunItem(runItem, ChatRunItemContext{
			ConversationWorkflow: conversation.Workflow,
			Revision:             builder.revision,
		})
		if err != nil {
			return 0, err
		}
		if ok {
			builder.upsert(record)
			added++
		}
	}
	return added, nil
}

type snapshotBuilder struct {
	limit    int
	records  map[string]WorkspaceActivityRecord
	revision int
}

func newSnapshotBuilder(revision int, limit int) *snapshotBuilder {
	return &snapshotBuilder{
		limit:    limit,
		records:  map[string]WorkspaceActivityRecord{},
		revision: revision,
	}
}

func (builder *snapshotBuilder) upsert(next WorkspaceActivityRecord) {
	if next.Revision == 0 {
		next.Revision = builder.revision
	}
	existing, ok := builder.records[next.ActivityID]
	if ok {
		next = mergeActivityRecord(existing, next)
	}
	builder.records[next.ActivityID] = next
}

func (builder *snapshotBuilder) activities() []WorkspaceActivityRecord {
	records := make([]WorkspaceActivityRecord, 0, len(builder.records))
	for _, record := range builder.records {
		records = append(records, record)
	}
	sort.Slice(records, func(left int, right int) bool {
		leftTime := firstNonEmpty(records[left].UpdatedAt, records[left].OccurredAt)
		rightTime := firstNonEmpty(records[right].UpdatedAt, records[right].OccurredAt)
		if leftTime == rightTime {
			return records[left].ActivityID < records[right].ActivityID
		}
		return leftTime > rightTime
	})
	if len(records) > builder.limit {
		records = records[:builder.limit]
	}
	return records
}

func mergeActivityRecord(existing WorkspaceActivityRecord, next WorkspaceActivityRecord) WorkspaceActivityRecord {
	if next.GraphAnchor == nil {
		next.GraphAnchor = existing.GraphAnchor
	}
	if next.OccurredAt == "" {
		next.OccurredAt = existing.OccurredAt
	}
	if next.UpdatedAt == "" {
		next.UpdatedAt = existing.UpdatedAt
	}
	next.Provenance = mergeProvenance(existing.Provenance, next.Provenance)
	if next.Command == nil {
		next.Command = existing.Command
	}
	if next.FileChange == nil {
		next.FileChange = existing.FileChange
	}
	if next.Workflow == nil {
		next.Workflow = existing.Workflow
	}
	next.Approval = mergeApproval(existing.Approval, next.Approval)
	if next.DetailRef.Kind == "" {
		next.DetailRef = existing.DetailRef
	}
	return next
}

func mergeProvenance(existing WorkspaceActivityProvenance, next WorkspaceActivityProvenance) WorkspaceActivityProvenance {
	next = mergeWorkflowIdentityProvenance(existing, next)
	next = mergeWorkflowEventProvenance(existing, next)
	next = mergeRunnerProvenance(existing, next)
	return mergeChatProvenance(existing, next)
}

func mergeWorkflowIdentityProvenance(existing WorkspaceActivityProvenance, next WorkspaceActivityProvenance) WorkspaceActivityProvenance {
	if next.WorkflowDefinitionID == "" {
		next.WorkflowDefinitionID = existing.WorkflowDefinitionID
	}
	if next.WorkflowDefinitionVersionID == "" {
		next.WorkflowDefinitionVersionID = existing.WorkflowDefinitionVersionID
	}
	if next.WorkflowExecutionID == "" {
		next.WorkflowExecutionID = existing.WorkflowExecutionID
	}
	if next.WorkflowNodeID == "" {
		next.WorkflowNodeID = existing.WorkflowNodeID
	}
	if next.WorkflowNodeExecutionID == "" {
		next.WorkflowNodeExecutionID = existing.WorkflowNodeExecutionID
	}
	return next
}

func mergeWorkflowEventProvenance(existing WorkspaceActivityProvenance, next WorkspaceActivityProvenance) WorkspaceActivityProvenance {
	if next.WorkflowEventID == "" {
		next.WorkflowEventID = existing.WorkflowEventID
	}
	if next.WorkflowEventType == nil {
		next.WorkflowEventType = existing.WorkflowEventType
	}
	if next.WorkflowEventOrdinal == 0 {
		next.WorkflowEventOrdinal = existing.WorkflowEventOrdinal
	}
	if next.WorkflowEventStreamID == "" {
		next.WorkflowEventStreamID = existing.WorkflowEventStreamID
	}
	if next.WorkflowEventStreamSequence == nil {
		next.WorkflowEventStreamSequence = existing.WorkflowEventStreamSequence
	}
	return next
}

func mergeRunnerProvenance(existing WorkspaceActivityProvenance, next WorkspaceActivityProvenance) WorkspaceActivityProvenance {
	if next.RunnerEventID == "" {
		next.RunnerEventID = existing.RunnerEventID
	}
	if next.RunnerEventType == nil {
		next.RunnerEventType = existing.RunnerEventType
	}
	if next.RunnerEventOrdinal == 0 {
		next.RunnerEventOrdinal = existing.RunnerEventOrdinal
	}
	return next
}

func mergeChatProvenance(existing WorkspaceActivityProvenance, next WorkspaceActivityProvenance) WorkspaceActivityProvenance {
	if next.ChatConversationID == "" {
		next.ChatConversationID = existing.ChatConversationID
	}
	if next.ChatRunID == "" {
		next.ChatRunID = existing.ChatRunID
	}
	if next.ChatMessageID == "" {
		next.ChatMessageID = existing.ChatMessageID
	}
	if next.RunItemID == "" {
		next.RunItemID = existing.RunItemID
	}
	if next.ProviderItemID == "" {
		next.ProviderItemID = existing.ProviderItemID
	}
	if next.ChatEventID == "" {
		next.ChatEventID = existing.ChatEventID
	}
	if next.ChatEventStreamID == "" {
		next.ChatEventStreamID = existing.ChatEventStreamID
	}
	if next.ChatEventSequence == 0 {
		next.ChatEventSequence = existing.ChatEventSequence
	}
	return next
}

func mergeApproval(existing *WorkspaceActivityApproval, next *WorkspaceActivityApproval) *WorkspaceActivityApproval {
	if existing == nil {
		return next
	}
	if next == nil {
		return existing
	}
	if next.Kind == nil {
		next.Kind = existing.Kind
	}
	if next.Title == "" {
		next.Title = existing.Title
	}
	if next.TargetLabel == "" {
		next.TargetLabel = existing.TargetLabel
	}
	if next.CommandPreview == "" {
		next.CommandPreview = existing.CommandPreview
	}
	if next.FilePath == "" {
		next.FilePath = existing.FilePath
	}
	if next.Permission == "" {
		next.Permission = existing.Permission
	}
	return next
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return defaultSnapshotLimit
	}
	if limit > maxSnapshotLimit {
		return maxSnapshotLimit
	}
	return limit
}

func randomID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}
