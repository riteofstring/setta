package coordinator

import "sync"

// SubscribeSnapshots returns a latest-value stream of canonical publications.
// The first value is always the current snapshot, so a client that reconnects
// catches up without polling or replay bookkeeping. Slow subscribers may skip
// superseded intermediate publications but always retain the newest value.
func (coordinator *Coordinator) SubscribeSnapshots() (<-chan Snapshot, func()) {
	stream := make(chan Snapshot, 1)
	if coordinator == nil {
		close(stream)
		return stream, func() {}
	}

	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		close(stream)
		return stream, func() {}
	}
	coordinator.nextSnapshotSubscriber++
	subscriberID := coordinator.nextSnapshotSubscriber
	if coordinator.snapshotSubscribers == nil {
		coordinator.snapshotSubscribers = make(map[uint64]chan Snapshot)
	}
	coordinator.snapshotSubscribers[subscriberID] = stream
	stream <- coordinator.snapshot.Clone()
	coordinator.mu.Unlock()

	var once sync.Once
	return stream, func() {
		once.Do(func() {
			coordinator.mu.Lock()
			if subscriber, exists := coordinator.snapshotSubscribers[subscriberID]; exists {
				delete(coordinator.snapshotSubscribers, subscriberID)
				close(subscriber)
			}
			coordinator.mu.Unlock()
		})
	}
}

// publishSnapshotLocked offers one independent clone to every subscriber. The
// coordinator mutation lock must be held by the caller.
func (coordinator *Coordinator) publishSnapshotLocked() {
	for _, subscriber := range coordinator.snapshotSubscribers {
		snapshot := coordinator.snapshot.Clone()
		select {
		case subscriber <- snapshot:
			continue
		default:
		}
		select {
		case <-subscriber:
		default:
		}
		subscriber <- snapshot
	}
}
