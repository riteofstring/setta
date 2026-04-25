package projectstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const (
	WatchCodePluginDataKey           = "setta-watch-code"
	WatchCodePluginDataSchemaVersion = 1
)

var ErrWatchCodePluginDataUnsupportedSchema = errors.New(
	"unsupported watch code plugin data schema version",
)

type WatchCodePluginData struct {
	SchemaVersion int                                   `json:"schemaVersion"`
	Projects      map[string]WatchCodePluginProjectData `json:"projects"`
}

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

func FrontendDefaultWatchCodePluginProjectData() WatchCodePluginProjectData {
	return EmptyWatchCodePluginProjectData()
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

func (d *Document) loadWatchCodePluginDataIntoProjects() error {
	if d == nil || len(d.Projects) == 0 {
		return nil
	}
	data, ok, err := d.decodeWatchCodePluginData()
	if err != nil || !ok {
		return err
	}
	for projectID, projectData := range data.Projects {
		project, exists := d.Projects[projectID]
		if !exists {
			continue
		}
		project.applyWatchCodePluginProjectData(projectData)
		d.Projects[projectID] = project
	}
	return nil
}

func (d *Document) storeWatchCodePluginDataFromProjects() error {
	if d == nil {
		return nil
	}

	data, existed, err := d.decodeWatchCodePluginData()
	if err != nil {
		return err
	}
	data = watchCodePluginDataFromProjects(data, existed, d.Projects)
	if len(data.Projects) == 0 {
		d.deleteWatchCodePluginData(existed)
		return nil
	}

	payload, err := marshalWatchCodePluginData(data)
	if err != nil {
		return err
	}
	if d.PluginData == nil {
		d.PluginData = map[string]RawJSON{}
	}
	d.PluginData[WatchCodePluginDataKey] = payload
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

func (d *Document) deleteWatchCodePluginData(existed bool) {
	if !existed || d.PluginData == nil {
		return
	}
	delete(d.PluginData, WatchCodePluginDataKey)
	if len(d.PluginData) == 0 {
		d.PluginData = nil
	}
}

func (d Document) decodeWatchCodePluginData() (WatchCodePluginData, bool, error) {
	payload, ok := d.PluginData[WatchCodePluginDataKey]
	if !ok || len(payload) == 0 {
		return WatchCodePluginData{
			SchemaVersion: WatchCodePluginDataSchemaVersion,
			Projects:      map[string]WatchCodePluginProjectData{},
		}, false, nil
	}

	normalized, err := normalizeRawJSON(payload, "pluginData."+WatchCodePluginDataKey)
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

func marshalWatchCodePluginData(data WatchCodePluginData) (RawJSON, error) {
	encoded, err := json.Marshal(data.Normalized())
	if err != nil {
		return nil, fmt.Errorf("encode watch code plugin data: %w", err)
	}
	return normalizeRawJSON(encoded, "pluginData."+WatchCodePluginDataKey)
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
