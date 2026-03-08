package realtime

import (
	"context"
	"errors"
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
