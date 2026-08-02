package modes

import (
	"net/http"

	"setta/internal/config"
)

type Policy struct {
	mode config.Mode
}

type Violation struct {
	StatusCode int
	Code       string
	Message    string
}

func (e *Violation) Error() string {
	return e.Message
}

func NewPolicy(mode config.Mode) Policy {
	if mode == "" {
		mode = config.ModeIDE
	}
	return Policy{mode: mode}
}

func (p Policy) Mode() config.Mode {
	if p.mode == "" {
		return config.ModeIDE
	}
	return p.mode
}

func (p Policy) IsIDE() bool {
	return p.Mode() == config.ModeIDE
}

func (p Policy) IsShare() bool {
	return p.Mode() == config.ModeShare
}

func (p Policy) IsApp() bool {
	return p.Mode() == config.ModeApp
}

func (p Policy) IsLauncher() bool {
	return p.Mode() == config.ModeLauncher
}

func (p Policy) IsDeployment() bool {
	return p.IsShare() || p.IsApp()
}

func (p Policy) RequireIDE() error {
	if p.IsDeployment() {
		return forbidden("mode_forbidden", "Deployment mode does not allow this endpoint.")
	}
	if p.IsLauncher() {
		return forbidden("mode_forbidden", "Launcher mode does not allow this endpoint.")
	}
	return nil
}

func (p Policy) RequireFullIDE() error {
	return p.RequireIDE()
}

func (p Policy) RequireLauncher() error {
	if !p.IsLauncher() {
		return forbidden("mode_forbidden", "Launcher mode does not allow this endpoint.")
	}
	return nil
}

func (p Policy) RequireNotLauncher() error {
	if p.IsLauncher() {
		return forbidden("mode_forbidden", "Launcher mode does not allow this endpoint.")
	}
	return nil
}

func forbidden(code string, message string) *Violation {
	return &Violation{
		StatusCode: http.StatusForbidden,
		Code:       code,
		Message:    message,
	}
}
