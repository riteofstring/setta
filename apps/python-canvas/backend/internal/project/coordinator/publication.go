package coordinator

import "sync"

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
