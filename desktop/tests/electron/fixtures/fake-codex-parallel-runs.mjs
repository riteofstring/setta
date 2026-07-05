import { Buffer } from "node:buffer";
import { setTimeout } from "node:timers";

export function createParallelRunHandlers({ fakeTurnWithID, notify, respond, turnInputText }) {
  let nextParallelThread = 0;
  const activeParallelTurns = new Map();

  return {
    activeTurnForThreadRead(requestedThreadId) {
      if (typeof requestedThreadId !== "string") {
        return null;
      }
      return activeParallelTurns.get(requestedThreadId) ?? null;
    },
    handleTurnInterrupt(message) {
      const threadID = message.params?.threadId;
      const activeTurnId = message.params?.turnId;
      if (
        typeof threadID !== "string" ||
        !threadID.startsWith("thread_parallel_") ||
        typeof activeTurnId !== "string" ||
        activeTurnId === ""
      ) {
        return false;
      }
      respond(message.id, {});
      notifyParallelCompleted(
        activeParallelTurns,
        notify,
        fakeTurnWithID,
        threadID,
        activeTurnId,
        "interrupted",
      );
      return true;
    },
    handleTurnStart(message) {
      const text = turnInputText(message);
      if (!text.includes("parallel-runs:")) {
        return false;
      }
      const threadID = message.params?.threadId;
      if (typeof threadID !== "string" || threadID === "") {
        throw new Error("parallel turn/start missing threadId");
      }
      const activeTurnId = parallelTurnId(threadID);
      activeParallelTurns.set(threadID, fakeTurnWithID(activeTurnId, "inProgress"));
      respond(message.id, { turn: fakeTurnWithID(activeTurnId, "inProgress") });
      setTimeout(
        () =>
          emitParallelTurnStart(
            activeParallelTurns,
            notify,
            fakeTurnWithID,
            text,
            threadID,
            activeTurnId,
          ),
        5,
      );
      return true;
    },
    handleTurnSteer(message) {
      const text = turnInputText(message);
      if (!text.includes("parallel-runs: steer b")) {
        return false;
      }
      const threadID = message.params?.threadId;
      const activeTurnId = message.params?.expectedTurnId;
      if (typeof threadID !== "string" || threadID === "") {
        throw new Error("parallel turn/steer missing threadId");
      }
      if (typeof activeTurnId !== "string" || activeTurnId === "") {
        throw new Error("parallel turn/steer missing expectedTurnId");
      }
      respond(message.id, {});
      notifyParallelUserMessage(notify, threadID, activeTurnId, "parallel_b_steering", text);
      notifyParallelAssistant(
        notify,
        threadID,
        activeTurnId,
        "parallel_b_steered",
        "Parallel B steered. ",
      );
      notifyParallelCompleted(
        activeParallelTurns,
        notify,
        fakeTurnWithID,
        threadID,
        activeTurnId,
        "completed",
      );
      return true;
    },
    nextThreadId() {
      nextParallelThread += 1;
      return `thread_parallel_${nextParallelThread}`;
    },
  };
}

function parallelTurnId(threadID) {
  return `turn_${threadID.replace(/^thread_/, "")}`;
}

function emitParallelTurnStart(
  activeParallelTurns,
  notify,
  fakeTurnWithID,
  text,
  threadID,
  activeTurnId,
) {
  notify("turn/started", { threadId: threadID, turnId: activeTurnId });
  if (text.includes("stall a")) {
    notifyParallelAssistant(
      notify,
      threadID,
      activeTurnId,
      "parallel_a_waiting",
      "Parallel A waiting. ",
    );
    return;
  }
  if (text.includes("wait steer b")) {
    notifyParallelAssistant(
      notify,
      threadID,
      activeTurnId,
      "parallel_b_waiting",
      "Parallel B waiting. ",
    );
    return;
  }
  if (text.includes("finish c")) {
    notifyStandaloneProcessNoise(notify, threadID);
    notifyParallelCommandLifecycle(notify, threadID, activeTurnId);
    notifyParallelAssistant(
      notify,
      threadID,
      activeTurnId,
      "parallel_c_message",
      "Parallel C complete. ",
    );
    notifyParallelCompleted(
      activeParallelTurns,
      notify,
      fakeTurnWithID,
      threadID,
      activeTurnId,
      "completed",
    );
    return;
  }
  throw new Error(`unsupported parallel turn prompt: ${text}`);
}

function notifyParallelAssistant(notify, threadID, activeTurnId, itemId, delta) {
  notify("item/agentMessage/delta", {
    delta,
    itemId,
    threadId: threadID,
    turnId: activeTurnId,
  });
}

function notifyParallelUserMessage(notify, threadID, activeTurnId, itemId, text) {
  notify("item/started", {
    item: {
      content: [{ text, type: "text" }],
      id: itemId,
      type: "userMessage",
    },
    startedAtMs: 1,
    threadId: threadID,
    turnId: activeTurnId,
  });
}

function notifyParallelCommandLifecycle(notify, threadID, activeTurnId) {
  const itemId = `parallel_command_${activeTurnId}`;
  notify("item/started", {
    item: {
      command: `echo ${threadID}`,
      commandActions: [],
      cwd: "/tmp/workspace",
      id: itemId,
      status: "inProgress",
      type: "commandExecution",
    },
    startedAtMs: 1,
    threadId: threadID,
    turnId: activeTurnId,
  });
  notify("item/commandExecution/outputDelta", {
    delta: `parallel output ${threadID}\n`,
    itemId,
    threadId: threadID,
    turnId: activeTurnId,
  });
  notify("item/completed", {
    completedAtMs: 2,
    item: {
      command: `echo ${threadID}`,
      commandActions: [],
      cwd: "/tmp/workspace",
      durationMs: 1,
      exitCode: 0,
      id: itemId,
      status: "completed",
      type: "commandExecution",
    },
    threadId: threadID,
    turnId: activeTurnId,
  });
}

function notifyStandaloneProcessNoise(notify, threadID) {
  const processPrefix = `standalone_${threadID}`;
  notify("command/exec/outputDelta", {
    capReached: false,
    deltaBase64: Buffer.from("standalone command\n").toString("base64"),
    processId: `${processPrefix}_command`,
    stream: "stdout",
  });
  notify("process/outputDelta", {
    capReached: false,
    deltaBase64: Buffer.from("standalone process\n").toString("base64"),
    processHandle: `${processPrefix}_process`,
    stream: "stderr",
  });
}

function notifyParallelCompleted(
  activeParallelTurns,
  notify,
  fakeTurnWithID,
  threadID,
  activeTurnId,
  status,
) {
  activeParallelTurns.delete(threadID);
  notify("turn/completed", {
    threadId: threadID,
    turn: fakeTurnWithID(activeTurnId, status),
  });
}
