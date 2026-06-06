package orchestrator

func mergeRunnerRefs(existing []WorkflowActionRunnerRef, next []WorkflowActionRunnerRef) []WorkflowActionRunnerRef {
	merged := append([]WorkflowActionRunnerRef{}, existing...)
	for _, ref := range next {
		if ref.Kind == "" || ref.ID == "" {
			continue
		}
		found := false
		for index, current := range merged {
			if current.Kind == ref.Kind {
				merged[index] = ref
				found = true
				break
			}
		}
		if !found {
			merged = append(merged, ref)
		}
	}
	if merged == nil {
		return []WorkflowActionRunnerRef{}
	}
	return merged
}
