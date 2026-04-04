package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeChartMutationsUpdateEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": chartMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetChartAreaDataPath(
		context.Background(),
		"project-alpha",
		"chart-section",
		"  artifacts/chart.csv  ",
	); err != nil {
		t.Fatalf("SetChartAreaDataPath returned error: %v", err)
	}
	if _, err := runtime.SetChartSettings(
		context.Background(),
		"project-alpha",
		"chart-section",
		ChartSettingsUpdate{
			Type:        ChartTypeLine,
			XAxisColumn: chartStringPointer("time"),
		},
		[]string{"xAxisColumn"},
	); err != nil {
		t.Fatalf("SetChartSettings xAxisColumn returned error: %v", err)
	}
	if _, err := runtime.SetChartSettings(
		context.Background(),
		"project-alpha",
		"chart-section",
		ChartSettingsUpdate{
			Type:               ChartTypeLine,
			SecondYAxisColumns: []string{"humidity", "humidity", " pressure "},
		},
		[]string{"secondYAxisColumns"},
	); err != nil {
		t.Fatalf("SetChartSettings secondYAxisColumns returned error: %v", err)
	}
	if _, err := runtime.SetChartSettings(
		context.Background(),
		"project-alpha",
		"chart-section",
		ChartSettingsUpdate{
			Type:      ChartTypeLine,
			Y1AxisLog: true,
			Y2AxisLog: true,
		},
		[]string{"y1AxisLog", "y2AxisLog"},
	); err != nil {
		t.Fatalf("SetChartSettings axis log returned error: %v", err)
	}
	if _, err := runtime.SetChartType(
		context.Background(),
		"project-alpha",
		"chart-section",
		ChartTypeScatter,
	); err != nil {
		t.Fatalf("SetChartType returned error: %v", err)
	}
	if _, err := runtime.SetChartSettings(
		context.Background(),
		"project-alpha",
		"chart-section",
		ChartSettingsUpdate{
			Type:           ChartTypeScatter,
			CategoryColumn: chartStringPointer("series"),
			YAxisLog:       true,
		},
		[]string{"categoryColumn", "yAxisLog"},
	); err != nil {
		t.Fatalf("SetChartSettings scatter returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "chart-section", "chart-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload chart-section: %v", err)
	}
	if got := payloadRawStringField(payload, "dataPath"); got != "  artifacts/chart.csv  " {
		t.Fatalf("expected literal dataPath, got %q", got)
	}

	chartSettings, ok := payloadObjectField(payload, "chartSettings")
	if !ok {
		t.Fatalf("expected chartSettings object, got %#v", payload["chartSettings"])
	}
	if got := payloadStringField(chartSettings, "type"); got != string(ChartTypeScatter) {
		t.Fatalf("expected chart type %q, got %q", ChartTypeScatter, got)
	}
	if got := payloadRawStringField(chartSettings, "xAxisColumn"); got != "time" {
		t.Fatalf("expected preserved xAxisColumn time, got %q", got)
	}
	if got := payloadRawStringField(chartSettings, "categoryColumn"); got != "series" {
		t.Fatalf("expected categoryColumn series, got %q", got)
	}
	if !payloadBoolField(chartSettings, "xAxisLog") {
		t.Fatal("expected preserved xAxisLog=true")
	}
	if !payloadBoolField(chartSettings, "yAxisLog") {
		t.Fatal("expected yAxisLog=true")
	}
	if got := chartSettings["secondYAxisColumns"]; got != nil {
		t.Fatalf("expected line-only secondYAxisColumns to clear after scatter conversion, got %#v", got)
	}
	if got := chartSettings["y1AxisLog"]; got != nil {
		t.Fatalf("expected line-only y1AxisLog to clear after scatter conversion, got %#v", got)
	}
}

func TestChartSettingsObjectPreservesEmptyLineSeriesArray(t *testing.T) {
	t.Parallel()

	object := chartSettingsObject(defaultChartSettingsState(ChartTypeLine))
	values, ok := object["secondYAxisColumns"].([]any)
	if !ok {
		t.Fatalf("expected secondYAxisColumns array, got %#v", object["secondYAxisColumns"])
	}
	if len(values) != 0 {
		t.Fatalf("expected empty secondYAxisColumns array, got %#v", values)
	}
}

func TestRuntimeChartMutationsRejectInvalidTargetsAndValues(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": chartMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetChartAreaDataPath(context.Background(), "project-alpha", "plain-section", "data.csv"); !errors.Is(err, ErrChartSectionRequired) {
		t.Fatalf("expected ErrChartSectionRequired, got %v", err)
	}
	if _, err := runtime.SetChartType(context.Background(), "project-alpha", "chart-section", ChartType("bar")); !errors.Is(err, ErrChartTypeInvalid) {
		t.Fatalf("expected ErrChartTypeInvalid, got %v", err)
	}
	if _, err := runtime.SetChartSettings(
		context.Background(),
		"project-alpha",
		"plain-section",
		ChartSettingsUpdate{Type: ChartTypeLine},
		nil,
	); !errors.Is(err, ErrChartSectionRequired) {
		t.Fatalf("expected ErrChartSectionRequired, got %v", err)
	}
	if _, err := runtime.SetChartSettings(
		context.Background(),
		"project-alpha",
		"chart-section",
		ChartSettingsUpdate{Type: ChartType("bar")},
		nil,
	); !errors.Is(err, ErrChartTypeInvalid) {
		t.Fatalf("expected ErrChartTypeInvalid, got %v", err)
	}
	if _, err := runtime.SetChartSettings(
		context.Background(),
		"project-alpha",
		"chart-section",
		ChartSettingsUpdate{
			Type:           ChartTypeLine,
			CategoryColumn: chartStringPointer("series"),
		},
		[]string{"categoryColumn"},
	); !errors.Is(err, ErrChartSettingsFieldInvalid) {
		t.Fatalf("expected ErrChartSettingsFieldInvalid, got %v", err)
	}
}

func chartMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chart-section": "chart-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]Section{
			"chart-section": {
				ID:               "chart-section",
				Name:             "Chart Section",
				VariantIDs:       []string{"chart-variant"},
				DefaultVariantID: "chart-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"chart-variant": {ID: "chart-variant", ImplID: "chart-impl"},
			"plain-variant": {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"chart-impl": {
				ID:   "chart-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":       "chart-impl",
					"type":     "Chart",
					"dataPath": "seed-chart.csv",
					"chartSettings": map[string]any{
						"type":               "line",
						"xAxisColumn":        nil,
						"secondYAxisColumns": []string{"humidity"},
						"xAxisLog":           true,
						"y1AxisLog":          false,
						"y2AxisLog":          false,
					},
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize chart mutation project: %v", err)
	}
	return project
}

func chartStringPointer(value string) *string {
	return &value
}
