package chat

import (
	"sync"
	"testing"
)

func TestCodexHarnessActiveTurnSnapshotIsConcurrentSafe(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("stream"))
	const runID = "run_goal"
	harness.mu.Lock()
	harness.active[runID] = &codexActiveTurn{
		threadID:      "thread_goal",
		turnID:        "turn_goal_a",
		logicalTurnID: "turn_goal_a",
	}
	harness.mu.Unlock()

	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		for i := 0; i < 1000; i++ {
			physicalTurnID := "turn_goal_b"
			if i%2 == 0 {
				physicalTurnID = "turn_goal_c"
			}
			harness.updateActiveGoalTurn(runID, "thread_goal", "turn_goal_a", physicalTurnID)
		}
	}()
	go func() {
		defer wg.Done()
		<-start
		for i := 0; i < 1000; i++ {
			active := harness.activeTurnSnapshot(runID)
			if active == nil {
				t.Errorf("active turn snapshot is nil")
				return
			}
			if active.threadID != "thread_goal" {
				t.Errorf("snapshot threadID = %q, want thread_goal", active.threadID)
				return
			}
			if active.logicalTurnID != "turn_goal_a" {
				t.Errorf("snapshot logicalTurnID = %q, want turn_goal_a", active.logicalTurnID)
				return
			}
		}
	}()
	close(start)
	wg.Wait()
}
