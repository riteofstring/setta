package runtimereporting

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"time"

	"setta/internal/controlplane"
	"setta/internal/httpapi"
	"setta/internal/runtimeaccounting"
)

const (
	defaultRequestTimeout  = 10 * time.Second
	maximumCredentialBytes = 16 * 1024
)

type ClientConfig struct {
	BaseURL    string
	Credential controlplane.RuntimeReportingCredential
	HTTPClient *http.Client
}

type Client struct {
	credential controlplane.RuntimeReportingCredential
	endpoint   string
	httpClient *http.Client
}

type ReportError struct {
	StatusCode int
}

func (err *ReportError) Error() string {
	if err.StatusCode != 0 {
		return fmt.Sprintf("runtime accounting report failed with HTTP status %d", err.StatusCode)
	}
	return "runtime accounting report failed"
}

func NewClient(config ClientConfig) (*Client, error) {
	endpoint, err := reportEndpointURL(config.BaseURL)
	if err != nil {
		return nil, err
	}
	if err := controlplane.ValidateRuntimeReportingCredential(config.Credential); err != nil {
		return nil, err
	}
	client := config.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: defaultRequestTimeout}
	}
	return &Client{
		credential: config.Credential,
		endpoint:   endpoint,
		httpClient: client,
	}, nil
}

func (client *Client) RecordTransition(
	ctx context.Context,
	transition runtimeaccounting.ActivityTransition,
) error {
	body, err := json.Marshal(transition)
	if err != nil {
		return &ReportError{}
	}
	request, err := http.NewRequestWithContext(
		ctx,
		httpapi.RuntimeAccountingReportEndpoint().Method,
		client.endpoint,
		bytes.NewReader(body),
	)
	if err != nil {
		return &ReportError{}
	}
	request.Header.Set("Authorization", "Bearer "+client.credential.Token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.httpClient.Do(request)
	if err != nil {
		return &ReportError{}
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4*1024))
	if response.StatusCode != http.StatusNoContent {
		return &ReportError{StatusCode: response.StatusCode}
	}
	return nil
}

func ReadCredentialFile(path string) (controlplane.RuntimeReportingCredential, error) {
	pathInfo, err := os.Lstat(path)
	if err != nil {
		return controlplane.RuntimeReportingCredential{}, err
	}
	if pathInfo.Mode()&os.ModeSymlink != 0 {
		return controlplane.RuntimeReportingCredential{}, errors.New(
			"runtime reporting credential path must not be a symbolic link",
		)
	}
	file, err := os.Open(path)
	if err != nil {
		return controlplane.RuntimeReportingCredential{}, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return controlplane.RuntimeReportingCredential{}, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 {
		return controlplane.RuntimeReportingCredential{}, errors.New(
			"runtime reporting credential path must be a private regular file",
		)
	}
	decoder := json.NewDecoder(io.LimitReader(file, maximumCredentialBytes+1))
	decoder.DisallowUnknownFields()
	var credential controlplane.RuntimeReportingCredential
	if err := decoder.Decode(&credential); err != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return controlplane.RuntimeReportingCredential{}, errors.New(
			"runtime reporting credential file must contain one valid JSON value",
		)
	}
	if err := controlplane.ValidateRuntimeReportingCredential(credential); err != nil {
		return controlplane.RuntimeReportingCredential{}, err
	}
	return credential, nil
}

func reportEndpointURL(baseURL string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil || !parsed.IsAbs() || parsed.Host == "" ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
		(parsed.Path != "" && parsed.Path != "/") {
		return "", errors.New("runtime reporting base URL must be an absolute origin")
	}
	if parsed.Scheme != "https" && !isLoopbackHTTPOrigin(parsed) {
		return "", errors.New("runtime reporting base URL must use HTTPS or loopback HTTP")
	}
	parsed.Path = httpapi.RuntimeAccountingReportEndpoint().Path
	return parsed.String(), nil
}

func isLoopbackHTTPOrigin(origin *url.URL) bool {
	if origin.Scheme != "http" {
		return false
	}
	address, err := netip.ParseAddr(origin.Hostname())
	return err == nil && address.IsLoopback()
}
