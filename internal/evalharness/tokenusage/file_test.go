package tokenusage

import (
	"os"
	"path/filepath"
	"testing"

	"setta/internal/agent"
	"setta/internal/codexapp"
)

func TestFileSinkRoundTripsBoundedObservations(t *testing.T) {
	path := filepath.Join(t.TempDir(), "token-usage.jsonl")
	sink, err := OpenFileSink(path)
	if err != nil {
		t.Fatalf("OpenFileSink: %v", err)
	}
	observation := agent.TokenUsageObservation{
		Attribution: agent.TokenUsageAttribution{
			Bucket:          agent.TokenUsageBucketSystem,
			Role:            agent.TokenUsageRoleAgent,
			InvocationID:    "invocation-file-sink",
			Model:           "gpt-agent",
			ReasoningEffort: "high",
		},
		ProviderThreadID: "provider-thread",
		ProviderTurnID:   "provider-turn",
		TokenUsage: codexapp.ThreadTokenUsage{
			Last:  codexapp.TokenUsageBreakdown{InputTokens: 7, OutputTokens: 5, TotalTokens: 12},
			Total: codexapp.TokenUsageBreakdown{InputTokens: 7, OutputTokens: 5, TotalTokens: 12},
		},
	}
	if err := sink.ObserveTokenUsage(observation); err != nil {
		t.Fatalf("ObserveTokenUsage: %v", err)
	}
	if err := sink.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	decoded, err := DecodeObservations(raw)
	if err != nil {
		t.Fatalf("DecodeObservations: %v", err)
	}
	if len(decoded) != 1 || decoded[0].TokenUsage.Total.TotalTokens != 12 {
		t.Fatalf("decoded observations = %+v", decoded)
	}
	if _, err := OpenFileSink(path); err == nil {
		t.Fatal("OpenFileSink replaced existing telemetry")
	}
}
