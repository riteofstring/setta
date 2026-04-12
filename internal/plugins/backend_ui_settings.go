package plugins

func cloneRegisteredUISettings(values []PluginRegisteredUISetting) []PluginRegisteredUISetting {
	if len(values) == 0 {
		return []PluginRegisteredUISetting{}
	}

	cloned := make([]PluginRegisteredUISetting, 0, len(values))
	for _, value := range values {
		cloned = append(cloned, PluginRegisteredUISetting{
			LocalSettingID: value.LocalSettingID,
			PluginID:       value.PluginID,
			Title:          value.Title,
			Description:    value.Description,
			Synonyms:       append([]string(nil), value.Synonyms...),
			PaneID:         value.PaneID,
			RevealKey:      value.RevealKey,
			Mutability:     value.Mutability,
			ValueSchema:    cloneStringAnyMap(value.ValueSchema),
			ReadHandlerID:  value.ReadHandlerID,
			WriteHandlerID: cloneOptionalString(value.WriteHandlerID),
		})
	}
	return cloned
}
