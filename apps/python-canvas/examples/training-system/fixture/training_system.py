from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Resources:
    devices: int
    workers: int
    memory_gb: int


@dataclass
class Cache:
    directory: Path
    size_gb: int


@dataclass
class Storage:
    root: Path
    keep_last: int


@dataclass
class Tracker:
    project: str
    group: str
    directory: Path


@dataclass
class Dataset:
    root: Path
    split: str
    classes: int
    samples: int


@dataclass
class Resize:
    size: int
    interpolation: str = "bilinear"


@dataclass
class RandomCrop:
    size: int
    padding: int = 4


@dataclass
class RandomFlip:
    probability: float = 0.5


@dataclass
class ColorJitter:
    brightness: float = 0.2
    contrast: float = 0.2


@dataclass
class Normalize:
    mean: tuple[float, float, float]
    std: tuple[float, float, float]


type Transform = Resize | RandomCrop | RandomFlip | ColorJitter | Normalize


@dataclass
class Pipeline:
    steps: Sequence[Transform]


@dataclass
class Loader:
    dataset: Dataset
    pipeline: Pipeline
    cache: Cache
    batch_size: int
    workers: int
    shuffle: bool


@dataclass
class Embedding:
    channels: int
    width: int
    patch_size: int


@dataclass
class Attention:
    width: int
    heads: int
    dropout: float


@dataclass
class FeedForward:
    width: int
    expansion: int
    activation: str


@dataclass
class Encoder:
    attention: Attention
    feed_forward: FeedForward
    depth: int


@dataclass
class Head:
    width: int
    classes: int
    dropout: float


@dataclass
class VisionModel:
    embedding: Embedding
    encoder: Encoder
    head: Head


@dataclass
class ParameterGroup:
    target: str
    lr_scale: float
    weight_decay: float


@dataclass
class AdamW:
    groups: Sequence[ParameterGroup]
    learning_rate: float
    betas: tuple[float, float] = (0.9, 0.999)


@dataclass
class SGD:
    groups: Sequence[ParameterGroup]
    learning_rate: float
    momentum: float = 0.9


@dataclass
class Warmup:
    steps: int
    start_factor: float


@dataclass
class Cosine:
    steps: int
    min_factor: float


@dataclass
class Schedule:
    stages: Sequence[Warmup | Cosine]


@dataclass
class Loss:
    name: str
    weight: float
    smoothing: float


@dataclass
class Precision:
    mode: str
    loss_scale: str


@dataclass
class Distributed:
    devices: int
    nodes: int
    backend: str


@dataclass
class GradientPolicy:
    accumulation: int
    clip_norm: float


@dataclass
class StepBudget:
    loader: Loader
    distributed: Distributed
    gradients: GradientPolicy
    epochs: int

    @property
    def effective_batch(self) -> int:
        return (
            self.loader.batch_size
            * self.distributed.devices
            * self.distributed.nodes
            * self.gradients.accumulation
        )

    @property
    def updates(self) -> int:
        return (
            math.ceil(self.loader.dataset.samples / self.effective_batch) * self.epochs
        )


@dataclass
class Loop:
    optimizer: AdamW | SGD
    schedule: Schedule
    losses: Sequence[Loss]
    budget: StepBudget
    precision: Precision


@dataclass
class Checkpoint:
    directory: Path
    every: int
    keep: int


@dataclass
class EarlyStopping:
    metric: str
    patience: int


@dataclass
class Logger:
    directory: Path
    every: int


@dataclass
class Monitor:
    metric: str
    threshold: float


type Callback = Checkpoint | EarlyStopping | Logger | Monitor


@dataclass
class Metric:
    name: str
    top_k: int = 1


@dataclass
class Evaluator:
    loader: Loader
    metrics: Sequence[Metric]
    every: int


@dataclass
class Experiment:
    name: str
    model: VisionModel
    loop: Loop
    evaluation: Sequence[Evaluator]
    callbacks: Sequence[Callback]
    tracker: Tracker
    seed: int
    output: Path


def configuration_issues(run: Experiment) -> list[str]:
    return _model_issues(run) + _loop_issues(run.loop) + _evaluation_issues(run)


def _model_issues(run: Experiment) -> list[str]:
    model, loader = run.model, run.loop.budget.loader
    issues: list[str] = []
    widths = [
        model.embedding.width,
        model.encoder.attention.width,
        model.encoder.feed_forward.width,
        model.head.width,
    ]
    if len(set(widths)) != 1:
        issues.append("Model widths disagree. Use the shared width in every component.")
    heads = model.encoder.attention.heads
    if heads < 1 or widths[0] < 1 or widths[0] % heads:
        issues.append(
            "Attention width must be positive and divisible by its head count."
        )
    if model.head.classes != loader.dataset.classes:
        issues.append("Head classes must match the training dataset classes.")
    if any(
        isinstance(step, Resize)
        and (model.embedding.patch_size < 1 or step.size % model.embedding.patch_size)
        for step in loader.pipeline.steps
    ):
        issues.append(
            "Resize size must be divisible by the model's positive patch size."
        )
    return issues


def _loop_issues(loop: Loop) -> list[str]:
    budget = loop.budget
    issues: list[str] = []
    if any(
        value < 1
        for value in [
            budget.epochs,
            budget.loader.batch_size,
            budget.distributed.devices,
            budget.distributed.nodes,
            budget.gradients.accumulation,
        ]
    ):
        issues.append("Epochs and every batch multiplier must be at least one.")
    if loop.optimizer.learning_rate <= 0:
        issues.append("The optimizer learning rate must be positive.")
    if not loop.optimizer.groups or not loop.losses:
        issues.append("Keep at least one parameter group and loss.")
    if not loop.schedule.stages or any(
        stage.steps < 1 for stage in loop.schedule.stages
    ):
        issues.append("The schedule needs stages with positive step counts.")
    if budget.effective_batch > 0:
        scheduled = sum(stage.steps for stage in loop.schedule.stages)
        if scheduled != budget.updates:
            issues.append(
                f"Schedule covers {scheduled:,} updates; "
                f"this run needs {budget.updates:,}."
            )
    return issues


def _evaluation_issues(run: Experiment) -> list[str]:
    issues: list[str] = []
    if any(e.loader.shuffle for e in run.evaluation):
        issues.append("Evaluation loaders should keep shuffle off for repeatability.")
    if any(e.loader.dataset.classes != run.model.head.classes for e in run.evaluation):
        issues.append(
            "Evaluation datasets must use the same classes as the model head."
        )
    if any(
        metric.top_k > run.model.head.classes
        for e in run.evaluation
        for metric in e.metrics
    ):
        issues.append("A metric's top_k cannot exceed the number of classes.")
    checkpoints = {c.directory for c in run.callbacks if isinstance(c, Checkpoint)}
    if len(checkpoints) > 1:
        issues.append("Checkpoint callbacks disagree about their directory.")
    return issues


def describe(runs: dict[str, Experiment]) -> str:
    lines = [
        "TRAINING SYSTEM / CONFIGURATION CHECK",
        "",
        "Constructs Python objects and checks their wiring.",
        "No training, file writes, or downloads.",
    ]
    seen_models: list[VisionModel] = []
    for key, run in runs.items():
        lines.extend(["", f"{key}: {run.name}"])
        issues = configuration_issues(run)
        if issues:
            lines.extend(f"  Adjust: {issue}" for issue in issues)
            continue
        if any(run.model is previous for previous in seen_models):
            lines.append("  Reuses the same model object as an earlier run.")
        seen_models.append(run.model)
        lines.extend(_resolved_settings(run))
    return "\n".join(lines)


def _resolved_settings(run: Experiment) -> list[str]:
    model, loop = run.model, run.loop
    budget = loop.budget
    loader, distributed = budget.loader, budget.distributed
    optimizer_detail = (
        f"betas={loop.optimizer.betas}"
        if isinstance(loop.optimizer, AdamW)
        else f"momentum={loop.optimizer.momentum:g}"
    )
    return [
        (
            f"  Model: width {model.embedding.width}, {model.encoder.depth} blocks, "
            f"{model.encoder.attention.heads} heads, {model.head.classes} classes"
        ),
        (
            f"  Embedding: {model.embedding.channels} channels, "
            f"{model.embedding.patch_size} px patches"
        ),
        (
            f"  Feed forward: {model.encoder.feed_forward.expansion}x expansion, "
            f"{model.encoder.feed_forward.activation} activation"
        ),
        (
            f"  Dropout: attention={model.encoder.attention.dropout:g}, "
            f"head={model.head.dropout:g}"
        ),
        (
            f"  Data: {loader.dataset.root}/{loader.dataset.split} "
            f"({loader.dataset.samples:,} examples)"
        ),
        "  Transforms: "
        + " -> ".join(_transform_description(step) for step in loader.pipeline.steps),
        (
            f"  Batch: {loader.batch_size} x {distributed.devices} devices x "
            f"{distributed.nodes} nodes x {budget.gradients.accumulation} accumulation "
            f"= {budget.effective_batch}"
        ),
        f"  Budget: {budget.epochs} epochs / {budget.updates:,} optimizer updates",
        (
            f"  Optimizer: {type(loop.optimizer).__name__} / "
            f"lr={loop.optimizer.learning_rate:g}, {optimizer_detail}"
        ),
        "  Parameter groups: "
        + ", ".join(
            f"{g.target} (lr x {g.lr_scale:g}, decay={g.weight_decay:g})"
            for g in loop.optimizer.groups
        ),
        "  Schedule: "
        + " -> ".join(
            f"Warmup({s.steps:,}, start={s.start_factor:g})"
            if isinstance(s, Warmup)
            else f"Cosine({s.steps:,}, min={s.min_factor:g})"
            for s in loop.schedule.stages
        ),
        "  Losses: "
        + ", ".join(
            f"{loss.name} x {loss.weight:g} (smoothing={loss.smoothing:g})"
            for loss in loop.losses
        ),
        (
            f"  Runtime: {loop.precision.mode}, "
            f"{loop.precision.loss_scale} loss scale, {distributed.backend} backend, "
            f"gradient clip {budget.gradients.clip_norm:g}"
        ),
        (
            f"  Cache: {loader.cache.size_gb} GiB at {loader.cache.directory}, "
            f"{loader.workers} loader workers"
        ),
        "  Evaluation: "
        + "; ".join(
            (
                f"{e.loader.dataset.split} "
                f"({'at end' if e.every == 0 else f'every {e.every} epochs'})"
            )
            for e in run.evaluation
        ),
        "  Callbacks: " + "; ".join(_callback_description(c) for c in run.callbacks),
        f"  Output: {run.output} / seed {run.seed}",
        f"  Tracking: {run.tracker.project} / group {run.tracker.group}",
        "  Configuration is consistent.",
    ]


def _transform_description(step: Transform) -> str:
    if isinstance(step, Resize):
        return f"Resize({step.size}, {step.interpolation})"
    if isinstance(step, RandomCrop):
        return f"RandomCrop({step.size}, padding={step.padding})"
    if isinstance(step, RandomFlip):
        return f"RandomFlip(p={step.probability:g})"
    if isinstance(step, ColorJitter):
        return (
            f"ColorJitter(brightness={step.brightness:g}, contrast={step.contrast:g})"
        )
    return f"Normalize(mean={step.mean}, std={step.std})"


def _callback_description(callback: Callback) -> str:
    if isinstance(callback, Checkpoint):
        return (
            f"Checkpoint(every {callback.every} epochs, keep {callback.keep}, "
            f"{callback.directory})"
        )
    if isinstance(callback, EarlyStopping):
        return f"EarlyStopping({callback.metric}, patience={callback.patience})"
    if isinstance(callback, Logger):
        return f"Logger(every {callback.every} updates, {callback.directory})"
    return f"Monitor({callback.metric}, threshold={callback.threshold:g})"
