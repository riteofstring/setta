package checkout

import (
	"context"
	"time"
)

type RetryRequest struct {
	OrderID string
	Attempt int
}

func RetryPayment(ctx context.Context, request RetryRequest) error {
	if request.Attempt > 3 {
		return ErrRetryBudget
	}
	time.Sleep(time.Duration(request.Attempt) * 50 * time.Millisecond)
	return charge(ctx, request.OrderID, "")
}
