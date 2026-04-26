package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrChartSectionRequired      = errors.New("section must resolve to a chart section")
	ErrChartTypeInvalid          = errors.New("chart type is invalid")
	ErrChartSettingsFieldInvalid = errors.New("chart settings field is invalid")
)

type ChartType string

const (
	ChartTypeLine    ChartType = "line"
	ChartTypeScatter ChartType = "scatter"
)

type ChartSettingsUpdate struct {
	Type               ChartType `json:"type"`
	XAxisColumn        *string   `json:"xAxisColumn,omitempty"`
	SecondYAxisColumns []string  `json:"secondYAxisColumns,omitempty"`
	CategoryColumn     *string   `json:"categoryColumn,omitempty"`
	XAxisLog           bool      `json:"xAxisLog,omitempty"`
	Y1AxisLog          bool      `json:"y1AxisLog,omitempty"`
	Y2AxisLog          bool      `json:"y2AxisLog,omitempty"`
	YAxisLog           bool      `json:"yAxisLog,omitempty"`
}

type chartSettingsState struct {
	Type               ChartType
	XAxisColumn        *string
	SecondYAxisColumns []string
	CategoryColumn     *string
	XAxisLog           bool
	Y1AxisLog          bool
	Y2AxisLog          bool
	YAxisLog           bool
}

type chartSettingsFieldApplier func(*chartSettingsState, ChartSettingsUpdate, ChartType) error

var chartSettingsFieldAppliers = map[string]chartSettingsFieldApplier{
	"xAxisColumn":        applyChartSettingsXAxisColumn,
	"secondYAxisColumns": applyChartSettingsSecondYAxisColumns,
	"categoryColumn":     applyChartSettingsCategoryColumn,
	"xAxisLog":           applyChartSettingsXAxisLog,
	"y1AxisLog":          applyChartSettingsY1AxisLog,
	"y2AxisLog":          applyChartSettingsY2AxisLog,
	"yAxisLog":           applyChartSettingsYAxisLog,
}

func (p *Project) SetChartAreaDataPath(sectionID string, dataPath string) error {
	section, _, _, err := p.resolveChartSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	return p.setCurrentSectionField(section.ID, "dataPath", dataPath)
}

func (d *Document) SetChartAreaDataPath(projectID string, sectionID string, dataPath string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetChartAreaDataPath(sectionID, dataPath); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetChartAreaDataPath(ctx context.Context, projectID string, sectionID string, dataPath string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetChartAreaDataPath(projectID, sectionID, dataPath); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetChartType(sectionID string, chartType ChartType) error {
	section, _, payload, err := p.resolveChartSectionMutationState(sectionID)
	if err != nil {
		return err
	}
	normalizedType, err := normalizeChartType(chartType)
	if err != nil {
		return err
	}
	current, err := chartSettingsStateFromPayload(payload)
	if err != nil {
		return err
	}
	next := carryForwardChartSettings(current, normalizedType)
	return p.setCurrentSectionField(section.ID, "chartSettings", chartSettingsObject(next))
}

func (d *Document) SetChartType(projectID string, sectionID string, chartType ChartType) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetChartType(sectionID, chartType); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetChartType(ctx context.Context, projectID string, sectionID string, chartType ChartType) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetChartType(projectID, sectionID, chartType); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetChartSettings(sectionID string, chartSettings ChartSettingsUpdate, changedSettings []string) error {
	section, requestedType, current, err := p.resolveChartSettingsMutationState(sectionID, chartSettings.Type)
	if err != nil {
		return err
	}
	next := nextChartSettingsState(current, requestedType)
	if err := applyChangedChartSettings(&next, chartSettings, requestedType, changedSettings); err != nil {
		return err
	}
	next.Type = requestedType
	return p.setCurrentSectionField(section.ID, "chartSettings", chartSettingsObject(next))
}

func (d *Document) SetChartSettings(projectID string, sectionID string, chartSettings ChartSettingsUpdate, changedSettings []string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetChartSettings(sectionID, chartSettings, changedSettings); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetChartSettings(
	ctx context.Context,
	projectID string,
	sectionID string,
	chartSettings ChartSettingsUpdate,
	changedSettings []string,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetChartSettings(projectID, sectionID, chartSettings, changedSettings); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) resolveChartSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	return p.resolveTypedSectionMutationState(sectionID, "Chart", ErrChartSectionRequired)
}

func (p *Project) resolveChartSettingsMutationState(sectionID string, chartType ChartType) (Section, ChartType, chartSettingsState, error) {
	section, _, payload, err := p.resolveChartSectionMutationState(sectionID)
	if err != nil {
		return Section{}, "", chartSettingsState{}, err
	}
	requestedType, err := normalizeChartType(chartType)
	if err != nil {
		return Section{}, "", chartSettingsState{}, err
	}
	current, err := chartSettingsStateFromPayload(payload)
	if err != nil {
		return Section{}, "", chartSettingsState{}, err
	}
	return section, requestedType, current, nil
}

func nextChartSettingsState(current chartSettingsState, requestedType ChartType) chartSettingsState {
	if current.Type == requestedType {
		return current
	}
	return carryForwardChartSettings(current, requestedType)
}

func applyChangedChartSettings(
	next *chartSettingsState,
	chartSettings ChartSettingsUpdate,
	requestedType ChartType,
	changedSettings []string,
) error {
	for _, fieldName := range changedSettings {
		trimmedFieldName := strings.TrimSpace(fieldName)
		if trimmedFieldName == "" {
			continue
		}
		applier, ok := chartSettingsFieldAppliers[trimmedFieldName]
		if !ok {
			return invalidChartSettingsField(trimmedFieldName)
		}
		if err := applier(next, chartSettings, requestedType); err != nil {
			return err
		}
	}
	return nil
}

func applyChartSettingsXAxisColumn(next *chartSettingsState, chartSettings ChartSettingsUpdate, requestedType ChartType) error {
	next.XAxisColumn = normalizeOptionalString(chartSettings.XAxisColumn)
	return nil
}

func applyChartSettingsSecondYAxisColumns(next *chartSettingsState, chartSettings ChartSettingsUpdate, requestedType ChartType) error {
	if err := requireChartSettingsTypeField(requestedType, ChartTypeLine, "secondYAxisColumns"); err != nil {
		return err
	}
	next.SecondYAxisColumns = normalizeStringSlice(chartSettings.SecondYAxisColumns)
	return nil
}

func applyChartSettingsCategoryColumn(next *chartSettingsState, chartSettings ChartSettingsUpdate, requestedType ChartType) error {
	if err := requireChartSettingsTypeField(requestedType, ChartTypeScatter, "categoryColumn"); err != nil {
		return err
	}
	next.CategoryColumn = normalizeOptionalString(chartSettings.CategoryColumn)
	return nil
}

func applyChartSettingsXAxisLog(next *chartSettingsState, chartSettings ChartSettingsUpdate, requestedType ChartType) error {
	next.XAxisLog = chartSettings.XAxisLog
	return nil
}

func applyChartSettingsY1AxisLog(next *chartSettingsState, chartSettings ChartSettingsUpdate, requestedType ChartType) error {
	if err := requireChartSettingsTypeField(requestedType, ChartTypeLine, "y1AxisLog"); err != nil {
		return err
	}
	next.Y1AxisLog = chartSettings.Y1AxisLog
	return nil
}

func applyChartSettingsY2AxisLog(next *chartSettingsState, chartSettings ChartSettingsUpdate, requestedType ChartType) error {
	if err := requireChartSettingsTypeField(requestedType, ChartTypeLine, "y2AxisLog"); err != nil {
		return err
	}
	next.Y2AxisLog = chartSettings.Y2AxisLog
	return nil
}

func applyChartSettingsYAxisLog(next *chartSettingsState, chartSettings ChartSettingsUpdate, requestedType ChartType) error {
	if err := requireChartSettingsTypeField(requestedType, ChartTypeScatter, "yAxisLog"); err != nil {
		return err
	}
	next.YAxisLog = chartSettings.YAxisLog
	return nil
}

func requireChartSettingsTypeField(requestedType ChartType, expectedType ChartType, fieldName string) error {
	if requestedType != expectedType {
		return invalidChartSettingsField(fieldName)
	}
	return nil
}

func invalidChartSettingsField(fieldName string) error {
	return fmt.Errorf("%w: %q", ErrChartSettingsFieldInvalid, fieldName)
}

func normalizeChartType(chartType ChartType) (ChartType, error) {
	switch ChartType(strings.TrimSpace(string(chartType))) {
	case ChartTypeLine:
		return ChartTypeLine, nil
	case ChartTypeScatter:
		return ChartTypeScatter, nil
	default:
		return "", ErrChartTypeInvalid
	}
}

func chartSettingsStateFromPayload(payload map[string]any) (chartSettingsState, error) {
	rawSettings, ok := payloadObjectField(payload, "chartSettings")
	if !ok {
		return defaultChartSettingsState(ChartTypeLine), nil
	}
	chartType, err := normalizeChartType(ChartType(payloadStringField(rawSettings, "type")))
	if err != nil {
		return chartSettingsState{}, err
	}
	state := defaultChartSettingsState(chartType)
	state.XAxisColumn = normalizeOptionalStringFromPayload(rawSettings, "xAxisColumn")
	state.XAxisLog = payloadBoolField(rawSettings, "xAxisLog")
	switch chartType {
	case ChartTypeLine:
		if normalizedSecondYAxisColumns := payloadStringArrayField(rawSettings, "secondYAxisColumns"); normalizedSecondYAxisColumns != nil {
			state.SecondYAxisColumns = normalizedSecondYAxisColumns
		}
		state.Y1AxisLog = payloadBoolField(rawSettings, "y1AxisLog")
		state.Y2AxisLog = payloadBoolField(rawSettings, "y2AxisLog")
	case ChartTypeScatter:
		state.CategoryColumn = normalizeOptionalStringFromPayload(rawSettings, "categoryColumn")
		state.YAxisLog = payloadBoolField(rawSettings, "yAxisLog")
	}
	return state, nil
}

func defaultChartSettingsState(chartType ChartType) chartSettingsState {
	return chartSettingsState{
		Type:               chartType,
		XAxisColumn:        nil,
		SecondYAxisColumns: []string{},
		CategoryColumn:     nil,
		XAxisLog:           false,
		Y1AxisLog:          false,
		Y2AxisLog:          false,
		YAxisLog:           false,
	}
}

func carryForwardChartSettings(current chartSettingsState, nextType ChartType) chartSettingsState {
	next := defaultChartSettingsState(nextType)
	next.XAxisColumn = cloneOptionalString(current.XAxisColumn)
	next.XAxisLog = current.XAxisLog
	if current.Type == nextType {
		next.SecondYAxisColumns = append([]string(nil), current.SecondYAxisColumns...)
		next.CategoryColumn = cloneOptionalString(current.CategoryColumn)
		next.Y1AxisLog = current.Y1AxisLog
		next.Y2AxisLog = current.Y2AxisLog
		next.YAxisLog = current.YAxisLog
	}
	return next
}

func chartSettingsObject(settings chartSettingsState) map[string]any {
	object := frontendChartSettingsObject(settings)
	switch settings.Type {
	case ChartTypeLine:
		object["categoryColumn"] = nil
		object["yAxisLog"] = nil
	case ChartTypeScatter:
		object["secondYAxisColumns"] = nil
		object["y1AxisLog"] = nil
		object["y2AxisLog"] = nil
	}
	return object
}

func frontendChartSettingsObject(settings chartSettingsState) map[string]any {
	var payload any
	switch settings.Type {
	case ChartTypeLine:
		payload = LineChartSettings{
			Type:               ChartTypeLine,
			XAxisColumn:        cloneOptionalString(settings.XAxisColumn),
			SecondYAxisColumns: append([]string{}, settings.SecondYAxisColumns...),
			XAxisLog:           settings.XAxisLog,
			Y1AxisLog:          settings.Y1AxisLog,
			Y2AxisLog:          settings.Y2AxisLog,
		}
	case ChartTypeScatter:
		payload = ScatterChartSettings{
			Type:           ChartTypeScatter,
			XAxisColumn:    cloneOptionalString(settings.XAxisColumn),
			CategoryColumn: cloneOptionalString(settings.CategoryColumn),
			XAxisLog:       settings.XAxisLog,
			YAxisLog:       settings.YAxisLog,
		}
	default:
		panic(fmt.Sprintf("unsupported chart type %q", settings.Type))
	}
	return chartSettingsPayloadObject(payload)
}

func chartSettingsPayloadObject(payload any) map[string]any {
	content, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	object := map[string]any{}
	if err := json.Unmarshal(content, &object); err != nil {
		panic(err)
	}
	return object
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

func normalizeOptionalStringFromPayload(object map[string]any, key string) *string {
	value, present := payloadRawStringFieldWithPresence(object, key)
	if !present {
		return nil
	}
	return normalizeOptionalString(&value)
}

func normalizeStringSlice(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
