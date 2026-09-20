package httpjson

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/setta/local-backend/strictjson"
)

const ContentType = "application/json; charset=utf-8"

var (
	ErrEmptyBody       = errors.New("httpjson: request body is empty")
	ErrMaximumBodySize = errors.New("httpjson: request body exceeds the size limit")
	ErrMediaType       = errors.New("httpjson: Content-Type must be application/json")
)

func RequireMethod(response http.ResponseWriter, request *http.Request, methods ...string) bool {
	for _, method := range methods {
		if request.Method == method {
			return true
		}
	}
	response.Header().Set("Allow", strings.Join(methods, ", "))
	return false
}

func HasJSONMediaType(request *http.Request) bool {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	return err == nil && mediaType == "application/json"
}

func DecodeRequest(response http.ResponseWriter, request *http.Request, maximum int64, target any) error {
	if !HasJSONMediaType(request) {
		return ErrMediaType
	}
	if maximum <= 0 || maximum > strictjson.MaximumBytes {
		return errors.New("httpjson: request size limit is invalid")
	}
	reader := http.MaxBytesReader(response, request.Body, maximum)
	data, err := io.ReadAll(reader)
	if err != nil {
		var maximumError *http.MaxBytesError
		if errors.As(err, &maximumError) {
			return fmt.Errorf("%w: %v", ErrMaximumBodySize, err)
		}
		return fmt.Errorf("httpjson: read request body: %w", err)
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return ErrEmptyBody
	}
	return strictjson.Decode(data, target)
}

func Write(response http.ResponseWriter, status int, value any) error {
	encoded, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("httpjson: encode response: %w", err)
	}
	response.Header().Set("Content-Type", ContentType)
	response.WriteHeader(status)
	if _, err := response.Write(append(encoded, '\n')); err != nil {
		return fmt.Errorf("httpjson: write response: %w", err)
	}
	return nil
}
