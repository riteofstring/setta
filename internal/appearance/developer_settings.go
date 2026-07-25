package appearance

import "fmt"

type AppearanceDeveloperSettings struct {
	AllowResizedPanesToOverflowViewport bool `json:"allowResizedPanesToOverflowViewport"`
	OverviewCardMaxWidthPx              int  `json:"overviewCardMaxWidthPx"`
	OverviewCardMinWidthPx              int  `json:"overviewCardMinWidthPx"`
	ShowPerformanceStats                bool `json:"showPerformanceStats"`
}

func validateDeveloperSettings(settings AppearanceDeveloperSettings) error {
	if err := validateOverviewCardWidth("developer.overviewCardMinWidthPx", settings.OverviewCardMinWidthPx); err != nil {
		return err
	}
	if err := validateOverviewCardWidth("developer.overviewCardMaxWidthPx", settings.OverviewCardMaxWidthPx); err != nil {
		return err
	}
	if settings.OverviewCardMinWidthPx > settings.OverviewCardMaxWidthPx {
		return fmt.Errorf("developer overview card min width %d exceeds max width %d", settings.OverviewCardMinWidthPx, settings.OverviewCardMaxWidthPx)
	}
	return nil
}

func validateOverviewCardWidth(label string, value int) error {
	if value < minimumOverviewCardWidthPx || value > maximumOverviewCardWidthPx {
		return fmt.Errorf("%s = %d, want %d-%d", label, value, minimumOverviewCardWidthPx, maximumOverviewCardWidthPx)
	}
	return nil
}
