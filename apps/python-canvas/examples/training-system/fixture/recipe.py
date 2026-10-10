from pathlib import Path

import training_system as ts


def build(width: int = 192, batch_size: int = 64) -> dict[str, ts.Experiment]:
    shared_defaults = {
        "seed": 17,
        "image_size": 64,
        "width": width,
        "heads": 6,
        "classes": 10,
        "batch_size": batch_size,
        "epochs": 40,
    }
    paths = {
        "dataset": Path("datasets/orchard"),
        "output": Path("runs/orchard"),
        "cache": Path("cache/images"),
    }
    resources = ts.Resources(devices=4, workers=8, memory_gb=64)
    cache = ts.Cache(directory=paths["cache"], size_gb=16)
    storage = ts.Storage(root=paths["output"], keep_last=3)
    tracker = ts.Tracker(
        project="orchard-classifier",
        group="architecture-study",
        directory=storage.root / "logs",
    )
    train_data = ts.Dataset(
        root=paths["dataset"],
        split="train",
        classes=shared_defaults["classes"],
        samples=50000,
    )
    validation_data = ts.Dataset(
        root=paths["dataset"],
        split="validation",
        classes=shared_defaults["classes"],
        samples=5000,
    )
    test_data = ts.Dataset(
        root=paths["dataset"],
        split="test",
        classes=shared_defaults["classes"],
        samples=10000,
    )
    smoke_data = ts.Dataset(
        root=paths["dataset"],
        split="smoke",
        classes=shared_defaults["classes"],
        samples=128,
    )
    random_crop = ts.RandomCrop(size=shared_defaults["image_size"], padding=8)
    horizontal_flip = ts.RandomFlip(probability=0.5)
    color_jitter = ts.ColorJitter(brightness=0.2, contrast=0.2)
    augmentations = [random_crop, horizontal_flip, color_jitter]
    resize = ts.Resize(size=shared_defaults["image_size"], interpolation="bilinear")
    normalization = ts.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225))
    preprocessing = [resize, normalization]
    training_pipeline = ts.Pipeline(steps=augmentations + preprocessing)
    evaluation_pipeline = ts.Pipeline(steps=preprocessing)
    train_loader = ts.Loader(
        dataset=train_data,
        pipeline=training_pipeline,
        cache=cache,
        batch_size=shared_defaults["batch_size"],
        workers=resources.workers,
        shuffle=True,
    )
    validation_loader = ts.Loader(
        dataset=validation_data,
        pipeline=evaluation_pipeline,
        cache=cache,
        batch_size=shared_defaults["batch_size"],
        workers=resources.workers,
        shuffle=False,
    )
    test_loader = ts.Loader(
        dataset=test_data,
        pipeline=evaluation_pipeline,
        cache=cache,
        batch_size=shared_defaults["batch_size"],
        workers=resources.workers,
        shuffle=False,
    )
    smoke_loader = ts.Loader(
        dataset=smoke_data,
        pipeline=training_pipeline,
        cache=cache,
        batch_size=8,
        workers=resources.workers,
        shuffle=True,
    )
    patch_embedding = ts.Embedding(
        channels=3, width=shared_defaults["width"], patch_size=8
    )
    attention = ts.Attention(
        width=shared_defaults["width"], heads=shared_defaults["heads"], dropout=0.1
    )
    feed_forward = ts.FeedForward(
        width=shared_defaults["width"], expansion=4, activation="gelu"
    )
    encoder = ts.Encoder(attention=attention, feed_forward=feed_forward, depth=12)
    classifier_head = ts.Head(
        width=shared_defaults["width"], classes=shared_defaults["classes"], dropout=0.1
    )
    model = ts.VisionModel(
        embedding=patch_embedding, encoder=encoder, head=classifier_head
    )
    backbone_group = ts.ParameterGroup(target="encoder", lr_scale=1, weight_decay=0.05)
    head_group = ts.ParameterGroup(target="head", lr_scale=5, weight_decay=0.01)
    normalization_group = ts.ParameterGroup(target="norm", lr_scale=1, weight_decay=0)
    parameter_groups = [backbone_group, head_group, normalization_group]
    optimizer = ts.AdamW(
        groups=parameter_groups, learning_rate=0.0003, betas=(0.9, 0.999)
    )
    sgd_optimizer = ts.SGD(
        groups=parameter_groups,
        learning_rate=optimizer.learning_rate * 10,
        momentum=0.9,
    )
    precision = ts.Precision(mode="bf16", loss_scale="dynamic")
    distributed = ts.Distributed(devices=resources.devices, nodes=1, backend="nccl")
    local_runtime = ts.Distributed(devices=1, nodes=1, backend="gloo")
    gradients = ts.GradientPolicy(accumulation=2, clip_norm=1.0)
    budget = ts.StepBudget(
        loader=train_loader,
        distributed=distributed,
        gradients=gradients,
        epochs=shared_defaults["epochs"],
    )
    smoke_budget = ts.StepBudget(
        loader=smoke_loader, distributed=local_runtime, gradients=gradients, epochs=1
    )
    warmup = ts.Warmup(steps=max(1, budget.updates // 20), start_factor=0.01)
    cosine_decay = ts.Cosine(
        steps=budget.updates - max(1, budget.updates // 20), min_factor=0.01
    )
    schedule_stages = [warmup, cosine_decay]
    schedule = ts.Schedule(stages=schedule_stages)
    smoke_warmup = ts.Warmup(
        steps=max(1, smoke_budget.updates // 20), start_factor=0.01
    )
    smoke_cosine_decay = ts.Cosine(
        steps=smoke_budget.updates - max(1, smoke_budget.updates // 20), min_factor=0.01
    )
    smoke_stages = [smoke_warmup, smoke_cosine_decay]
    smoke_schedule = ts.Schedule(stages=smoke_stages)
    classification_loss = ts.Loss(name="cross_entropy", weight=1.0, smoothing=0.1)
    regularization_loss = ts.Loss(name="feature_norm", weight=0.01, smoothing=0.0)
    losses = [classification_loss, regularization_loss]
    training_loop = ts.Loop(
        optimizer=optimizer,
        schedule=schedule,
        losses=losses,
        budget=budget,
        precision=precision,
    )
    smoke_loop = ts.Loop(
        optimizer=optimizer,
        schedule=smoke_schedule,
        losses=losses,
        budget=smoke_budget,
        precision=precision,
    )
    sgd_loop = ts.Loop(
        optimizer=sgd_optimizer,
        schedule=schedule,
        losses=losses,
        budget=budget,
        precision=precision,
    )
    checkpoints = ts.Checkpoint(
        directory=storage.root / "checkpoints", every=5, keep=storage.keep_last
    )
    early_stopping = ts.EarlyStopping(metric="validation/accuracy", patience=10)
    event_logger = ts.Logger(directory=tracker.directory, every=20)
    divergence_monitor = ts.Monitor(metric="training/loss", threshold=100.0)
    callbacks = [checkpoints, early_stopping, event_logger, divergence_monitor]
    top_1_accuracy = ts.Metric(name="accuracy", top_k=1)
    top_5_accuracy = ts.Metric(name="accuracy", top_k=5)
    macro_f1 = ts.Metric(name="macro_f1", top_k=1)
    metrics = [top_1_accuracy, top_5_accuracy, macro_f1]
    validation_evaluator = ts.Evaluator(
        loader=validation_loader, metrics=metrics, every=1
    )
    final_test_evaluator = ts.Evaluator(loader=test_loader, metrics=metrics, every=0)
    evaluation = [validation_evaluator, final_test_evaluator]
    baseline = ts.Experiment(
        name="Baseline",
        model=model,
        loop=training_loop,
        evaluation=evaluation,
        callbacks=callbacks,
        tracker=tracker,
        seed=shared_defaults["seed"],
        output=storage.root / "baseline",
    )
    smoke_run = ts.Experiment(
        name="Smoke run",
        model=model,
        loop=smoke_loop,
        evaluation=evaluation,
        callbacks=callbacks,
        tracker=tracker,
        seed=shared_defaults["seed"],
        output=storage.root / "smoke",
    )
    sgd_run = ts.Experiment(
        name="SGD run",
        model=model,
        loop=sgd_loop,
        evaluation=evaluation,
        callbacks=callbacks,
        tracker=tracker,
        seed=shared_defaults["seed"],
        output=storage.root / "sgd-run",
    )
    runs = {"baseline": baseline, "smoke": smoke_run, "sgd": sgd_run}
    return runs


if __name__ == "__main__":
    print(ts.describe(build()))
