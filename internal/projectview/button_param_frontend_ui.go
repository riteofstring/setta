package projectview

import "setta/internal/projectstate"

// Keep button param editor enum metadata and defaults Go-owned so the
// frontend does not hand-maintain button mode/method labels, ordering, or
// fallback defaults.
var (
	frontendButtonParamActionModeOptions = []ButtonParamActionModeOption{
		{Value: projectstate.FrontendButtonActionModeWebsocketListener, Label: "Websocket listener"},
		{Value: projectstate.FrontendButtonActionModeHTTPRequest, Label: "HTTP request"},
		{Value: projectstate.FrontendButtonActionModeSettaAPI, Label: "Setta API"},
	}
	frontendButtonParamRequestMethodOptions = []ButtonParamRequestMethodOption{
		{Value: projectstate.FrontendHTTPRequestMethodGet, Label: "GET"},
		{Value: projectstate.FrontendHTTPRequestMethodPost, Label: "POST"},
		{Value: projectstate.FrontendHTTPRequestMethodPut, Label: "PUT"},
		{Value: projectstate.FrontendHTTPRequestMethodPatch, Label: "PATCH"},
		{Value: projectstate.FrontendHTTPRequestMethodDelete, Label: "DELETE"},
		{Value: projectstate.FrontendHTTPRequestMethodHead, Label: "HEAD"},
		{Value: projectstate.FrontendHTTPRequestMethodOptions, Label: "OPTIONS"},
	}
)

type ButtonParamActionModeOption struct {
	Value projectstate.FrontendButtonActionMode `json:"value"`
	Label string                                `json:"label"`
}

type ButtonParamRequestMethodOption struct {
	Value projectstate.FrontendHTTPRequestMethod `json:"value"`
	Label string                                 `json:"label"`
}

type ButtonParamUIConfigValue struct {
	DefaultActionMode    projectstate.FrontendButtonActionMode  `json:"defaultActionMode"`
	DefaultRequestMethod projectstate.FrontendHTTPRequestMethod `json:"defaultRequestMethod"`
	ActionModeOptions    []ButtonParamActionModeOption          `json:"actionModeOptions"`
	RequestMethodOptions []ButtonParamRequestMethodOption       `json:"requestMethodOptions"`
}

func FrontendValueButtonParamUIConfig() ButtonParamUIConfigValue {
	return ButtonParamUIConfigValue{
		DefaultActionMode:    projectstate.FrontendButtonActionModeWebsocketListener,
		DefaultRequestMethod: projectstate.FrontendHTTPRequestMethodPost,
		ActionModeOptions:    append([]ButtonParamActionModeOption(nil), frontendButtonParamActionModeOptions...),
		RequestMethodOptions: append([]ButtonParamRequestMethodOption(nil), frontendButtonParamRequestMethodOptions...),
	}
}
