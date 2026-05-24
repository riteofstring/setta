# GPU Flow Retained Settings Finish-Line Report

- Generated: 2026-05-19T15:40:40.108291+00:00
- Source: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260519-052037`
- Source kind: `chrome-repro`
- Analysis start timestamp: `None`
- Status: FAIL

## Summary

- frameCount: `1275`
- frameModes: `{'content': 242, 'projection': 1033}`
- interactionActiveFrameCount: `1092`
- longtaskCount: `7`
- projectionFrameCount: `1033`
- retainedUploadCount: `143`
- retainedUploadedBytes: `198456352`
- transactionOutcomes: `{'publish-cold-placeholder': 1, 'none': 1033, 'publish-exact': 19, 'publish-compatible': 202, 'hold-previous': 20}`

## Budgets

- maxHeldPreviousMs: `120.0`
- maxLongTaskMs: `50.0`
- settleUploadBudgetBytes: `8388608`
- settleWindowMs: `1000.0`

## Failures

- coldPlaceholderPublicationCount: `1`
- heldPreviousOverBudgetCount: `301`
- interactionNonRepairUploadCount: `4`
- longTaskCount: `2`
- missingPhaseProjectionFieldCount: `0`
- missingRetainedDiagnosticDetailCount: `129`
- postSettleUploadSpikeCount: `19`
- projectionContentWorkFrameCount: `0`
- retainedBudgetExhaustedFrameCount: `128`
- retainedBudgetMissCount: `0`
- trueHolePublicationCount: `0`

## Long Tasks

- 81.0 ms near `retainedPageMaintenanceMs` frame `1`
- 167.0 ms near `retainedPageMaintenanceMs` frame `1`

## Outside-GPU Long Tasks

- 51.0 ms near frame `3` with GPU phases `{'committedContentPublishMs': 0, 'diagnosticsMs': 0, 'domTextActorProjectionMs': 0, 'frameMode': 'projection', 'htmlSurfaceFrameMs': 1.0999999940395355, 'projectionSurfaceResolveMs': 0.19999998807907104, 'retainedDisplayTransactionMs': 0, 'retainedPageFrameMs': 0, 'retainedPageMaintenanceMs': 0, 'retainedRuntimeFrameMs': 0, 'schedulingMs': 0}`
- 62.0 ms near frame `525` with GPU phases `{'committedContentPublishMs': 0, 'diagnosticsMs': 0, 'domTextActorProjectionMs': 0, 'frameMode': 'projection', 'htmlSurfaceFrameMs': 0.30000001192092896, 'projectionSurfaceResolveMs': 1.7999999821186066, 'retainedDisplayTransactionMs': 0, 'retainedPageFrameMs': 0, 'retainedPageMaintenanceMs': 0, 'retainedRuntimeFrameMs': 0, 'schedulingMs': 0}`
- 151.0 ms near frame `525` with GPU phases `{'committedContentPublishMs': 0, 'diagnosticsMs': 0, 'domTextActorProjectionMs': 0, 'frameMode': 'projection', 'htmlSurfaceFrameMs': 0.30000001192092896, 'projectionSurfaceResolveMs': 1.7999999821186066, 'retainedDisplayTransactionMs': 0, 'retainedPageFrameMs': 0, 'retainedPageMaintenanceMs': 0, 'retainedRuntimeFrameMs': 0, 'schedulingMs': 0}`
- 73.0 ms near frame `1511` with GPU phases `{'committedContentPublishMs': 0, 'diagnosticsMs': 0, 'domTextActorProjectionMs': 0, 'frameMode': 'projection', 'htmlSurfaceFrameMs': 0.29999998211860657, 'projectionSurfaceResolveMs': 0, 'retainedDisplayTransactionMs': 0, 'retainedPageFrameMs': 0, 'retainedPageMaintenanceMs': 0, 'retainedRuntimeFrameMs': 0, 'schedulingMs': 0}`

## Retained Budget Misses

- none

## Post-Settle Retained Uploads

- start `1779193290205.0`: 9710784 bytes (9.261 MiB), 4 uploads
- start `1779193290256.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193291944.0`: 31673760 bytes (30.206 MiB), 14 uploads
- start `1779193292413.0`: 11522832 bytes (10.989 MiB), 5 uploads
- start `1779193293117.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193294688.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193295403.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193296333.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193296693.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193296713.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193296735.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193296751.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193296766.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193297739.0`: 17809728 bytes (16.985 MiB), 25 uploads
- start `1779193298139.0`: 5398560 bytes (5.148 MiB), 4 uploads
- start `1779193298177.0`: 4656672 bytes (4.441 MiB), 3 uploads
- start `1779193298211.0`: 4521984 bytes (4.312 MiB), 2 uploads
- start `1779193298246.0`: 2260992 bytes (2.156 MiB), 1 uploads
- start `1779193298307.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193299495.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193299549.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193299605.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193299642.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193299763.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193299802.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193300321.0`: 0 bytes (0.0 MiB), 0 uploads
- start `1779193301737.0`: 11595392 bytes (11.058 MiB), 7 uploads
- start `1779193301985.0`: 8842880 bytes (8.433 MiB), 6 uploads
- start `1779193303302.0`: 9380608 bytes (8.946 MiB), 7 uploads
- start `1779193304763.0`: 17558016 bytes (16.745 MiB), 14 uploads
- start `1779193304921.0`: 26812032 bytes (25.57 MiB), 20 uploads
- start `1779193305583.0`: 35821312 bytes (34.162 MiB), 27 uploads
- start `1779193306068.0`: 24101760 bytes (22.985 MiB), 20 uploads
- start `1779193306106.0`: 23774080 bytes (22.673 MiB), 19 uploads
- start `1779193306625.0`: 28143360 bytes (26.84 MiB), 20 uploads
- start `1779193306770.0`: 34372480 bytes (32.78 MiB), 26 uploads
- start `1779193306816.0`: 31352832 bytes (29.9 MiB), 27 uploads
- start `1779193306857.0`: 33417216 bytes (31.869 MiB), 27 uploads
- start `1779193307354.0`: 24297088 bytes (23.172 MiB), 20 uploads
- start `1779193308205.0`: 14388736 bytes (13.722 MiB), 13 uploads
- start `1779193308436.0`: 14201856 bytes (13.544 MiB), 12 uploads
