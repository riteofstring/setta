package workspacetrajectory

import (
	"encoding/json"
	"unicode/utf8"
)

func runtimeLimits(limit int) WorkspaceTrajectoryRuntimeLimits {
	limit = normalizeLimit(limit)
	return WorkspaceTrajectoryRuntimeLimits{
		MaxSprites:              limit,
		MaxTimelineItems:        limit,
		MaxAggregates:           limit,
		MaxDetailRefs:           limit,
		MaxSourceRefsPerSprite:  8,
		MaxFileRefsPerSprite:    8,
		MaxChangedAreas:         MaxChangedAreaCount,
		MaxSpriteTitleBytes:     MaxSpriteTitleBytes,
		MaxSpriteSubtitleBytes:  MaxSpriteSubtitleBytes,
		MaxSpriteResultBytes:    MaxSpriteResultBytes,
		MaxSpriteErrorBytes:     MaxSpriteErrorBytes,
		MaxSnapshotPayloadBytes: MaxSnapshotPayloadBytes,
		MaxDeltaPayloadBytes:    MaxDeltaPayloadBytes,
	}
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return DefaultRuntimeLimit
	}
	if limit > MaxRuntimeLimit {
		return MaxRuntimeLimit
	}
	return limit
}

func finalizeSnapshot(snapshot *WorkspaceTrajectoryRuntimeSnapshot) {
	limits := snapshot.Limits
	truncated := trimSnapshotStrings(snapshot, limits)
	omitted := enforceSnapshotLimits(snapshot, limits)
	pruneSnapshotRefsToSprites(snapshot)
	setPayloadBudget(&snapshot.PayloadBudget, snapshot, limits.MaxSnapshotPayloadBytes, truncated, omitted)
	for snapshot.PayloadBudget.ByteSize > snapshot.PayloadBudget.MaxByteSize && len(snapshot.Sprites) > 0 {
		snapshot.Sprites = snapshot.Sprites[:len(snapshot.Sprites)-1]
		pruneSnapshotRefsToSprites(snapshot)
		omitted++
		setPayloadBudget(&snapshot.PayloadBudget, snapshot, limits.MaxSnapshotPayloadBytes, truncated, omitted)
	}
	for snapshot.PayloadBudget.ByteSize > snapshot.PayloadBudget.MaxByteSize && len(snapshot.Timeline) > 0 {
		snapshot.Timeline = snapshot.Timeline[:len(snapshot.Timeline)-1]
		setPayloadBudget(&snapshot.PayloadBudget, snapshot, limits.MaxSnapshotPayloadBytes, truncated, omitted)
	}
	for snapshot.PayloadBudget.ByteSize > snapshot.PayloadBudget.MaxByteSize && len(snapshot.DetailRefs) > 0 {
		snapshot.DetailRefs = snapshot.DetailRefs[:len(snapshot.DetailRefs)-1]
		setPayloadBudget(&snapshot.PayloadBudget, snapshot, limits.MaxSnapshotPayloadBytes, truncated, omitted)
	}
	for snapshot.PayloadBudget.ByteSize > snapshot.PayloadBudget.MaxByteSize && len(snapshot.AggregateByWorkflow) > 0 {
		snapshot.AggregateByWorkflow = snapshot.AggregateByWorkflow[:len(snapshot.AggregateByWorkflow)-1]
		setPayloadBudget(&snapshot.PayloadBudget, snapshot, limits.MaxSnapshotPayloadBytes, truncated, omitted)
	}
}

func finalizeDelta(delta *WorkspaceTrajectoryRuntimeDelta, limits WorkspaceTrajectoryRuntimeLimits) {
	truncated := trimDeltaStrings(delta, limits)
	omitted := enforceDeltaLimits(delta, limits)
	pruneDeltaRefsToSprites(delta)
	setPayloadBudget(&delta.PayloadBudget, delta, limits.MaxDeltaPayloadBytes, truncated, omitted)
	for delta.PayloadBudget.ByteSize > delta.PayloadBudget.MaxByteSize && len(delta.SpriteUpdates) > 0 {
		delta.SpriteUpdates = delta.SpriteUpdates[:len(delta.SpriteUpdates)-1]
		pruneDeltaRefsToSprites(delta)
		omitted++
		setPayloadBudget(&delta.PayloadBudget, delta, limits.MaxDeltaPayloadBytes, truncated, omitted)
	}
	for delta.PayloadBudget.ByteSize > delta.PayloadBudget.MaxByteSize && len(delta.TimelineUpdates) > 0 {
		delta.TimelineUpdates = delta.TimelineUpdates[:len(delta.TimelineUpdates)-1]
		setPayloadBudget(&delta.PayloadBudget, delta, limits.MaxDeltaPayloadBytes, truncated, omitted)
	}
	for delta.PayloadBudget.ByteSize > delta.PayloadBudget.MaxByteSize && len(delta.DetailRefs) > 0 {
		delta.DetailRefs = delta.DetailRefs[:len(delta.DetailRefs)-1]
		setPayloadBudget(&delta.PayloadBudget, delta, limits.MaxDeltaPayloadBytes, truncated, omitted)
	}
	for delta.PayloadBudget.ByteSize > delta.PayloadBudget.MaxByteSize && len(delta.AggregateUpdates) > 0 {
		delta.AggregateUpdates = delta.AggregateUpdates[:len(delta.AggregateUpdates)-1]
		setPayloadBudget(&delta.PayloadBudget, delta, limits.MaxDeltaPayloadBytes, truncated, omitted)
	}
}

func enforceSnapshotLimits(snapshot *WorkspaceTrajectoryRuntimeSnapshot, limits WorkspaceTrajectoryRuntimeLimits) int {
	omitted := 0
	if len(snapshot.Sprites) > limits.MaxSprites {
		omitted += len(snapshot.Sprites) - limits.MaxSprites
		snapshot.Sprites = snapshot.Sprites[:limits.MaxSprites]
	}
	if len(snapshot.Timeline) > limits.MaxTimelineItems {
		snapshot.Timeline = snapshot.Timeline[:limits.MaxTimelineItems]
	}
	if len(snapshot.AggregateByWorkflow) > limits.MaxAggregates {
		snapshot.AggregateByWorkflow = snapshot.AggregateByWorkflow[:limits.MaxAggregates]
	}
	return omitted
}

func enforceDeltaLimits(delta *WorkspaceTrajectoryRuntimeDelta, limits WorkspaceTrajectoryRuntimeLimits) int {
	omitted := 0
	if len(delta.ChangedAreas) > limits.MaxChangedAreas {
		delta.ChangedAreas = delta.ChangedAreas[:limits.MaxChangedAreas]
	}
	if len(delta.SpriteUpdates) > limits.MaxSprites {
		omitted += len(delta.SpriteUpdates) - limits.MaxSprites
		delta.SpriteUpdates = delta.SpriteUpdates[:limits.MaxSprites]
	}
	if len(delta.TimelineUpdates) > limits.MaxTimelineItems {
		delta.TimelineUpdates = delta.TimelineUpdates[:limits.MaxTimelineItems]
	}
	if len(delta.AggregateUpdates) > limits.MaxAggregates {
		delta.AggregateUpdates = delta.AggregateUpdates[:limits.MaxAggregates]
	}
	return omitted
}

func trimSnapshotStrings(snapshot *WorkspaceTrajectoryRuntimeSnapshot, limits WorkspaceTrajectoryRuntimeLimits) int {
	truncated := 0
	for index := range snapshot.Sprites {
		truncated += trimSpriteStrings(&snapshot.Sprites[index], limits)
	}
	for index := range snapshot.Timeline {
		truncated += truncateStringBytes(&snapshot.Timeline[index].Summary, MaxTimelineSummaryBytes)
	}
	for index := range snapshot.DetailRefs {
		truncated += truncateStringBytes(&snapshot.DetailRefs[index].Summary, MaxTimelineSummaryBytes)
	}
	return truncated
}

func trimDeltaStrings(delta *WorkspaceTrajectoryRuntimeDelta, limits WorkspaceTrajectoryRuntimeLimits) int {
	truncated := 0
	for index := range delta.SpriteUpdates {
		truncated += trimSpriteStrings(&delta.SpriteUpdates[index], limits)
	}
	for index := range delta.TimelineUpdates {
		truncated += truncateStringBytes(&delta.TimelineUpdates[index].Summary, MaxTimelineSummaryBytes)
	}
	for index := range delta.DetailRefs {
		truncated += truncateStringBytes(&delta.DetailRefs[index].Summary, MaxTimelineSummaryBytes)
	}
	return truncated
}

func trimSpriteStrings(sprite *WorkspaceTrajectorySprite, limits WorkspaceTrajectoryRuntimeLimits) int {
	truncated := 0
	limitSpriteRefs(sprite, limits)
	truncated += truncateStringBytes(&sprite.Title, limits.MaxSpriteTitleBytes)
	truncated += truncateStringBytes(&sprite.Subtitle, limits.MaxSpriteSubtitleBytes)
	truncated += truncateStringBytes(&sprite.ResultSummary, limits.MaxSpriteResultBytes)
	truncated += truncateStringBytes(&sprite.ErrorSummary, limits.MaxSpriteErrorBytes)
	truncated += truncateStringBytes(&sprite.Command.Command, MaxCommandDisplayBytes)
	truncated += truncateStringBytes(&sprite.Command.Cwd, MaxCommandDisplayBytes)
	truncated += truncateStringBytes(&sprite.Tool.ServerName, MaxToolDisplayBytes)
	truncated += truncateStringBytes(&sprite.Tool.ToolName, MaxToolDisplayBytes)
	truncated += truncateStringBytes(&sprite.Tool.Namespace, MaxToolDisplayBytes)
	truncated += truncateStringBytes(&sprite.DiffStats.Summary, limits.MaxSpriteResultBytes)
	for index := range sprite.FileRefs {
		truncated += truncateStringBytes(&sprite.FileRefs[index].DisplayPath, MaxFileRefDisplayBytes)
	}
	return truncated
}

func limitSpriteRefs(sprite *WorkspaceTrajectorySprite, limits WorkspaceTrajectoryRuntimeLimits) {
	if len(sprite.SourceRefs) > limits.MaxSourceRefsPerSprite {
		sprite.SourceRefs = sprite.SourceRefs[:limits.MaxSourceRefsPerSprite]
	}
	if len(sprite.FileRefs) > limits.MaxFileRefsPerSprite {
		sprite.FileRefs = sprite.FileRefs[:limits.MaxFileRefsPerSprite]
	}
}

func pruneSnapshotRefsToSprites(snapshot *WorkspaceTrajectoryRuntimeSnapshot) {
	retained := retainedSpriteIDs(snapshot.Sprites)
	snapshot.Timeline = filterTimelineBySpriteIDs(snapshot.Timeline, retained)
	snapshot.DetailRefs = filterDetailRefsBySpriteIDs(snapshot.DetailRefs, retained)
}

func pruneDeltaRefsToSprites(delta *WorkspaceTrajectoryRuntimeDelta) {
	retained := retainedSpriteIDs(delta.SpriteUpdates)
	delta.TimelineUpdates = filterTimelineBySpriteIDs(delta.TimelineUpdates, retained)
	delta.DetailRefs = filterDetailRefsBySpriteIDs(delta.DetailRefs, retained)
}

func retainedSpriteIDs(sprites []WorkspaceTrajectorySprite) map[string]bool {
	retained := map[string]bool{}
	for _, sprite := range sprites {
		if sprite.ID != "" {
			retained[sprite.ID] = true
		}
	}
	return retained
}

func filterTimelineBySpriteIDs(items []WorkspaceTrajectoryTimelineItem, retained map[string]bool) []WorkspaceTrajectoryTimelineItem {
	if len(items) == 0 {
		return items
	}
	filtered := items[:0]
	for _, item := range items {
		if retained[item.SpriteID] {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func filterDetailRefsBySpriteIDs(refs []WorkspaceTrajectoryDetailRef, retained map[string]bool) []WorkspaceTrajectoryDetailRef {
	if len(refs) == 0 {
		return refs
	}
	filtered := refs[:0]
	for _, ref := range refs {
		if retained[ref.SpriteID] {
			filtered = append(filtered, ref)
		}
	}
	return filtered
}

func setPayloadBudget(budget *WorkspaceTrajectoryRuntimePayloadBudget, value any, maxBytes int, truncatedStrings int, omittedSprites int) {
	budget.MaxByteSize = maxBytes
	budget.TruncatedStringCount = truncatedStrings
	budget.OmittedSpriteCount = omittedSprites
	for index := 0; index < 4; index++ {
		size := payloadByteSize(value)
		if size == budget.ByteSize {
			return
		}
		budget.ByteSize = size
	}
}

func payloadByteSize(value any) int {
	payload, err := json.Marshal(value)
	if err != nil {
		return 0
	}
	return len(payload)
}

func truncateStringBytes(value *string, maxBytes int) int {
	truncated, ok := truncateUTF8StringBytes(*value, maxBytes)
	if !ok {
		return 0
	}
	*value = truncated
	return 1
}

func truncateUTF8StringBytes(value string, maxBytes int) (string, bool) {
	if maxBytes < 0 || len([]byte(value)) <= maxBytes {
		return value, false
	}
	if maxBytes == 0 {
		return "", value != ""
	}
	byteCount := 0
	for index, r := range value {
		runeBytes := utf8.RuneLen(r)
		if runeBytes < 0 {
			runeBytes = len(string(r))
		}
		if byteCount+runeBytes > maxBytes {
			return value[:index], true
		}
		byteCount += runeBytes
	}
	return value, false
}
