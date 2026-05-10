# GPU Flow Retained Texture Recording Summary

- Recording: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260510-153545`
- Created: `2026-05-10T22:35:46.005075+00:00`
- Generated: `2026-05-10T22:50:12.185929+00:00`

## Frame Summary

- GPU-flow frames: 1008
- Viewport frames: 634
- Interaction-active frames: 613
- Upload frames: 270
- Budget-exhausted frames: 176
- Recorded GPU-frame duration: 25598.0 ms
- Zoom range: 0.1 to 3.4

## Frame Duration

- Average: 0.828
- p50: 0.4
- p90: 1.1
- p95: 2.265
- p99: 5.493
- Max: 144.5

## Upload Summary

- Uploaded bytes: 1270963168 (1212.085 MiB)
- Upload diagnostics: 416
- Upload reasons: `{"animation": 15, "content": 310, "first-visible": 91, "resolution": 100}`

### Upload Diagnostic Groups

| Group | Count | Uploaded MiB | Max Duration Ms |
| --- | ---: | ---: | ---: |
| `withDirtySourceRect` | 71 | 131.137 | 1.7 |
| `withoutDirtySourceRect` | 345 | 1080.947 | 144.1 |
| `tiledWithoutDirtySourceRect` | 49 | 535.313 | 144.1 |

## Dirty Work

- Initial dirty work totals: `{"animation": 15, "content": 9575, "geometry": 0, "hover": 0, "resolution": 3350, "source-window": 0}`
- Remaining dirty work totals: `{"animation": 0, "content": 9193, "geometry": 0, "hover": 0, "resolution": 3189, "source-window": 0}`

## Texture Memory

- Max allocated: 388563840 (370.563 MiB)
- Max visible: 371818368 (354.594 MiB)
- Max texture count: 89
- Max requested/resolution scale: 8.0

## Long Tasks

- Long task count: 26
- Average: 108.885
- p50: 76.0
- p90: 175.5
- p95: 252.5
- p99: 349.0
- Max: 374.0

## Viewport Interaction Spans

| Span | Duration Ms | Frame Count |
| ---: | ---: | ---: |
| 1 | 192.0 | 20 |
| 2 | 811.0 | 83 |
| 3 | 1213.0 | 107 |
| 4 | 622.0 | 65 |
| 5 | 312.0 | 28 |
| 6 | 1156.0 | 74 |
| 7 | 253.0 | 30 |
| 8 | 232.0 | 11 |
| 9 | 255.0 | 32 |
| 10 | 191.0 | 22 |
| 11 | 326.0 | 31 |
| 12 | 159.0 | 15 |
| 13 | 354.0 | 29 |
| 14 | 936.0 | 18 |
| 15 | 7.0 | 2 |
| 16 | 1068.0 | 46 |

## Uploads After Settle Windows

| Window | Frames | Upload Frames | Uploaded MiB |
| ---: | ---: | ---: | ---: |
| 1 | 25 | 22 | 152.081 |
| 2 | 47 | 6 | 12.144 |
| 3 | 8 | 7 | 74.874 |
| 4 | 61 | 15 | 172.913 |
| 5 | 81 | 11 | 132.646 |
| 6 | 62 | 21 | 290.459 |
| 7 | 27 | 15 | 237.044 |
| 8 | 4 | 3 | 40.219 |
| 9 | 36 | 3 | 7.176 |
| 10 | 38 | 6 | 12.681 |
| 11 | 53 | 29 | 58.67 |
| 12 | 57 | 27 | 69.443 |
| 13 | 32 | 24 | 62.718 |
| 14 | 32 | 28 | 90.163 |
| 15 | 34 | 2 | 1.579 |
| 16 | 0 | 0 | 0.0 |

## Top Uploaded Surfaces

| Surface | Uploads | Uploaded MiB | No Rect | Dirty Rect | Max Upload MiB | Max Upload Ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `settings-section__gui:param-content:unpinned` | 100 | 390.273 | 37 | 63 | 18.5 | 5.0 |
| `settings-section__shortcuts:param-content:unpinned` | 30 | 341.114 | 25 | 5 | 25.875 | 9.5 |
| `settings-section__sectionSizingPolicy:param-content:unpinned` | 19 | 180.152 | 19 | 0 | 17.25 | 144.1 |
| `settings-section__backend:param-content:unpinned` | 12 | 39.444 | 12 | 0 | 6.368 | 29.2 |
| `settings-section__shortcuts` | 11 | 39.284 | 11 | 0 | 11.0 | 3.7 |
| `settings-section__gui` | 11 | 39.284 | 11 | 0 | 11.0 | 0.5 |
| `settings-section__backend` | 8 | 22.792 | 8 | 0 | 6.671 | 0.5 |
| `settings-section__sectionSizingPolicy` | 7 | 22.607 | 7 | 0 | 11.0 | 0.5 |
| `settings-section__languageServer` | 7 | 7.835 | 7 | 0 | 3.812 | 0.4 |
| `settings-section__languageServer:param-content:unpinned` | 12 | 6.301 | 12 | 0 | 1.906 | 4.9 |
| `settings-section__chatSectionDefault:param-content:unpinned` | 4 | 4.953 | 4 | 0 | 1.238 | 5.0 |
| `settings-section__chatWindowing` | 3 | 4.855 | 3 | 0 | 2.678 | 0.3 |

## Top Upload Frames

| Frame | Duration Ms | Upload Ms | Uploaded MiB | Zoom | Budget Exhausted | Work |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
| 122 | 2.2 | 1.9 | 25.875 | 1.3 | True | `{"animation": 0, "content": 2, "geometry": 0, "hover": 0, "resolution": 4, "source-window": 0}` |
| 486 | 5.2 | 4.2 | 20.422 | 1.9 | True | `{"animation": 0, "content": 5, "geometry": 0, "hover": 0, "resolution": 8, "source-window": 0}` |
| 403 | 1.6 | 1.3 | 19.583 | 1.2 | True | `{"animation": 0, "content": 1, "geometry": 0, "hover": 0, "resolution": 6, "source-window": 0}` |
| 713 | 2.7 | 2.0 | 19.583 | 1 | True | `{"animation": 0, "content": 3, "geometry": 0, "hover": 0, "resolution": 4, "source-window": 0}` |
| 1123 | 1.4 | 0.9 | 19.583 | 1.1 | True | `{"animation": 0, "content": 14, "geometry": 0, "hover": 0, "resolution": 4, "source-window": 0}` |
| 632 | 0.4 | 0.2 | 18.5 | 3.4 | True | `{"animation": 0, "content": 4, "geometry": 0, "hover": 0, "resolution": 2, "source-window": 0}` |
| 685 | 0.4 | 0.1 | 18.5 | 3.4 | True | `{"animation": 0, "content": 1, "geometry": 0, "hover": 0, "resolution": 3, "source-window": 0}` |
| 689 | 0.5 | 0.2 | 18.5 | 3.4 | True | `{"animation": 0, "content": 1, "geometry": 0, "hover": 0, "resolution": 3, "source-window": 0}` |
| 693 | 0.5 | 0.2 | 18.5 | 3.4 | True | `{"animation": 0, "content": 1, "geometry": 0, "hover": 0, "resolution": 3, "source-window": 0}` |
| 697 | 0.4 | 0.2 | 18.5 | 3.4 | True | `{"animation": 0, "content": 1, "geometry": 0, "hover": 0, "resolution": 3, "source-window": 0}` |

## Top Duration Frames

| Frame | Duration Ms | Upload Ms | Uploaded MiB | Zoom | Budget Exhausted | Work |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
| 642 | 144.5 | 144.2 | 16.149 | 3.4 | True | `{"animation": 0, "content": 3, "geometry": 0, "hover": 0, "resolution": 1, "source-window": 0}` |
| 626 | 29.6 | 29.2 | 4.422 | 3.4 | True | `{"animation": 0, "content": 5, "geometry": 0, "hover": 0, "resolution": 2, "source-window": 0}` |
| 120 | 17.5 | 17.1 | 3.805 | 1.3 | True | `{"animation": 0, "content": 3, "geometry": 0, "hover": 0, "resolution": 4, "source-window": 0}` |
| 681 | 10.0 | 9.6 | 16.513 | 3.4 | True | `{"animation": 0, "content": 2, "geometry": 0, "hover": 0, "resolution": 3, "source-window": 0}` |
| 1 | 8.3 | 3.7 | 0.741 | 0.4 | True | `{"animation": 0, "content": 10, "geometry": 0, "hover": 0, "resolution": 10, "source-window": 0}` |
| 399 | 7.6 | 7.2 | 11.587 | 1.2 | True | `{"animation": 0, "content": 3, "geometry": 0, "hover": 0, "resolution": 8, "source-window": 0}` |
| 1095 | 7.3 | 7.0 | 1.779 | 1.1 | True | `{"animation": 0, "content": 40, "geometry": 0, "hover": 0, "resolution": 5, "source-window": 0}` |
| 1093 | 6.0 | 5.5 | 1.35 | 1.1 | True | `{"animation": 0, "content": 42, "geometry": 0, "hover": 0, "resolution": 5, "source-window": 0}` |
| 1129 | 5.7 | 5.3 | 1.339 | 1.1 | True | `{"animation": 0, "content": 9, "geometry": 0, "hover": 0, "resolution": 3, "source-window": 0}` |
| 1107 | 5.5 | 5.0 | 1.482 | 1.1 | True | `{"animation": 0, "content": 28, "geometry": 0, "hover": 0, "resolution": 5, "source-window": 0}` |
