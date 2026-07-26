package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"setta/internal/codexapp"
)

const providerThreadExistenceListLimit = 100

type ProviderThreadMissingError struct {
	Operation string
	ThreadID  string
	Err       error
}

func (err *ProviderThreadMissingError) Error() string {
	if err == nil {
		return "provider thread is missing"
	}
	if err.Err == nil {
		return fmt.Sprintf("%s %s: provider thread is missing", err.Operation, err.ThreadID)
	}
	return fmt.Sprintf("%s %s: provider thread is missing: %v", err.Operation, err.ThreadID, err.Err)
}

func (err *ProviderThreadMissingError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Err
}

func IsProviderThreadMissing(err error) bool {
	var missing *ProviderThreadMissingError
	return errors.As(err, &missing)
}

func providerThreadOperationError(operation string, threadID string, err error) error {
	if providerRPCThreadMissing(err) {
		return &ProviderThreadMissingError{Operation: operation, ThreadID: threadID, Err: err}
	}
	return fmt.Errorf("%s %s: %w", operation, threadID, err)
}

func (runtime *Runtime) resumeThreadOperationError(ctx context.Context, threadID string, err error) error {
	if providerRPCThreadMissing(err) {
		runtime.forgetAttachedThread(threadID)
		return &ProviderThreadMissingError{Operation: "resume agent thread", ThreadID: threadID, Err: err}
	}
	missing, checkErr := runtime.providerThreadMissingByList(ctx, threadID)
	if checkErr != nil {
		return fmt.Errorf(
			"resume agent thread %s: %w",
			threadID,
			errors.Join(err, fmt.Errorf("confirm provider thread existence through thread/list: %w", checkErr)),
		)
	}
	if missing {
		runtime.forgetAttachedThread(threadID)
		return &ProviderThreadMissingError{Operation: "resume agent thread", ThreadID: threadID, Err: err}
	}
	return fmt.Errorf("resume agent thread %s: %w", threadID, err)
}

func (runtime *Runtime) providerThreadMissingByList(ctx context.Context, threadID string) (bool, error) {
	for _, archived := range []bool{false, true} {
		exists, err := runtime.providerThreadExistsInList(ctx, threadID, archived)
		if err != nil {
			return false, err
		}
		if exists {
			return false, nil
		}
	}
	return true, nil
}

func (runtime *Runtime) providerThreadExistsInList(
	ctx context.Context,
	threadID string,
	archived bool,
) (bool, error) {
	var cursor *string
	seenCursors := map[string]struct{}{}
	for {
		limit := providerThreadExistenceListLimit
		raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadList, codexapp.ThreadListParams{
			Archived: &archived,
			Cursor:   cursor,
			Limit:    &limit,
		})
		if err != nil {
			return false, err
		}
		response, err := codexapp.DecodeThreadListResponse(raw)
		if err != nil {
			return false, fmt.Errorf("decode provider thread existence list %s: %w", threadID, err)
		}
		for _, thread := range response.Data {
			if thread.ID == threadID {
				return true, nil
			}
		}
		if response.NextCursor == nil || strings.TrimSpace(*response.NextCursor) == "" {
			return false, nil
		}
		next := *response.NextCursor
		if _, ok := seenCursors[next]; ok {
			return false, fmt.Errorf("provider thread existence list repeated cursor %q", next)
		}
		seenCursors[next] = struct{}{}
		cursor = &next
	}
}

func providerRPCThreadMissing(err error) bool {
	var rpcErr *codexapp.RPCError
	if !errors.As(err, &rpcErr) || len(rpcErr.Data) == 0 {
		return false
	}
	var data providerErrorData
	if json.Unmarshal(rpcErr.Data, &data) != nil {
		return false
	}
	return data.hasCode("thread_not_found")
}

type providerErrorData struct {
	Code   string             `json:"code"`
	Type   string             `json:"type"`
	Kind   string             `json:"kind"`
	Reason string             `json:"reason"`
	Error  *providerErrorData `json:"error"`
}

func (data providerErrorData) hasCode(code string) bool {
	return data.Code == code ||
		data.Type == code ||
		data.Kind == code ||
		data.Reason == code ||
		(data.Error != nil && data.Error.hasCode(code))
}

func (runtime *Runtime) attachedThread(
	threadID string,
	request StartThreadRequest,
	fingerprint string,
) (Thread, bool) {
	if request.Invocation.ModelSelectionProviderDefault {
		return Thread{}, false
	}
	generation := runtime.manager.Generation()
	if generation == 0 {
		return Thread{}, false
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	attachment, ok := runtime.attachedThreads[threadID]
	if !ok || attachment.generation != generation || attachment.fingerprint != fingerprint {
		return Thread{}, false
	}
	return attachment.thread, true
}

func (runtime *Runtime) rememberAttachedThread(thread Thread, request StartThreadRequest) {
	if runtime == nil || runtime.manager == nil || request.Invocation.ModelSelectionProviderDefault {
		return
	}
	params, err := resumeThreadParams(thread.ID, request)
	if err != nil {
		return
	}
	fingerprint, err := attachedThreadFingerprint(params)
	if err != nil {
		return
	}
	generation := runtime.manager.Generation()
	if generation == 0 {
		return
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.attachedThreads[thread.ID] = threadAttachment{
		fingerprint: fingerprint,
		generation:  generation,
		thread:      thread,
	}
}

func (runtime *Runtime) forgetAttachedThread(threadID string) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	delete(runtime.attachedThreads, threadID)
}

func (runtime *Runtime) rememberCreatedDurableThread(thread Thread) {
	if runtime == nil || !runtime.deleteDurableThreadsOnShutdown || thread.Ephemeral || strings.TrimSpace(thread.ID) == "" {
		return
	}
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	runtime.createdDurableThreads[thread.ID] = struct{}{}
}

func (runtime *Runtime) forgetCreatedDurableThread(threadID string) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	delete(runtime.createdDurableThreads, threadID)
}

func (runtime *Runtime) createdDurableThreadIDs() []string {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	threadIDs := make([]string, 0, len(runtime.createdDurableThreads))
	for threadID := range runtime.createdDurableThreads {
		threadIDs = append(threadIDs, threadID)
	}
	sort.Strings(threadIDs)
	return threadIDs
}

func (runtime *Runtime) deleteCreatedDurableThreads(ctx context.Context) error {
	var cleanupErrors []error
	for _, threadID := range runtime.createdDurableThreadIDs() {
		if err := runtime.DeleteThread(ctx, threadID); err != nil {
			if IsProviderThreadMissing(err) {
				continue
			}
			if archiveErr := runtime.ArchiveThread(ctx, threadID); archiveErr != nil {
				cleanupErrors = append(cleanupErrors, errors.Join(err, archiveErr))
				continue
			}
			runtime.forgetAttachedThread(threadID)
			runtime.forgetCreatedDurableThread(threadID)
		}
	}
	return errors.Join(cleanupErrors...)
}

func attachedThreadFingerprint(params codexapp.ThreadResumeParams) (string, error) {
	encoded, err := json.Marshal(params)
	if err != nil {
		return "", fmt.Errorf("fingerprint thread resume configuration: %w", err)
	}
	return string(encoded), nil
}
