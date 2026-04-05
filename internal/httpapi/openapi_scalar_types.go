package httpapi

import (
	"github.com/danielgtaylor/huma/v2"
	"setta/internal/config"
)

type openAPIServerMode config.Mode

func (openAPIServerMode) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Type: huma.TypeString,
		Enum: []any{
			string(config.ModeIDE),
			string(config.ModeShare),
			string(config.ModeApp),
			string(config.ModeLauncher),
		},
	}
}
