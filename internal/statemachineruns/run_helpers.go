package statemachineruns

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

func resolvePermissionMode(section graphSection, targetAction projectstate.StateMachineTargetAction) string {
	if targetAction.PermissionMode != nil && strings.TrimSpace(*targetAction.PermissionMode) != "" {
		return strings.TrimSpace(*targetAction.PermissionMode)
	}
	if section.PermissionMode != nil && strings.TrimSpace(*section.PermissionMode) != "" {
		return strings.TrimSpace(*section.PermissionMode)
	}
	return string(projectstate.ChatPermissionModeMinimal)
}

func resolveSearchEnabled(section graphSection, targetAction projectstate.StateMachineTargetAction) bool {
	if targetAction.SearchEnabled != nil {
		return *targetAction.SearchEnabled
	}
	if section.SearchEnabled != nil {
		return *section.SearchEnabled
	}
	return true
}

func edgeIDs(edges []projectstate.StateMachineEdge) []any {
	result := make([]any, 0, len(edges))
	for _, edge := range edges {
		result = append(result, edge.ID)
	}
	return result
}

func gateSectionIDs(graph graph) []string {
	result := make([]string, 0)
	for sectionID, section := range graph.Sections {
		if section.Kind != graphSectionKindGate {
			continue
		}
		result = append(result, sectionID)
	}
	slices.Sort(result)
	return result
}

func sectionDisplayLabel(graph graph, sectionID string) string {
	section, ok := graph.Sections[sectionID]
	if !ok {
		return sectionID
	}
	if strings.TrimSpace(section.Label) != "" {
		return strings.TrimSpace(section.Label)
	}
	return sectionID
}

func edgeActionEventType(graph graph, action map[string]any) string {
	actionType := payloadString(action, "actionType")
	edgeID := payloadString(action, "edgeId")
	if edgeID != "" {
		for _, edge := range graph.Edges {
			if edge.ID != edgeID {
				continue
			}
			sourceSection, ok := graph.Sections[edge.SourceSectionID]
			if ok && sourceSection.Kind == graphSectionKindStart {
				if actionType == string(projectstate.StateMachineTargetActionTypeResetThread) {
					return "start_edge_action_reset"
				}
				return "start_edge_action_dispatched"
			}
			break
		}
	}
	if actionType == string(projectstate.StateMachineTargetActionTypeResetThread) {
		return "edge_action_reset"
	}
	return "edge_action_dispatched"
}

func targetSectionIDs(edges []projectstate.StateMachineEdge) []any {
	result := make([]any, 0, len(edges))
	for _, edge := range edges {
		result = append(result, edge.TargetSectionID)
	}
	return result
}

func runInputString(run agentruns.Run, key string) string {
	if run.Inputs == nil {
		return ""
	}
	value, ok := run.Inputs[key]
	if !ok {
		return ""
	}
	valueString, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(valueString)
}

func runInputsStringEquals(run agentruns.Run, key string, expected string) bool {
	return runInputString(run, key) == strings.TrimSpace(expected)
}

func runMatchesShareSessionID(run agentruns.Run, shareSessionID *string) bool {
	expected := derefOptionalString(shareSessionID)
	return runInputString(run, inputKeyShareSessionID) == expected
}

func runLastUpdated(run agentruns.Run) time.Time {
	if run.FinishedAt != nil {
		return run.FinishedAt.UTC()
	}
	if len(run.Events) > 0 {
		return run.Events[len(run.Events)-1].Timestamp.UTC()
	}
	if run.StartedAt != nil {
		return run.StartedAt.UTC()
	}
	return time.Time{}
}

func outputStringList(run agentruns.Run, key string) []string {
	if run.Outputs == nil {
		return []string{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return []string{}
	}
	rawItems, ok := rawValue.([]any)
	if !ok {
		return []string{}
	}
	items := make([]string, 0, len(rawItems))
	for _, rawItem := range rawItems {
		item, ok := rawItem.(string)
		if !ok || strings.TrimSpace(item) == "" {
			continue
		}
		items = append(items, item)
	}
	return items
}

func outputIntMap(run agentruns.Run, key string) map[string]int {
	if run.Outputs == nil {
		return map[string]int{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return map[string]int{}
	}
	rawMap, ok := rawValue.(map[string]any)
	if !ok {
		return map[string]int{}
	}
	values := make(map[string]int, len(rawMap))
	for mapKey, rawEntry := range rawMap {
		switch typed := rawEntry.(type) {
		case int:
			values[mapKey] = typed
		case float64:
			values[mapKey] = int(typed)
		}
	}
	return values
}

func outputMap(run agentruns.Run, key string) map[string]any {
	return cloneAnyMap(rawOutputMap(run, key))
}

func rawOutputMap(run agentruns.Run, key string) map[string]any {
	if run.Outputs == nil {
		return map[string]any{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return map[string]any{}
	}
	rawMap, ok := rawValue.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return rawMap
}

func outputListOfMaps(run agentruns.Run, key string) []map[string]any {
	if run.Outputs == nil {
		return []map[string]any{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return []map[string]any{}
	}
	rawItems, ok := rawValue.([]any)
	if !ok {
		return []map[string]any{}
	}
	result := make([]map[string]any, 0, len(rawItems))
	for _, rawItem := range rawItems {
		entry, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, cloneAnyMap(entry))
	}
	return result
}

func listOfMapsToAny(input []map[string]any) []any {
	result := make([]any, 0, len(input))
	for _, value := range input {
		result = append(result, cloneAnyMap(value))
	}
	return result
}

func mapOfMapsToAny(input map[string]map[string]any) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = cloneAnyMap(value)
	}
	return result
}

func intMapToAny(input map[string]int) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func stringMapToAny(input map[string]string) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func stringSliceToAny(input []string) []any {
	result := make([]any, 0, len(input))
	for _, value := range input {
		result = append(result, value)
	}
	return result
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = deepCloneJSONValue(value)
	}
	return result
}

func cloneAnyMapMap(input map[string]any) map[string]any {
	return cloneAnyMap(input)
}

func cloneAnyMapMapValues(input map[string]map[string]any) map[string]map[string]any {
	result := make(map[string]map[string]any, len(input))
	for key, value := range input {
		result[key] = cloneAnyMap(value)
	}
	return result
}

func cloneStringSet(input map[string]struct{}) map[string]struct{} {
	result := make(map[string]struct{}, len(input))
	for key := range input {
		result[key] = struct{}{}
	}
	return result
}

func stringSetEquals(left map[string]struct{}, right map[string]struct{}) bool {
	if len(left) != len(right) {
		return false
	}
	for key := range left {
		if _, ok := right[key]; !ok {
			return false
		}
	}
	return true
}

func stringSetContains(values map[string]struct{}, key string) bool {
	_, ok := values[key]
	return ok
}

func orderedSetIntersection(order []string, values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for _, key := range order {
		if !stringSetContains(values, key) {
			continue
		}
		result = append(result, key)
	}
	return result
}

func runBlockedGateSectionIDs(run agentruns.Run) []string {
	failureSummary := outputMap(run, outputKeyFailureSummary)
	reason, _ := failureSummary["reason"].(string)
	if reason != "run_blocked" {
		return []string{}
	}
	details, _ := failureSummary["details"].(map[string]any)
	if details == nil {
		return []string{}
	}
	rawGateSectionIDs, _ := details["gateSectionIds"].([]any)
	if rawGateSectionIDs == nil {
		return []string{}
	}
	gateSectionIDs := make([]string, 0, len(rawGateSectionIDs))
	for _, rawGateSectionID := range rawGateSectionIDs {
		gateSectionID, ok := rawGateSectionID.(string)
		if !ok || strings.TrimSpace(gateSectionID) == "" {
			continue
		}
		gateSectionIDs = append(gateSectionIDs, strings.TrimSpace(gateSectionID))
	}
	return gateSectionIDs
}

func runBlockedGateDetailsBySectionID(run agentruns.Run) map[string]map[string]any {
	failureSummary := outputMap(run, outputKeyFailureSummary)
	reason, _ := failureSummary["reason"].(string)
	if reason != "run_blocked" {
		return map[string]map[string]any{}
	}
	details, _ := failureSummary["details"].(map[string]any)
	if details == nil {
		return map[string]map[string]any{}
	}
	rawGateDetails, _ := details["gateDetailsBySectionId"].(map[string]any)
	if rawGateDetails == nil {
		return map[string]map[string]any{}
	}
	gateDetails := make(map[string]map[string]any, len(rawGateDetails))
	for sectionID, rawDetail := range rawGateDetails {
		detail, ok := rawDetail.(map[string]any)
		if !ok {
			continue
		}
		gateDetails[sectionID] = cloneAnyMap(detail)
	}
	return gateDetails
}

func cloneStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func deepCloneJSONValue(value any) any {
	if value == nil {
		return nil
	}
	content, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned any
	if err := json.Unmarshal(content, &cloned); err != nil {
		return value
	}
	return cloned
}

func userTextMessage(prompt string) map[string]any {
	return map[string]any{
		"id":   fmt.Sprintf("workflow-%d", time.Now().UTC().UnixNano()),
		"role": "user",
		"content": []any{
			map[string]any{
				"type": "text",
				"text": prompt,
			},
		},
	}
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	rawValue, ok := payload[key]
	if !ok {
		return ""
	}
	value, ok := rawValue.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func optionalBoolPointer(payload map[string]any, key string) *bool {
	if payload == nil {
		return nil
	}
	rawValue, ok := payload[key]
	if !ok {
		return nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return nil
	}
	return &value
}

func optionalStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func chooseOptionalString(primary *string, fallback *string) *string {
	if primary != nil && strings.TrimSpace(*primary) != "" {
		trimmed := strings.TrimSpace(*primary)
		return &trimmed
	}
	return cloneStringPointer(fallback)
}

func stringPointer(value string) *string {
	cloned := strings.TrimSpace(value)
	if cloned == "" {
		return nil
	}
	return &cloned
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func derefGateType(value *projectstate.StateMachineGateType) projectstate.StateMachineGateType {
	if value == nil {
		return projectstate.StateMachineGateTypeAND
	}
	return *value
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func signalEventString(signalEvent map[string]any, key string) string {
	if signalEvent == nil {
		return ""
	}
	rawValue, ok := signalEvent[key]
	if !ok {
		return ""
	}
	value, ok := rawValue.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func signalEventPayload(signalEvent map[string]any) map[string]any {
	if signalEvent == nil {
		return map[string]any{}
	}
	rawValue, ok := signalEvent["payload"]
	if !ok {
		return map[string]any{}
	}
	payload, ok := rawValue.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return cloneAnyMap(payload)
}

func (r *Runtime) nextSignalEventID() string {
	r.nextSignalEventOrdinal++
	return fmt.Sprintf("signal-event-%d", r.nextSignalEventOrdinal)
}
