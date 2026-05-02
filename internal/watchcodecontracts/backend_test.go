package watchcodecontracts

import (
	"net/http"
	"testing"
)

func TestBackendErrorHTTPStatus(t *testing.T) {
	tests := []struct {
		code string
		want int
	}{
		{code: BackendErrorInvalidJSON, want: http.StatusBadRequest},
		{code: BackendErrorInvalidRequest, want: http.StatusBadRequest},
		{code: BackendErrorInternal, want: http.StatusInternalServerError},
		{code: BackendErrorMethodNotAllowed, want: http.StatusMethodNotAllowed},
		{code: BackendErrorNotFound, want: http.StatusNotFound},
		{code: BackendErrorProjectConfigIDRequired, want: http.StatusBadRequest},
		{code: BackendErrorProjectConfigNotFound, want: http.StatusNotFound},
		{code: BackendErrorInvalidWatchCodeInput, want: http.StatusBadRequest},
		{code: BackendErrorProviderRequired, want: http.StatusConflict},
		{code: "unknown", want: http.StatusInternalServerError},
	}
	for _, test := range tests {
		if got := BackendErrorHTTPStatus(test.code); got != test.want {
			t.Fatalf("BackendErrorHTTPStatus(%q) = %d, want %d", test.code, got, test.want)
		}
	}
}

func TestBackendErrorHTTPStatusByCodeReturnsCopy(t *testing.T) {
	statuses := BackendErrorHTTPStatusByCode()
	statuses[BackendErrorProviderRequired] = http.StatusTeapot

	if got := BackendErrorHTTPStatus(BackendErrorProviderRequired); got != http.StatusConflict {
		t.Fatalf("BackendErrorHTTPStatus mutated through returned map: got %d", got)
	}
}
