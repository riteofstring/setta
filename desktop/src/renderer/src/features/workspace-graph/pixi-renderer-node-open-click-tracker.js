/* global performance */

export function createWorkflowGraphNodeOpenClickTracker({ limits, now = () => performance.now() }) {
  let lastNodeClick = null;
  return {
    clear: () => {
      lastNodeClick = null;
    },
    record: (nodeId, screen) => {
      lastNodeClick = {
        nodeId,
        time: now(),
        x: screen.x,
        y: screen.y,
      };
    },
    repeatedOpenRequested: (nodeId, screen) => {
      if (lastNodeClick === null || lastNodeClick.nodeId !== nodeId) {
        return false;
      }
      const elapsed = now() - lastNodeClick.time;
      const distance = Math.hypot(screen.x - lastNodeClick.x, screen.y - lastNodeClick.y);
      return (
        elapsed <= limits.nodeOpenClickIntervalMs && distance <= limits.nodeOpenClickDistanceScreen
      );
    },
  };
}
