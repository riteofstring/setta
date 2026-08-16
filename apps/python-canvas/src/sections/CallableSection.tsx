import {
  PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
  PROVIDER_BASEDPYRIGHT_V1,
  PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1,
  type ProviderAvailabilityV1,
  type ProviderLifecycleStateV1,
  type ProviderV1,
} from "../backend/generatedContract";

export type CallableSectionData = {
  callable: {
    id: string;
    name: string;
    authoredExpression: string;
  };
  providerStatus: {
    provider: ProviderV1;
    status: ProviderAvailabilityV1;
    state: ProviderLifecycleStateV1;
  };
};

export function readCallableSectionData(value: unknown): CallableSectionData {
  if (!isRecord(value) || !isRecord(value.callable)) {
    throw new Error("Callable section data must match the Phase B projection.");
  }

  const { authoredExpression, id, name } = value.callable;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof authoredExpression !== "string"
  ) {
    throw new Error("Callable section data callable is invalid.");
  }

  if (!isRecord(value.providerStatus)) {
    throw new Error("Callable section data providerStatus must be an object.");
  }
  const { provider, state, status } = value.providerStatus;
  if (
    provider !== PROVIDER_BASEDPYRIGHT_V1 ||
    status !== PROVIDER_AVAILABILITY_UNAVAILABLE_V1 ||
    state !== PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1
  ) {
    throw new Error("Callable section data providerStatus is invalid.");
  }

  return {
    callable: { id, name, authoredExpression },
    providerStatus: {
      provider: PROVIDER_BASEDPYRIGHT_V1,
      status: PROVIDER_AVAILABILITY_UNAVAILABLE_V1,
      state: PROVIDER_LIFECYCLE_STATE_NOT_STARTED_V1,
    },
  };
}

export function CallableSection({
  data,
}: {
  data: CallableSectionData;
}) {
  return (
    <div className="python-canvas-callable-section">
      <div className="python-canvas-callable">
        <p className="python-canvas-callable-name">{data.callable.name}</p>
        {data.callable.authoredExpression === "" ? (
          <p>
            <span className="python-canvas-field-label">
              Authored expression:
            </span>{" "}
            <span>No authored expression.</span>
          </p>
        ) : (
          <p>
            <span className="python-canvas-field-label">
              Authored expression:
            </span>{" "}
            <code>{data.callable.authoredExpression}</code>
          </p>
        )}
      </div>
      <p className="python-canvas-provider-status">
        <span className="python-canvas-field-label">Basedpyright status:</span>{" "}
        {data.providerStatus.status} — {data.providerStatus.state.replaceAll("_", " ")}.
      </p>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
