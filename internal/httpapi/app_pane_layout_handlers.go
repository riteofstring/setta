package httpapi

import "net/http"

func (handler handler) readAppPaneLayout(response http.ResponseWriter, request *http.Request) {
	service := requireAppPaneLayoutService(response, handler.appPaneLayoutService)
	if service == nil {
		return
	}
	layout, err := service.ReadLayout()
	if err != nil {
		writeAppPaneLayoutError(response, "read_app_pane_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, layout)
}

func (handler handler) saveAppPaneLayout(response http.ResponseWriter, request *http.Request) {
	service := requireAppPaneLayoutService(response, handler.appPaneLayoutService)
	if service == nil {
		return
	}
	var payload SaveAppPaneLayoutRequest
	if !decodeRequest(response, request, &payload) {
		return
	}
	layout, err := service.SaveLayout(payload.Layout)
	if err != nil {
		writeAppPaneLayoutError(response, "save_app_pane_layout_failed", err)
		return
	}
	writeJSON(response, http.StatusOK, layout)
}
