import type {
  ProviderAvailabilityV1,
  ProviderLifecycleStateV1,
  ProviderV1,
} from "../backend/generatedContract";

export type CallableSectionData = {
  callables: Array<{
    id: string;
    name: string;
    authoredExpression: string;
  }>;
  providerStatus: {
    provider: ProviderV1;
    status: ProviderAvailabilityV1;
    state: ProviderLifecycleStateV1;
  };
};

export function readCallableSectionData(value: unknown): CallableSectionData {
  if (!isRecord(value) || !Array.isArray(value.callables)) {
    throw new Error("Callable section data must match the Phase B projection.");
  }

  const callables = value.callables.map((callable, index) => {
    if (!isRecord(callable)) {
      throw new Error(`Callable section data callables[${index}] must be an object.`);
    }
    const { authoredExpression, id, name } = callable;
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      typeof authoredExpression !== "string"
    ) {
      throw new Error(`Callable section data callables[${index}] is invalid.`);
    }
    return { id, name, authoredExpression };
  });

  if (!isRecord(value.providerStatus)) {
    throw new Error("Callable section data providerStatus must be an object.");
  }
  const { provider, state, status } = value.providerStatus;
  if (
    provider !== "basedpyright" ||
    status !== "unavailable" ||
    state !== "not_started"
  ) {
    throw new Error("Callable section data providerStatus is invalid.");
  }

  return {
    callables,
    providerStatus: { provider, status, state },
  };
}

export function CallableSection({
  data,
}: {
  data: CallableSectionData;
}) {
  return (
    <div className="python-canvas-callable-section">
      {data.callables.length === 0 ? (
        <p className="python-canvas-empty-state">No callables are available.</p>
      ) : (
        <ul className="python-canvas-callable-list">
          {data.callables.map((callable) => (
            <li key={callable.id} className="python-canvas-callable">
              <p className="python-canvas-callable-name">{callable.name}</p>
              {callable.authoredExpression === "" ? (
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
                  <code>{callable.authoredExpression}</code>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="python-canvas-provider-status">
        <span className="python-canvas-field-label">Basedpyright status:</span>{" "}
        unavailable — not started.
      </p>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
