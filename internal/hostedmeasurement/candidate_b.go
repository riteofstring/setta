package hostedmeasurement

import "context"

type CandidateBHostedSuite struct {
	Access    CandidateBWorkload
	Lifecycle CandidateBLifecycleWorkload
}

func (suite CandidateBHostedSuite) Execute(
	ctx context.Context,
	authorization Authorization,
	runtime HostedRuntime,
	bootstrap ControlPlaneBootstrapResult,
) error {
	if err := suite.Access.Execute(ctx, authorization, runtime, bootstrap); err != nil {
		return err
	}
	return suite.Lifecycle.Execute(ctx, authorization, runtime, bootstrap)
}
