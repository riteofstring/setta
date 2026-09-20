package coordinator

import "context"

func (coordinator *Coordinator) SubscribeSnapshots() (<-chan Snapshot, func()) {
	if coordinator == nil {
		stream := make(chan Snapshot)
		close(stream)
		return stream, func() {}
	}

	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		stream := make(chan Snapshot)
		close(stream)
		return stream, func() {}
	}
	ctx, cancel := context.WithCancel(context.Background())
	stream, err := coordinator.snapshots.Subscribe(ctx)
	coordinator.mu.Unlock()
	if err != nil {
		cancel()
		closed := make(chan Snapshot)
		close(closed)
		return closed, func() {}
	}
	return stream, cancel
}

func (coordinator *Coordinator) publishSnapshotLocked() {
	_ = coordinator.snapshots.Publish(coordinator.snapshot)
}

func cloneSnapshotForPublication(snapshot Snapshot) (Snapshot, error) {
	return snapshot.Clone(), nil
}
