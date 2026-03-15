from enum import Enum

from pydantic import BaseModel, Field
from setta.types.id import ID, create_new_id

STATE_MACHINE_EDGE_SOURCE_PORT_ID = "workflow-source"
STATE_MACHINE_EDGE_TARGET_PORT_ID = "workflow-target"


class StateMachineTargetActionType(str, Enum):
    send_prompt = "send_prompt"
    reset_thread = "reset_thread"


class StateMachineThreadStrategy(str, Enum):
    continue_current_thread = "continue_current_thread"
    new_thread_before_send = "new_thread_before_send"


class StateMachineSourceFilterType(str, Enum):
    run_completed = "run_completed"
    run_failed = "run_failed"
    signal = "signal"


class StateMachineCountOperator(str, Enum):
    lt = "lt"
    lte = "lte"
    eq = "eq"
    gte = "gte"
    gt = "gt"


class StateMachineSourceFilter(BaseModel, extra="forbid"):
    type: StateMachineSourceFilterType = StateMachineSourceFilterType.run_completed
    signalName: str | None = None
    payloadField: str | None = None
    equals: str | None = None


class StateMachineSourceActivationCountCondition(BaseModel, extra="forbid"):
    operator: StateMachineCountOperator = StateMachineCountOperator.eq
    value: int


class StateMachineTargetAction(BaseModel, extra="forbid"):
    type: StateMachineTargetActionType = StateMachineTargetActionType.send_prompt
    promptTemplateId: ID | None = None
    promptSectionId: ID | None = None
    inlinePrompt: str | None = None
    promptInputs: dict[str, str] = Field(default_factory=dict)
    threadStrategy: StateMachineThreadStrategy = (
        StateMachineThreadStrategy.continue_current_thread
    )
    stopIfRunning: bool = False
    engineConfigId: ID | None = None
    agentProfileId: ID | None = None
    permissionMode: str | None = None
    searchEnabled: bool | None = None


class StateMachineEdge(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    machineGroupId: str
    sourceSectionId: ID
    sourcePortId: str
    targetSectionId: ID
    targetPortId: str
    sourceFilter: StateMachineSourceFilter | None = None
    sourceActivationCountCondition: (
        StateMachineSourceActivationCountCondition | None
    ) = None
    targetAction: StateMachineTargetAction | None = None
    style: dict[str, str | int | float] | None = None
    hidden: bool = False
    zIndex: int = 0
    selected: bool = False
