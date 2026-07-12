//go:build windows

package terminal

import "context"

type systemPTYStarter struct{}

func NewSystemPTYStarter() PTYStarter {
	return systemPTYStarter{}
}

func (starter systemPTYStarter) Start(context.Context, Profile) (PTYHandle, error) {
	return nil, UnsupportedPlatformError{Platform: "windows"}
}
