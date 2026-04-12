package projectview

import "setta/internal/projectstate"

// Keep task board recurrence option ordering and labels Go-owned so the
// frontend does not hand-maintain recurrence enum metadata.
var (
	frontendTaskBoardRecurrenceOptions = []TaskBoardRecurrenceOption{
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceNone, Label: "No repeat"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceHourly, Label: "Hourly"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceDaily, Label: "Daily"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceSpecifiedDays, Label: "Repeat specified days"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceSpecifiedMonths, Label: "Repeat specified months"},
		{Value: projectstate.FrontendTaskBoardTaskRecurrenceSpecifiedYears, Label: "Repeat specified years"},
	}
	frontendTaskBoardWeekdayOptions = []TaskBoardRecurringWeekdayOption{
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayMonday, Label: "Mon"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayTuesday, Label: "Tue"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayWednesday, Label: "Wed"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayThursday, Label: "Thu"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdayFriday, Label: "Fri"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdaySaturday, Label: "Sat"},
		{Value: projectstate.FrontendTaskBoardRecurringWeekdaySunday, Label: "Sun"},
	}
	frontendTaskBoardMonthOptions = []TaskBoardRecurringMonthOption{
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
	}
)

type TaskBoardRecurrenceOption struct {
	Value projectstate.FrontendTaskBoardTaskRecurrence `json:"value"`
	Label string                                       `json:"label"`
}

type TaskBoardRecurringWeekdayOption struct {
	Value projectstate.FrontendTaskBoardRecurringWeekday `json:"value"`
	Label string                                         `json:"label"`
}

type TaskBoardRecurringMonthOption struct {
	Value projectstate.FrontendTaskBoardRecurringMonth `json:"value"`
	Label string                                       `json:"label"`
}

type TaskBoardUIConfigValue struct {
	RecurrenceOptions []TaskBoardRecurrenceOption       `json:"recurrenceOptions"`
	WeekdayOptions    []TaskBoardRecurringWeekdayOption `json:"weekdayOptions"`
	MonthOptions      []TaskBoardRecurringMonthOption   `json:"monthOptions"`
}

func FrontendValueTaskBoardUIConfig() TaskBoardUIConfigValue {
	return TaskBoardUIConfigValue{
		RecurrenceOptions: append([]TaskBoardRecurrenceOption(nil), frontendTaskBoardRecurrenceOptions...),
		WeekdayOptions:    append([]TaskBoardRecurringWeekdayOption(nil), frontendTaskBoardWeekdayOptions...),
		MonthOptions:      append([]TaskBoardRecurringMonthOption(nil), frontendTaskBoardMonthOptions...),
	}
}
