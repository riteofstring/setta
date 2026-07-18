package chat

import "time"

const (
	backgroundTerminalOutputBatchLimit = 64
	backgroundTerminalOutputBatchDelay = 25 * time.Millisecond
)

type backgroundTerminalOutputBatchKey struct {
	workspaceID       string
	conversationID    string
	providerItemID    string
	providerProcessID string
}

type backgroundTerminalOutputEntry struct {
	stream string
	text   string
}

func (service *Service) enqueueBackgroundTerminalOutputFromProvider(workspaceID string, conversationID string, providerItemID string, providerProcessID string, stream string, text string) error {
	if text == "" {
		return nil
	}
	key := backgroundTerminalOutputBatchKeyFor(workspaceID, conversationID, providerItemID, providerProcessID)
	entry := backgroundTerminalOutputEntry{stream: stream, text: text}

	service.backgroundOutputMu.Lock()
	service.backgroundOutputBatches[key] = append(service.backgroundOutputBatches[key], entry)
	if len(service.backgroundOutputBatches[key]) == 1 {
		service.backgroundOutputTimers[key] = time.AfterFunc(backgroundTerminalOutputBatchDelay, func() {
			service.flushBackgroundTerminalOutputBatchAsync(key)
		})
	}
	if len(service.backgroundOutputBatches[key]) < backgroundTerminalOutputBatchLimit {
		service.backgroundOutputMu.Unlock()
		return nil
	}
	entries := service.takeBackgroundTerminalOutputBatchLocked(key)
	startWorker := service.enqueueBackgroundTerminalOutputFlushLocked(key, entries)
	service.backgroundOutputMu.Unlock()

	if startWorker {
		go service.runBackgroundTerminalOutputFlushQueue(key)
	}
	return nil
}

func (service *Service) flushBackgroundTerminalOutputBatchAsync(key backgroundTerminalOutputBatchKey) {
	service.backgroundOutputMu.Lock()
	entries := service.takeBackgroundTerminalOutputBatchLocked(key)
	if len(entries) == 0 {
		service.backgroundOutputMu.Unlock()
		return
	}
	startWorker := service.enqueueBackgroundTerminalOutputFlushLocked(key, entries)
	service.backgroundOutputMu.Unlock()

	if startWorker {
		service.runBackgroundTerminalOutputFlushQueue(key)
	}
}

func (service *Service) flushBackgroundTerminalOutputFromProvider(workspaceID string, conversationID string, providerItemID string, providerProcessID string) error {
	key := backgroundTerminalOutputBatchKeyFor(workspaceID, conversationID, providerItemID, providerProcessID)
	for {
		service.backgroundOutputMu.Lock()
		if service.backgroundOutputInflight[key] > 0 {
			wait := make(chan struct{})
			service.backgroundOutputWaiters[key] = append(service.backgroundOutputWaiters[key], wait)
			service.backgroundOutputMu.Unlock()
			<-wait
			continue
		}
		entries := service.takeBackgroundTerminalOutputBatchLocked(key)
		if len(entries) > 0 {
			service.backgroundOutputMu.Unlock()
			if err := service.appendBackgroundTerminalOutputBatchFromProvider(key, entries); err != nil {
				return err
			}
			continue
		}
		service.cleanupBackgroundTerminalOutputBatchLocked(key)
		service.backgroundOutputMu.Unlock()
		return nil
	}
}

func backgroundTerminalOutputBatchKeyFor(workspaceID string, conversationID string, providerItemID string, providerProcessID string) backgroundTerminalOutputBatchKey {
	key := backgroundTerminalOutputBatchKey{
		workspaceID:       workspaceID,
		conversationID:    conversationID,
		providerItemID:    providerItemID,
		providerProcessID: providerProcessID,
	}
	if key.providerItemID != "" {
		key.providerProcessID = ""
	}
	return key
}

func (service *Service) takeBackgroundTerminalOutputBatchLocked(key backgroundTerminalOutputBatchKey) []backgroundTerminalOutputEntry {
	timer := service.backgroundOutputTimers[key]
	if timer != nil {
		timer.Stop()
		delete(service.backgroundOutputTimers, key)
	}
	entries := service.backgroundOutputBatches[key]
	delete(service.backgroundOutputBatches, key)
	return entries
}

func (service *Service) enqueueBackgroundTerminalOutputFlushLocked(key backgroundTerminalOutputBatchKey, entries []backgroundTerminalOutputEntry) bool {
	if len(entries) == 0 {
		return false
	}
	service.backgroundOutputFlushes[key] = append(service.backgroundOutputFlushes[key], entries)
	if service.backgroundOutputInflight[key] > 0 {
		return false
	}
	service.backgroundOutputInflight[key] = 1
	return true
}

func (service *Service) runBackgroundTerminalOutputFlushQueue(key backgroundTerminalOutputBatchKey) {
	for {
		entries, done := service.nextBackgroundTerminalOutputFlush(key)
		if done {
			return
		}
		if err := service.appendBackgroundTerminalOutputBatchFromProvider(key, entries); err != nil {
			service.recordCorruptStateDiagnostic(err, key.workspaceID, key.conversationID, "")
		}
	}
}

func (service *Service) nextBackgroundTerminalOutputFlush(key backgroundTerminalOutputBatchKey) ([]backgroundTerminalOutputEntry, bool) {
	service.backgroundOutputMu.Lock()
	defer service.backgroundOutputMu.Unlock()
	queue := service.backgroundOutputFlushes[key]
	if len(queue) > 0 {
		entries := queue[0]
		if len(queue) == 1 {
			delete(service.backgroundOutputFlushes, key)
		} else {
			service.backgroundOutputFlushes[key] = queue[1:]
		}
		return entries, false
	}
	delete(service.backgroundOutputInflight, key)
	waiters := service.backgroundOutputWaiters[key]
	delete(service.backgroundOutputWaiters, key)
	for _, waiter := range waiters {
		close(waiter)
	}
	if len(service.backgroundOutputBatches[key]) == 0 {
		service.cleanupBackgroundTerminalOutputBatchLocked(key)
	}
	return nil, true
}

func (service *Service) cleanupBackgroundTerminalOutputBatchLocked(key backgroundTerminalOutputBatchKey) {
	delete(service.backgroundOutputBatches, key)
	delete(service.backgroundOutputFlushes, key)
	delete(service.backgroundOutputTimers, key)
	delete(service.backgroundOutputInflight, key)
	delete(service.backgroundOutputWaiters, key)
}

func (service *Service) appendBackgroundTerminalOutputBatchFromProvider(key backgroundTerminalOutputBatchKey, entries []backgroundTerminalOutputEntry) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	process, ok, err := service.findBackgroundTerminalLocked(key.workspaceID, key.conversationID, key.providerItemID, key.providerProcessID)
	if err != nil {
		return err
	}
	if !ok {
		process, ok, err = service.promoteBackgroundTerminalStartupByProviderLocked(key.workspaceID, key.conversationID, key.providerItemID)
		if err != nil || !ok {
			return err
		}
	}
	return service.appendBackgroundTerminalOutputBatchLocked(process, entries)
}
