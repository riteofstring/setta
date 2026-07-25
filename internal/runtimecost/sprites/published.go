// Package spritescost owns the Sprites-specific public rate card used by
// Setta's provider-neutral cost estimator.
package spritescost

import (
	"time"

	"setta/internal/runtimecost"
)

// Provider is the stable accounting key for Fly Sprites observations.
const Provider = "sprites"

// PublishedRates20260714 returns the public rates observed on 2026-07-14.
// Checkpoint and network-egress prices remain explicitly unavailable because
// the public card does not state separate rates for those dimensions.
func PublishedRates20260714() runtimecost.PriceSchedule {
	return runtimecost.PriceSchedule{
		Provider:   Provider,
		Version:    "public-rate-card-2026-07-14",
		ObservedAt: time.Date(2026, time.July, 14, 0, 0, 0, 0, time.UTC),
		CPUCoreHour: runtimecost.Rate{
			Available: true,
			USDMicros: 70_000,
		},
		MemoryGBHour: runtimecost.Rate{
			Available: true,
			USDMicros: 43_750,
		},
		HotStorageGBHour: runtimecost.Rate{
			Available: true,
			USDMicros: 683,
		},
		ColdStorageGBHour: runtimecost.Rate{
			Available: true,
			USDMicros: 27,
		},
		BillingMinimums: runtimecost.BillingMinimums{
			CPUCoreMillionths: 62_500,
			MemoryBytes:       250_000_000,
		},
	}
}
