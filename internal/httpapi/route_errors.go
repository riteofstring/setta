package httpapi

import "net/http"

type routeErrorDescriptor struct {
	status int
	code   string
}

var internalRouteErrorDescriptor = routeErrorDescriptor{
	status: http.StatusInternalServerError,
	code:   "internal_error",
}

func writeMappedRouteError(
	w http.ResponseWriter,
	r *http.Request,
	descriptor routeErrorDescriptor,
	message string,
) {
	writeError(w, r, descriptor.status, descriptor.code, message)
}

func writeInternalRouteError(w http.ResponseWriter, r *http.Request) {
	writeMappedRouteError(w, r, internalRouteErrorDescriptor, "Internal Server Error")
}
