import type {
  Binding,
  Project,
  RuntimeEvent,
} from "../backend/generatedContract";
import { runtimeCanInvoke, type RuntimeViewState } from "./runtimeState";

type RuntimeInitializationOptions = {
  getProject: () => Project | null;
  getRuntime: () => RuntimeViewState;
  send: (event: RuntimeEvent) => boolean;
};

type RuntimeInitializationContext = {
  project: Project;
  sessionId: string;
};

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    );
  }
  return value;
}

function supportsStartup(binding: Binding): boolean {
  return (
    binding.materialization !== undefined &&
    binding.materialization.startup !== "manual"
  );
}

function matchesSource(
  binding: Binding,
  sectionId: string,
  event: RuntimeEvent["event"],
): boolean {
  return (
    supportsStartup(binding) &&
    binding.trigger.kind === "event" &&
    binding.trigger.sectionId === sectionId &&
    binding.trigger.event === event
  );
}

function initializationKey(sessionId: string, binding: Binding): string {
  return JSON.stringify([sessionId, canonicalValue(binding)]);
}

function initializationKeys(
  project: Project,
  sessionId: string,
  sectionId: string,
  event: RuntimeEvent["event"],
): string[] {
  return project.bindings
    .filter((binding) => matchesSource(binding, sectionId, event))
    .map((binding) => initializationKey(sessionId, binding));
}

class RuntimeInitializationClaims {
  private sessionId: string | null = null;
  private readonly claimed = new Set<string>();

  public claim(
    project: Project,
    sessionId: string,
    sectionId: string,
    event: RuntimeEvent["event"],
  ): string[] {
    if (this.sessionId !== sessionId) {
      this.sessionId = sessionId;
      this.claimed.clear();
    }
    const available = initializationKeys(
      project,
      sessionId,
      sectionId,
      event,
    ).filter((key) => !this.claimed.has(key));
    for (const key of available) {
      this.claimed.add(key);
    }
    return available;
  }

  public current(
    project: Project,
    sessionId: string,
    sectionId: string,
    event: RuntimeEvent["event"],
    keys: string[],
  ): string[] {
    const current = new Set(
      initializationKeys(project, sessionId, sectionId, event),
    );
    return keys.filter((key) => current.has(key));
  }

  public release(keys: string[]): void {
    for (const key of keys) {
      this.claimed.delete(key);
    }
  }
}

export class RuntimeInitializationCoordinator {
  private readonly claims = new RuntimeInitializationClaims();

  public constructor(private readonly options: RuntimeInitializationOptions) {}

  public async initialize(
    sectionId: string,
    event: "change" | "snapshot",
    createPayload: () =>
      RuntimeEvent["payload"] | Promise<RuntimeEvent["payload"]>,
  ): Promise<boolean> {
    const context = this.context();
    if (context === null) {
      return false;
    }
    const claims = this.claims.claim(
      context.project,
      context.sessionId,
      sectionId,
      event,
    );
    return claims.length === 0
      ? false
      : this.deliver(
          context.sessionId,
          sectionId,
          event,
          claims,
          createPayload,
        );
  }

  private context(): RuntimeInitializationContext | null {
    const project = this.options.getProject();
    const runtime = this.options.getRuntime();
    return project !== null &&
      runtime.sessionId !== null &&
      runtimeCanInvoke(runtime)
      ? { project, sessionId: runtime.sessionId }
      : null;
  }

  private async deliver(
    sessionId: string,
    sectionId: string,
    event: "change" | "snapshot",
    claims: string[],
    createPayload: () =>
      RuntimeEvent["payload"] | Promise<RuntimeEvent["payload"]>,
  ): Promise<boolean> {
    try {
      const payload = await createPayload();
      return this.deliverPayload(sessionId, sectionId, event, claims, payload);
    } catch (caught) {
      this.claims.release(claims);
      throw caught;
    }
  }

  private deliverPayload(
    sessionId: string,
    sectionId: string,
    event: "change" | "snapshot",
    claims: string[],
    payload: RuntimeEvent["payload"],
  ): boolean {
    const context = this.context();
    if (context === null || context.sessionId !== sessionId) {
      this.claims.release(claims);
      return false;
    }
    const current = this.claims.current(
      context.project,
      sessionId,
      sectionId,
      event,
      claims,
    );
    const currentSet = new Set(current);
    this.claims.release(claims.filter((claim) => !currentSet.has(claim)));
    if (current.length === 0) {
      return false;
    }
    const sent = this.options.send({
      cause: "startup",
      event,
      payload,
      sectionId,
      sessionId,
      type: "event",
    });
    if (!sent) {
      this.claims.release(current);
    }
    return sent;
  }
}
