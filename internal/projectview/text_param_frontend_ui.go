package projectview

import "setta/internal/projectstate"

// Keep text/date param option ordering and labels Go-owned so the frontend
// does not hand-maintain enum-derived UI metadata.
var (
	frontendTextParamTimeDisplayFormatOptions = []TextParamTimeDisplayFormatOption{
		{Value: projectstate.FrontendTimeDisplayFormatTwentyFourHour, Label: "24-hour"},
		{Value: projectstate.FrontendTimeDisplayFormatTwelveHour, Label: "12-hour"},
	}
	frontendTextParamTimeControlModeOptions = []TextParamTimeControlModeOption{
		{Value: projectstate.FrontendTimeControlModeDisplay, Label: "Display"},
		{Value: projectstate.FrontendTimeControlModeInput, Label: "Input"},
	}
	frontendTextParamTimeDisplayFontOptions = []TextParamTimeDisplayFontOption{
		{Value: projectstate.FrontendTimeDisplayFontClock, Label: "Clock"},
		{Value: projectstate.FrontendTimeDisplayFontMonospace, Label: "Monospace"},
		{Value: projectstate.FrontendTimeDisplayFontSystem, Label: "System"},
	}
	frontendTextParamDateDisplayFormatOptions = []TextParamDateDisplayFormatOption{
		{Value: projectstate.FrontendDateDisplayFormatISO, Label: "ISO (YYYY-MM-DD)"},
		{Value: projectstate.FrontendDateDisplayFormatUS, Label: "US (MM/DD/YYYY)"},
		{Value: projectstate.FrontendDateDisplayFormatEU, Label: "EU (DD/MM/YYYY)"},
		{Value: projectstate.FrontendDateDisplayFormatLong, Label: "Long (Month D, YYYY)"},
	}
	frontendTextParamDateControlModeOptions = []TextParamDateControlModeOption{
		{Value: projectstate.FrontendDateControlModeInput, Label: "Date input"},
		{Value: projectstate.FrontendDateControlModeCalendar, Label: "Calendar"},
	}
	frontendTextParamDateSelectionModeOptions = []TextParamDateSelectionModeOption{
		{Value: projectstate.FrontendDateSelectionModeSingle, Label: "Single date"},
		{Value: projectstate.FrontendDateSelectionModeMultiple, Label: "Multiple dates"},
	}
	frontendTextParamDateCalendarWeekStartOptions = []TextParamDateCalendarWeekStartOption{
		{Value: projectstate.FrontendDateCalendarWeekStartSunday, Label: "Sunday"},
		{Value: projectstate.FrontendDateCalendarWeekStartMonday, Label: "Monday"},
	}
	frontendTextParamCalendarWeekdayLabelsByWeekStart = map[string][]string{
		string(projectstate.FrontendDateCalendarWeekStartSunday): {
			"Sun",
			"Mon",
			"Tue",
			"Wed",
			"Thu",
			"Fri",
			"Sat",
		},
		string(projectstate.FrontendDateCalendarWeekStartMonday): {
			"Mon",
			"Tue",
			"Wed",
			"Thu",
			"Fri",
			"Sat",
			"Sun",
		},
	}
)

type TextParamTimeDisplayFormatOption struct {
	Value projectstate.FrontendTimeDisplayFormat `json:"value"`
	Label string                                 `json:"label"`
}

type TextParamTimeControlModeOption struct {
	Value projectstate.FrontendTimeControlMode `json:"value"`
	Label string                               `json:"label"`
}

type TextParamTimeDisplayFontOption struct {
	Value projectstate.FrontendTimeDisplayFont `json:"value"`
	Label string                               `json:"label"`
}

type TextParamDateDisplayFormatOption struct {
	Value projectstate.FrontendDateDisplayFormat `json:"value"`
	Label string                                 `json:"label"`
}

type TextParamDateControlModeOption struct {
	Value projectstate.FrontendDateControlMode `json:"value"`
	Label string                               `json:"label"`
}

type TextParamDateSelectionModeOption struct {
	Value projectstate.FrontendDateSelectionMode `json:"value"`
	Label string                                 `json:"label"`
}

type TextParamDateCalendarWeekStartOption struct {
	Value projectstate.FrontendDateCalendarWeekStart `json:"value"`
	Label string                                     `json:"label"`
}

type TextParamUIConfigValue struct {
	TimeDisplayFormatOptions         []TextParamTimeDisplayFormatOption     `json:"timeDisplayFormatOptions"`
	TimeControlModeOptions           []TextParamTimeControlModeOption       `json:"timeControlModeOptions"`
	TimeDisplayFontOptions           []TextParamTimeDisplayFontOption       `json:"timeDisplayFontOptions"`
	DateDisplayFormatOptions         []TextParamDateDisplayFormatOption     `json:"dateDisplayFormatOptions"`
	DateControlModeOptions           []TextParamDateControlModeOption       `json:"dateControlModeOptions"`
	DateSelectionModeOptions         []TextParamDateSelectionModeOption     `json:"dateSelectionModeOptions"`
	DateCalendarWeekStartOptions     []TextParamDateCalendarWeekStartOption `json:"dateCalendarWeekStartOptions"`
	CalendarWeekdayLabelsByWeekStart map[string][]string                    `json:"calendarWeekdayLabelsByWeekStart" ts_type:"Record<DateCalendarWeekStart, string[]>"`
}

func FrontendValueTextParamUIConfig() TextParamUIConfigValue {
	return TextParamUIConfigValue{
		TimeDisplayFormatOptions:         append([]TextParamTimeDisplayFormatOption(nil), frontendTextParamTimeDisplayFormatOptions...),
		TimeControlModeOptions:           append([]TextParamTimeControlModeOption(nil), frontendTextParamTimeControlModeOptions...),
		TimeDisplayFontOptions:           append([]TextParamTimeDisplayFontOption(nil), frontendTextParamTimeDisplayFontOptions...),
		DateDisplayFormatOptions:         append([]TextParamDateDisplayFormatOption(nil), frontendTextParamDateDisplayFormatOptions...),
		DateControlModeOptions:           append([]TextParamDateControlModeOption(nil), frontendTextParamDateControlModeOptions...),
		DateSelectionModeOptions:         append([]TextParamDateSelectionModeOption(nil), frontendTextParamDateSelectionModeOptions...),
		DateCalendarWeekStartOptions:     append([]TextParamDateCalendarWeekStartOption(nil), frontendTextParamDateCalendarWeekStartOptions...),
		CalendarWeekdayLabelsByWeekStart: cloneStringSliceMap(frontendTextParamCalendarWeekdayLabelsByWeekStart),
	}
}

func cloneStringSliceMap(input map[string][]string) map[string][]string {
	output := make(map[string][]string, len(input))
	for key, values := range input {
		output[key] = append([]string(nil), values...)
	}
	return output
}
