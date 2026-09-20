package httpjson

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type requestDocument struct {
	Name string `json:"name"`
}

func TestRequireMethodSetsExactAllowHeader(t *testing.T) {
	request := httptest.NewRequest(http.MethodDelete, "/", nil)
	response := httptest.NewRecorder()
	if RequireMethod(response, request, http.MethodGet, http.MethodHead) {
		t.Fatal("RequireMethod() = true")
	}
	if allow := response.Header().Get("Allow"); allow != "GET, HEAD" {
		t.Fatalf("Allow = %q", allow)
	}
	request.Method = http.MethodHead
	if !RequireMethod(response, request, http.MethodGet, http.MethodHead) {
		t.Fatal("RequireMethod(allowed) = false")
	}
}

func TestDecodeRequestEnforcesMediaTypeSizeAndStrictJSON(t *testing.T) {
	testCases := []struct {
		name        string
		contentType string
		body        string
		maximum     int64
		want        error
	}{
		{name: "valid", contentType: "application/json; charset=utf-8", body: `{"name":"valid"}`, maximum: 100},
		{name: "media type", contentType: "text/plain", body: `{}`, maximum: 100, want: ErrMediaType},
		{name: "empty", contentType: "application/json", body: " \n", maximum: 100, want: ErrEmptyBody},
		{name: "size", contentType: "application/json", body: `{"name":"large"}`, maximum: 4, want: ErrMaximumBodySize},
		{name: "duplicate", contentType: "application/json", body: `{"name":"first","name":"second"}`, maximum: 100},
		{name: "unknown", contentType: "application/json", body: `{"unknown":true}`, maximum: 100},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", testCase.contentType)
			response := httptest.NewRecorder()
			var document requestDocument
			err := DecodeRequest(response, request, testCase.maximum, &document)
			if testCase.want != nil && !errors.Is(err, testCase.want) {
				t.Fatalf("DecodeRequest() error = %v, want %v", err, testCase.want)
			}
			if testCase.want == nil && testCase.name != "valid" && err == nil {
				t.Fatal("DecodeRequest() error = nil")
			}
			if testCase.name == "valid" && (err != nil || document.Name != "valid") {
				t.Fatalf("DecodeRequest() = %#v, %v", document, err)
			}
		})
	}
}

func TestWriteSetsCanonicalContentTypeAfterEncoding(t *testing.T) {
	response := httptest.NewRecorder()
	if err := Write(response, http.StatusCreated, requestDocument{Name: "value"}); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if response.Code != http.StatusCreated || response.Header().Get("Content-Type") != ContentType || response.Body.String() != "{\"name\":\"value\"}\n" {
		t.Fatalf("response = %d, %q, %q", response.Code, response.Header().Get("Content-Type"), response.Body.String())
	}
	failed := httptest.NewRecorder()
	if err := Write(failed, http.StatusOK, make(chan int)); err == nil {
		t.Fatal("Write(unencodable) error = nil")
	}
	if failed.Code != http.StatusOK || failed.Body.Len() != 0 || failed.Header().Get("Content-Type") != "" {
		t.Fatalf("failed response = %d, %q, %q", failed.Code, failed.Header().Get("Content-Type"), failed.Body.String())
	}
}
