package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValueTaskBoardUIConfigUsesGoOwnedTaskBoardMetadata(t *testing.T) {
	config := FrontendValueTaskBoardUIConfig()

	if got, want := config.ViewModeOptions, []TaskBoardViewModeOption{
		{Value: projectstate.TaskBoardViewModeTaskList, Label: "Task List"},
		{Value: projectstate.TaskBoardViewModeKanban, Label: "Kanban"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected view mode options: %#v", got)
	}

	if got, want := config.RecurrenceOptions, []TaskBoardRecurrenceOption{
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceNone, Label: "No repeat"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceHourly, Label: "Hourly"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceDaily, Label: "Daily"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceSpecifiedDays, Label: "Repeat specified days"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceSpecifiedMonths, Label: "Repeat specified months"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceSpecifiedYears, Label: "Repeat specified years"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected recurrence options: %#v", got)
	}

	if got, want := config.WeekdayOptions, []TaskBoardRecurringWeekdayOption{
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayMonday, Label: "Mon"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayTuesday, Label: "Tue"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayWednesday, Label: "Wed"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayThursday, Label: "Thu"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayFriday, Label: "Fri"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdaySaturday, Label: "Sat"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdaySunday, Label: "Sun"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected weekday options: %#v", got)
	}

	if got, want := config.MonthOptions, []TaskBoardRecurringMonthOption{
		{Value: projectstate.FrontendTaskBoardRecurringMonthJanuary, Label: "Jan"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthFebruary, Label: "Feb"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthMarch, Label: "Mar"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthApril, Label: "Apr"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthMay, Label: "May"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthJune, Label: "Jun"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthJuly, Label: "Jul"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthAugust, Label: "Aug"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthSeptember, Label: "Sep"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthOctober, Label: "Oct"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthNovember, Label: "Nov"},
		{Value: projectstate.FrontendTaskBoardRecurringMonthDecember, Label: "Dec"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected month options: %#v", got)
	}
}
