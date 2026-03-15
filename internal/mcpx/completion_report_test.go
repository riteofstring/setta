package mcpx

import "testing"

func TestBuildCompletionStatusReportNormalizesAndDerivesVerificationStatus(t *testing.T) {
	t.Parallel()

	report, err := buildCompletionStatusReport(map[string]any{
		"taskId":               "   ",
		"completionIntent":     true,
		"requiresVerification": true,
		"checkResults": []any{
			map[string]any{
				"checkName": "  unit tests  ",
				"status":    "passed",
				"details":   "   ",
				"source":    "  go test  ",
			},
			map[string]any{
				"checkName": "lint",
				"required":  false,
				"status":    "failed",
			},
		},
	})
	if err != nil {
		t.Fatalf("build completion report: %v", err)
	}

	if report.TaskID != nil {
		t.Fatalf("expected blank taskId to normalize to nil, got %#v", report.TaskID)
	}
	if !report.CompletionIntent {
		t.Fatal("expected completion intent true")
	}
	if !report.RequiresVerification {
		t.Fatal("expected requiresVerification true")
	}
	if report.VerificationStatus != verificationStatusPassed {
		t.Fatalf("expected verificationStatus passed, got %q", report.VerificationStatus)
	}
	if len(report.CheckResults) != 2 {
		t.Fatalf("expected two check results, got %#v", report.CheckResults)
	}
	if report.CheckResults[0].CheckName != "unit tests" {
		t.Fatalf("expected trimmed checkName, got %#v", report.CheckResults[0].CheckName)
	}
	if report.CheckResults[0].Details != nil {
		t.Fatalf("expected blank details to normalize to nil, got %#v", report.CheckResults[0].Details)
	}
	if report.CheckResults[0].Source == nil || *report.CheckResults[0].Source != "go test" {
		t.Fatalf("expected trimmed source, got %#v", report.CheckResults[0].Source)
	}
}

func TestBuildCompletionStatusReportVerificationStatusVariants(t *testing.T) {
	t.Parallel()

	missingReport, err := buildCompletionStatusReport(map[string]any{
		"completionIntent":     false,
		"requiresVerification": true,
		"checkResults": []any{
			map[string]any{
				"checkName": "integration",
				"status":    "not_run",
			},
		},
	})
	if err != nil {
		t.Fatalf("build missing completion report: %v", err)
	}
	if missingReport.VerificationStatus != verificationStatusMissing {
		t.Fatalf("expected missing verificationStatus, got %q", missingReport.VerificationStatus)
	}

	failedReport, err := buildCompletionStatusReport(map[string]any{
		"completionIntent":     false,
		"requiresVerification": true,
		"checkResults": []any{
			map[string]any{
				"checkName": "integration",
				"status":    "failed",
			},
		},
	})
	if err != nil {
		t.Fatalf("build failed completion report: %v", err)
	}
	if failedReport.VerificationStatus != verificationStatusFailed {
		t.Fatalf("expected failed verificationStatus, got %q", failedReport.VerificationStatus)
	}

	noVerificationReport, err := buildCompletionStatusReport(map[string]any{
		"completionIntent":     true,
		"requiresVerification": false,
	})
	if err != nil {
		t.Fatalf("build no-verification report: %v", err)
	}
	if noVerificationReport.VerificationStatus != verificationStatusPassed {
		t.Fatalf("expected passed verificationStatus without verification requirement, got %q", noVerificationReport.VerificationStatus)
	}
}

func TestBuildCompletionStatusReportRejectsInvalidCheckResult(t *testing.T) {
	t.Parallel()

	_, err := buildCompletionStatusReport(map[string]any{
		"completionIntent":     true,
		"requiresVerification": true,
		"checkResults": []any{
			map[string]any{
				"checkName": "   ",
				"status":    "passed",
			},
		},
	})
	if err == nil {
		t.Fatal("expected invalid check result to fail")
	}

	var typed *toolError
	if !asToolError(err, &typed) {
		t.Fatalf("expected toolError, got %T", err)
	}
	if typed.code != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %q", typed.code)
	}
	if typed.message != "checkResults[0].checkName must be non-empty" {
		t.Fatalf("unexpected invalid check message %q", typed.message)
	}
}
