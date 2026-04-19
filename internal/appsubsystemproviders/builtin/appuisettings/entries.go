package appuisettings

import (
	"setta/internal/appsubsystem/appdefinition"
	neutralappuisettings "setta/internal/appsubsystem/appuisettings"
	"setta/internal/uisettings"
)

func BuildEntries(service appdefinition.Runtime, pluginID string) ([]uisettings.RuntimeEntry, error) {
	return neutralappuisettings.BuildEntries(service, pluginID)
}
