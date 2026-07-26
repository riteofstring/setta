// Package spritescost owns the Sprites-specific public rate card used by
// Setta's provider-neutral cost estimator.
package spritescost

import (
	"time"

	"setta/internal/runtimecost"
)

// Provider is the stable accounting key for Fly Sprites observations.
const Provider = "sprites"

// PublishedRates20260727 returns the public rates observed on 2026-07-27 at
// https://fly.io/sprites/yolo-mode/#billing.
//
// The card publishes one storage rate, "$0.50 /GB/month", with no hot and cold
// distinction, so both storage dimensions price identically. An earlier reading
// of this card split them and priced cold storage about twenty-five times too
// low; recorded usage in the cold dimension would have under-recovered its real
// cost. Checkpoint and network-egress prices remain explicitly unavailable
// because the card states no separate rate for either.
func PublishedRates20260727() runtimecost.PriceSchedule {
	// $0.50 per GB-month over the 732-hour month the card's rates divide into.
	const storageGBHourUSDMicros = 683

	return runtimecost.PriceSchedule{
		Provider:   Provider,
		Version:    "public-rate-card-2026-07-27",
		ObservedAt: time.Date(2026, time.July, 27, 0, 0, 0, 0, time.UTC),
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
			USDMicros: storageGBHourUSDMicros,
		},
		ColdStorageGBHour: runtimecost.Rate{
			Available: true,
			USDMicros: storageGBHourUSDMicros,
		},
		BillingMinimums: runtimecost.BillingMinimums{
			CPUCoreMillionths: 62_500,
			MemoryBytes:       250_000_000,
		},
	}
}
