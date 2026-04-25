package projectstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const WatchCodePluginDataSchemaVersion = 1

var (
	ErrWatchCodeProviderPluginIDRequired    = errors.New("watch code provider plugin id is required")
	ErrWatchCodePluginDataUnsupportedSchema = errors.New(
		"unsupported watch code plugin data schema version",
	)
)

// setta-go-type-discovery: skip
type WatchCodePluginData struct {
	SchemaVersion int                                   `json:"schemaVersion"`
	Projects      map[string]WatchCodePluginProjectData `json:"projects"`
}

// setta-go-type-discovery: skip
type WatchCodePluginProjectData struct {
	Enabled        bool                              `json:"enabled"`
	Folders        []WatchCodeFolder                 `json:"folders"`
	Files          []string                          `json:"files"`
	Registry       map[string]WatchCodeRegistryEntry `json:"registry"`
	BaselineByPath map[string][]string               `json:"baselineByPath"`
}

func EmptyWatchCodePluginProjectData() WatchCodePluginProjectData {
	data := WatchCodePluginProjectData{}
	return data.Normalized()
}

func WatchCodePluginProjectDataFromProject(project Project) WatchCodePluginProjectData {
	return WatchCodePluginProjectData{
		Enabled:        project.WatchCodeEnabled,
		Folders:        cloneWatchCodeFolders(project.WatchCodeFolders),
		Files:          append([]string(nil), project.WatchCodeFiles...),
		Registry:       cloneWatchCodeRegistry(project.WatchCodeRegistry),
		BaselineByPath: cloneStringSliceMap(project.WatchCodeBaselineByPath),
	}.Normalized()
}

func (data WatchCodePluginProjectData) Normalized() WatchCodePluginProjectData {
	normalized := data
	normalized.Folders = cloneWatchCodeFolders(normalized.Folders)
	if normalized.Folders == nil {
		normalized.Folders = []WatchCodeFolder{}
	}
	normalized.Files = append([]string(nil), normalized.Files...)
	if normalized.Files == nil {
		normalized.Files = []string{}
	}
	normalized.Registry = cloneWatchCodeRegistry(normalized.Registry)
	if normalized.Registry == nil {
		normalized.Registry = map[string]WatchCodeRegistryEntry{}
	}
	normalized.BaselineByPath = cloneStringSliceMap(normalized.BaselineByPath)
	if normalized.BaselineByPath == nil {
		normalized.BaselineByPath = map[string][]string{}
	}
	return normalized
}

func (data WatchCodePluginProjectData) IsEmpty() bool {
	normalized := data.Normalized()
	return !normalized.Enabled &&
		len(normalized.Folders) == 0 &&
		len(normalized.Files) == 0 &&
		len(normalized.Registry) == 0 &&
		len(normalized.BaselineByPath) == 0
}

func (data WatchCodePluginData) Normalized() WatchCodePluginData {
	normalized := WatchCodePluginData{
		SchemaVersion: WatchCodePluginDataSchemaVersion,
		Projects:      map[string]WatchCodePluginProjectData{},
	}
	for projectID, projectData := range data.Projects {
		trimmedProjectID := strings.TrimSpace(projectID)
		if trimmedProjectID == "" {
			continue
		}
		normalized.Projects[trimmedProjectID] = projectData.Normalized()
	}
	return normalized
}

func WatchCodePluginSettingID(providerPluginID string, localID string) (string, error) {
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return "", err
	}
	trimmedLocalID := strings.TrimSpace(localID)
	if trimmedLocalID == "" {
		return "", fmt.Errorf("watch code setting local id is required")
	}
	return "plugin::" + pluginID + "::" + trimmedLocalID, nil
}

func (d *Document) LoadWatchCodePluginDataIntoProjects(providerPluginID string) error {
	if d == nil {
		return nil
	}
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return err
	}
	previousPluginID := d.watchCodeProviderPluginID
	wasHydrated := d.watchCodePluginDataHydrated
	d.watchCodeProviderPluginID = pluginID
	if len(d.Projects) == 0 {
		d.watchCodePluginDataHydrated = true
		return nil
	}
	data, ok, err := d.decodeWatchCodePluginData(pluginID)
	if err != nil {
		return err
	}
	if !ok {
		if !wasHydrated || previousPluginID == "" || previousPluginID == pluginID {
			d.watchCodePluginDataHydrated = true
			return nil
		}
		data = WatchCodePluginData{
			SchemaVersion: WatchCodePluginDataSchemaVersion,
			Projects:      map[string]WatchCodePluginProjectData{},
		}
	}
	for projectID, project := range d.Projects {
		projectData, exists := data.Projects[projectID]
		if !exists {
			projectData = EmptyWatchCodePluginProjectData()
		}
		project.applyWatchCodePluginProjectData(projectData)
		d.Projects[projectID] = project
	}
	d.watchCodePluginDataHydrated = true
	return nil
}

func (d *Document) StoreWatchCodePluginDataFromProjects(providerPluginID string) error {
	if d == nil {
		return nil
	}
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return err
	}
	d.watchCodeProviderPluginID = pluginID
	d.watchCodePluginDataHydrated = true

	data, existed, err := d.decodeWatchCodePluginData(pluginID)
	if err != nil {
		return err
	}
	data = watchCodePluginDataFromProjects(data, existed, d.Projects)
	if len(data.Projects) == 0 {
		d.deleteWatchCodePluginData(pluginID, existed)
		return nil
	}

	payload, err := marshalWatchCodePluginData(pluginID, data)
	if err != nil {
		return err
	}
	if d.PluginData == nil {
		d.PluginData = map[string]RawJSON{}
	}
	d.PluginData[pluginID] = payload
	return nil
}

func watchCodePluginDataFromProjects(
	data WatchCodePluginData,
	existed bool,
	projects map[string]Project,
) WatchCodePluginData {
	if !existed {
		data = WatchCodePluginData{
			SchemaVersion: WatchCodePluginDataSchemaVersion,
			Projects:      map[string]WatchCodePluginProjectData{},
		}
	}
	for projectID, project := range projects {
		projectData := WatchCodePluginProjectDataFromProject(project)
		if !existed && projectData.IsEmpty() {
			continue
		}
		data.Projects[projectID] = projectData
	}
	return data.Normalized()
}

func (d *Document) deleteWatchCodePluginData(providerPluginID string, existed bool) {
	if !existed || d.PluginData == nil {
		return
	}
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return
	}
	delete(d.PluginData, pluginID)
	if len(d.PluginData) == 0 {
		d.PluginData = nil
	}
}

func (d Document) WatchCodePluginProjectData(providerPluginID string, projectID string) (WatchCodePluginProjectData, bool, error) {
	data, ok, err := d.decodeWatchCodePluginData(providerPluginID)
	if err != nil || !ok {
		return EmptyWatchCodePluginProjectData(), false, err
	}
	projectData, ok := data.Projects[strings.TrimSpace(projectID)]
	if !ok {
		return EmptyWatchCodePluginProjectData(), false, nil
	}
	return projectData.Normalized(), true, nil
}

func (d Document) decodeWatchCodePluginData(providerPluginID string) (WatchCodePluginData, bool, error) {
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return WatchCodePluginData{}, false, err
	}
	payload, ok := d.PluginData[pluginID]
	if !ok || len(payload) == 0 {
		return WatchCodePluginData{
			SchemaVersion: WatchCodePluginDataSchemaVersion,
			Projects:      map[string]WatchCodePluginProjectData{},
		}, false, nil
	}

	normalized, err := normalizeRawJSON(payload, "pluginData."+pluginID)
	if err != nil {
		return WatchCodePluginData{}, false, err
	}
	var data WatchCodePluginData
	if err := json.Unmarshal(normalized, &data); err != nil {
		return WatchCodePluginData{}, false, fmt.Errorf("decode watch code plugin data: %w", err)
	}
	if data.SchemaVersion != WatchCodePluginDataSchemaVersion {
		return WatchCodePluginData{}, false, fmt.Errorf(
			"%w: %d",
			ErrWatchCodePluginDataUnsupportedSchema,
			data.SchemaVersion,
		)
	}
	if data.Projects == nil {
		data.Projects = map[string]WatchCodePluginProjectData{}
	}
	return data.Normalized(), true, nil
}

func marshalWatchCodePluginData(providerPluginID string, data WatchCodePluginData) (RawJSON, error) {
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(data.Normalized())
	if err != nil {
		return nil, fmt.Errorf("encode watch code plugin data: %w", err)
	}
	return normalizeRawJSON(encoded, "pluginData."+pluginID)
}

func (p *Project) applyWatchCodePluginProjectData(data WatchCodePluginProjectData) {
	if p == nil {
		return
	}
	normalized := data.Normalized()
	p.WatchCodeEnabled = normalized.Enabled
	p.WatchCodeFolders = normalized.Folders
	p.WatchCodeFiles = normalized.Files
	p.WatchCodeRegistry = normalized.Registry
	p.WatchCodeBaselineByPath = normalized.BaselineByPath
}

func normalizeWatchCodeProviderPluginID(providerPluginID string) (string, error) {
	pluginID := strings.TrimSpace(providerPluginID)
	if pluginID == "" {
		return "", ErrWatchCodeProviderPluginIDRequired
	}
	return pluginID, nil
}

func mustWatchCodePluginSettingID(providerPluginID string, localID string) string {
	settingID, err := WatchCodePluginSettingID(providerPluginID, localID)
	if err != nil {
		panic(err)
	}
	return settingID
}
