package uisettings

import "fmt"

type SettingError struct {
	Code    ErrorCode
	Message string
}

func (e *SettingError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func newSettingError(code ErrorCode, format string, args ...any) error {
	return &SettingError{
		Code:    code,
		Message: fmt.Sprintf(format, args...),
	}
}
