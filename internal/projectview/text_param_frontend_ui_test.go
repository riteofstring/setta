package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValueTextParamUIConfigUsesGoOwnedTextParamMetadata(t *testing.T) {
	config := FrontendValueTextParamUIConfig()

	if got, want := config.TimeDisplayFormatOptions, []TextParamTimeDisplayFormatOption{
		{Value: projectstate.FrontendTimeDisplayFormatTwentyFourHour, Label: "24-hour"},
		{Value: projectstate.FrontendTimeDisplayFormatTwelveHour, Label: "12-hour"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected time display format options: %#v", got)
	}

	if got, want := config.TimeControlModeOptions, []TextParamTimeControlModeOption{
		{Value: projectstate.FrontendTimeControlModeDisplay, Label: "Display"},
		{Value: projectstate.FrontendTimeControlModeInput, Label: "Input"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected time control mode options: %#v", got)
	}

	if got, want := config.TimeDisplayFontOptions, []TextParamTimeDisplayFontOption{
		{Value: projectstate.FrontendTimeDisplayFontClock, Label: "Clock"},
		{Value: projectstate.FrontendTimeDisplayFontMonospace, Label: "Monospace"},
		{Value: projectstate.FrontendTimeDisplayFontSystem, Label: "System"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected time display font options: %#v", got)
	}

	if got, want := config.DateDisplayFormatOptions, []TextParamDateDisplayFormatOption{
		{Value: projectstate.FrontendDateDisplayFormatISO, Label: "ISO (YYYY-MM-DD)"},
		{Value: projectstate.FrontendDateDisplayFormatUS, Label: "US (MM/DD/YYYY)"},
		{Value: projectstate.FrontendDateDisplayFormatEU, Label: "EU (DD/MM/YYYY)"},
		{Value: projectstate.FrontendDateDisplayFormatLong, Label: "Long (Month D, YYYY)"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected date display format options: %#v", got)
	}

	if got, want := config.DateControlModeOptions, []TextParamDateControlModeOption{
		{Value: projectstate.FrontendDateControlModeInput, Label: "Date input"},
		{Value: projectstate.FrontendDateControlModeCalendar, Label: "Calendar"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected date control mode options: %#v", got)
	}

	if got, want := config.DateSelectionModeOptions, []TextParamDateSelectionModeOption{
		{Value: projectstate.FrontendDateSelectionModeSingle, Label: "Single date"},
		{Value: projectstate.FrontendDateSelectionModeMultiple, Label: "Multiple dates"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected date selection mode options: %#v", got)
	}

	if got, want := config.DateCalendarWeekStartOptions, []TextParamDateCalendarWeekStartOption{
		{Value: projectstate.FrontendDateCalendarWeekStartSunday, Label: "Sunday"},
		{Value: projectstate.FrontendDateCalendarWeekStartMonday, Label: "Monday"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected date calendar week start options: %#v", got)
	}

	if got, want := config.CalendarWeekdayLabelsByWeekStart, map[string][]string{
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
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected calendar weekday labels by week start: %#v", got)
	}
}
