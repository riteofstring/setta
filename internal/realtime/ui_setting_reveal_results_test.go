package realtime

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestUISettingRevealResultHubWaitReturnsResolvedResult(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-1", RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID:     "frontend-1",
		ExpectedProjectConfigID: "project-alpha",
		ExpectedSettingIDs:      []string{"core.project.show_param_display_names"},
	}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	resolved := hub.Resolve(UISettingRevealResultContent{
		ProjectConfigID: "project-alpha",
		RequestID:       "request-1",
		Statuses: []UISettingRevealResultStatus{
			{
				SettingID: "core.project.show_param_display_names",
				Status:    "revealed",
			},
		},
	}, "frontend-1")
	if !resolved {
		t.Fatal("expected registered reveal request to resolve")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	result, err := hub.Wait(ctx, "request-1")
	if err != nil {
		t.Fatalf("wait for result: %v", err)
	}
	if result.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha project id, got %q", result.ProjectConfigID)
	}
	if len(result.Statuses) != 1 || result.Statuses[0].Status != "revealed" {
		t.Fatalf("expected revealed status, got %#v", result.Statuses)
	}
}

func TestUISettingRevealResultHubAcceptsAnyWebsocketWithoutExpectedBinding(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-2", RegisterUISettingRevealRequestParams{}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	resolved := hub.Resolve(UISettingRevealResultContent{
		ProjectConfigID: "project-alpha",
		RequestID:       "request-2",
		Statuses: []UISettingRevealResultStatus{
			{
				SettingID: "core.project.show_param_display_names",
				Status:    "revealed",
			},
		},
	}, "frontend-any")
	if !resolved {
		t.Fatal("expected unbound reveal request to resolve")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	result, err := hub.Wait(ctx, "request-2")
	if err != nil {
		t.Fatalf("wait for result: %v", err)
	}
	if result.RequestID != "request-2" {
		t.Fatalf("expected request-2 request id, got %q", result.RequestID)
	}
}

func TestUISettingRevealResultHubFailsClosedOnContractMismatch(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-1", RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID:     "frontend-1",
		ExpectedProjectConfigID: "project-alpha",
		ExpectedSettingIDs:      []string{"core.project.show_param_display_names"},
	}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	if !hub.Resolve(UISettingRevealResultContent{
		ProjectConfigID: "project-beta",
		RequestID:       "request-1",
		Statuses: []UISettingRevealResultStatus{
			{
				SettingID: "core.project.show_param_display_names",
				Status:    "revealed",
			},
		},
	}, "frontend-2") {
		t.Fatal("expected mismatch response to be consumed by registered waiter")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err := hub.Wait(ctx, "request-1")
	if err == nil {
		t.Fatal("expected contract mismatch error")
	}
	var mismatch *RevealResultContractMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("expected RevealResultContractMismatchError, got %T", err)
	}
}

func TestUISettingRevealResultHubFailsClosedOnWebsocketMismatch(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-1b", RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID: "frontend-a",
	}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	if !hub.Resolve(UISettingRevealResultContent{
		ProjectConfigID: "project-alpha",
		RequestID:       "request-1b",
		Statuses: []UISettingRevealResultStatus{
			{
				SettingID: "core.project.show_param_display_names",
				Status:    "failed",
			},
		},
	}, "frontend-b") {
		t.Fatal("expected websocket-mismatch response to be consumed by registered waiter")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err := hub.Wait(ctx, "request-1b")
	if err == nil {
		t.Fatal("expected websocket mismatch error")
	}
	var mismatch *RevealResultContractMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("expected RevealResultContractMismatchError, got %T", err)
	}
	if !strings.Contains(mismatch.Error(), "websocket mismatch") {
		t.Fatalf("expected websocket-mismatch message, got %q", mismatch.Error())
	}
}

func TestUISettingRevealResultHubCancelRequestDropsWaiter(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-3", RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID: "frontend-a",
	}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	if cancelled := hub.CancelRequest("request-3"); !cancelled {
		t.Fatal("expected first cancel_request call to drop waiter")
	}
	if cancelled := hub.CancelRequest("request-3"); cancelled {
		t.Fatal("expected second cancel_request call to report no waiter")
	}
	if resolved := hub.Resolve(UISettingRevealResultContent{
		ProjectConfigID: "project-alpha",
		RequestID:       "request-3",
		Statuses: []UISettingRevealResultStatus{
			{
				SettingID: "core.project.show_param_display_names",
				Status:    "revealed",
			},
		},
	}, "frontend-a"); resolved {
		t.Fatal("expected resolved=false after waiter cancellation")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err := hub.Wait(ctx, "request-3")
	if !errors.Is(err, ErrUISettingRevealRequestNotRegistered) {
		t.Fatalf("expected ErrUISettingRevealRequestNotRegistered after cancel, got %v", err)
	}
}

func TestUISettingRevealResultHubCancelsRequestsForDisconnectedWebsocket(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-1", RegisterUISettingRevealRequestParams{
		ExpectedWebsocketID: "frontend-1",
	}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	if cancelled := hub.CancelRequestsForWebsocketID("frontend-1"); cancelled != 1 {
		t.Fatalf("expected one cancelled request, got %d", cancelled)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err := hub.Wait(ctx, "request-1")
	if err == nil {
		t.Fatal("expected disconnect error")
	}
	var disconnected *RevealResultTransportDisconnectedError
	if !errors.As(err, &disconnected) {
		t.Fatalf("expected RevealResultTransportDisconnectedError, got %T", err)
	}
}

func TestUISettingRevealResultHubFailsClosedOnProjectMismatch(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-4", RegisterUISettingRevealRequestParams{
		ExpectedProjectConfigID: "project-expected",
	}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	if !hub.Resolve(UISettingRevealResultContent{
		ProjectConfigID: "project-other",
		RequestID:       "request-4",
		Statuses: []UISettingRevealResultStatus{
			{
				SettingID: "core.project.show_param_display_names",
				Status:    "revealed",
			},
		},
	}, "frontend-a") {
		t.Fatal("expected project-mismatch response to be consumed by registered waiter")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err := hub.Wait(ctx, "request-4")
	if err == nil {
		t.Fatal("expected project mismatch error")
	}
	var mismatch *RevealResultContractMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("expected RevealResultContractMismatchError, got %T", err)
	}
	if !strings.Contains(mismatch.Error(), "project mismatch") {
		t.Fatalf("expected project-mismatch message, got %q", mismatch.Error())
	}
}

func TestUISettingRevealResultHubFailsClosedOnSettingIDMismatch(t *testing.T) {
	t.Parallel()

	hub := NewUISettingRevealResultHub()
	if err := hub.RegisterRequest("request-5", RegisterUISettingRevealRequestParams{
		ExpectedSettingIDs: []string{"setting-a"},
	}); err != nil {
		t.Fatalf("register request: %v", err)
	}

	if !hub.Resolve(UISettingRevealResultContent{
		ProjectConfigID: "project-alpha",
		RequestID:       "request-5",
		Statuses: []UISettingRevealResultStatus{
			{
				SettingID: "setting-b",
				Status:    "revealed",
			},
		},
	}, "frontend-a") {
		t.Fatal("expected setting-id-mismatch response to be consumed by registered waiter")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	_, err := hub.Wait(ctx, "request-5")
	if err == nil {
		t.Fatal("expected setting-id mismatch error")
	}
	var mismatch *RevealResultContractMismatchError
	if !errors.As(err, &mismatch) {
		t.Fatalf("expected RevealResultContractMismatchError, got %T", err)
	}
	if !strings.Contains(mismatch.Error(), "setting id mismatch") {
		t.Fatalf("expected setting-id-mismatch message, got %q", mismatch.Error())
	}
}
