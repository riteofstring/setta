package typescriptverifier

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"reflect"
	"strings"
	"time"

	evalverifier "setta/internal/evalharness/verifier"
	"setta/internal/jsonio"
)

const maximumResponseBodyBytes = 4 * 1024

func runRouteChecks(
	ctx context.Context,
	workspaceRoot string,
	expectations []routeExpectation,
	requestLog *requestLogExpectation,
) ([]evalverifier.Check, error) {
	server, err := startFixtureServer(ctx, workspaceRoot)
	if err != nil {
		detail := evalverifier.BoundedDetail(fmt.Sprintf("Start built service: %v", err))
		checks := make([]evalverifier.Check, 0, len(expectations)+1)
		for _, expectation := range expectations {
			checks = append(checks, evalverifier.Check{
				ID:     expectation.checkID,
				Passed: false,
				Detail: detail,
			})
		}
		if requestLog != nil {
			checks = append(checks, evalverifier.Check{
				ID:     requestLog.checkID,
				Passed: false,
				Detail: detail,
			})
		}
		return checks, nil
	}
	checks := make([]evalverifier.Check, 0, len(expectations))
	for _, expectation := range expectations {
		checks = append(checks, checkJSONRoute(ctx, server.port, expectation))
	}
	if requestLog != nil {
		checks = append(checks, checkRequestLog(ctx, server.events, *requestLog))
	}
	if err := server.stop(); err != nil {
		return nil, err
	}
	return checks, nil
}

func checkRequestLog(
	ctx context.Context,
	events <-chan fixtureServerEvent,
	expectation requestLogExpectation,
) evalverifier.Check {
	waitContext, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	for {
		select {
		case event, open := <-events:
			if !open {
				return failedRequestLogCheck(expectation, "the service closed its output before logging the request")
			}
			if event.Event != "request" {
				continue
			}
			if event.Method != expectation.method || event.Path != expectation.path {
				return failedRequestLogCheck(
					expectation,
					fmt.Sprintf(
						"logged method/path %q/%q, want %q/%q",
						event.Method,
						event.Path,
						expectation.method,
						expectation.path,
					),
				)
			}
			return evalverifier.Check{
				ID:     expectation.checkID,
				Passed: true,
				Detail: fmt.Sprintf(
					"Request logging recorded method %s and path %s in its JSON event.",
					expectation.method,
					expectation.path,
				),
			}
		case <-waitContext.Done():
			return failedRequestLogCheck(expectation, "no matching request log event arrived")
		}
	}
}

func failedRequestLogCheck(
	expectation requestLogExpectation,
	detail string,
) evalverifier.Check {
	return evalverifier.Check{
		ID:     expectation.checkID,
		Passed: false,
		Detail: evalverifier.BoundedDetail("Request logging verification failed: " + detail + "."),
	}
}

func skippedRouteChecks(expectations []routeExpectation) []evalverifier.Check {
	checks := make([]evalverifier.Check, 0, len(expectations))
	for _, expectation := range expectations {
		checks = append(checks, evalverifier.Check{
			ID:     expectation.checkID,
			Passed: false,
			Detail: "The route was not checked because the fixture build failed.",
		})
	}
	return checks
}

func checkJSONRoute(
	ctx context.Context,
	port int,
	expectation routeExpectation,
) evalverifier.Check {
	attempts := expectation.attempts
	if attempts == 0 {
		attempts = 1
	}
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := checkJSONRouteAttempt(ctx, port, expectation); err != nil {
			return failedRouteCheck(
				expectation,
				fmt.Errorf("attempt %d of %d: %w", attempt, attempts, err),
			)
		}
	}
	return evalverifier.Check{
		ID:     expectation.checkID,
		Passed: true,
		Detail: fmt.Sprintf(
			"GET %s returned status %d, JSON content type, and the exact expected body on %d request(s).",
			expectation.path,
			expectation.status,
			attempts,
		),
	}
}

func checkJSONRouteAttempt(
	ctx context.Context,
	port int,
	expectation routeExpectation,
) error {
	requestContext, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(
		requestContext,
		http.MethodGet,
		fmt.Sprintf("http://127.0.0.1:%d%s", port, expectation.path),
		nil,
	)
	if err != nil {
		return err
	}
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	client := &http.Client{
		Transport: transport,
		Timeout:   10 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != expectation.status {
		return fmt.Errorf("status is %d, want %d", response.StatusCode, expectation.status)
	}
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return fmt.Errorf("content type is %q, want application/json", response.Header.Get("Content-Type"))
	}
	limitedBody := io.LimitReader(response.Body, maximumResponseBodyBytes+1)
	body, err := io.ReadAll(limitedBody)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}
	if len(body) > maximumResponseBodyBytes {
		return errors.New("response body exceeds 4096 bytes")
	}
	var actual map[string]any
	if err := jsonio.DecodeSingle(strings.NewReader(string(body)), &actual); err != nil {
		return fmt.Errorf("decode JSON response: %w", err)
	}
	if !reflect.DeepEqual(actual, expectation.body) {
		return fmt.Errorf("JSON body is %#v, want %#v", actual, expectation.body)
	}
	return nil
}

func failedRouteCheck(expectation routeExpectation, err error) evalverifier.Check {
	return evalverifier.Check{
		ID:     expectation.checkID,
		Passed: false,
		Detail: evalverifier.BoundedDetail(fmt.Sprintf("GET %s failed verification: %v", expectation.path, err)),
	}
}
