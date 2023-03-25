from collections import defaultdict

import numpy as np
import torch
import torch.nn as nn
from tqdm import tqdm


@torch.no_grad()
def train_loop_log(model, lr, loss, to_log, logger, log_interval, i):
    to_log["Training losses"]["loss"].append(loss.item())
    to_log["Learning rates"]["lr"].append(lr)
    for (name, p) in model.named_parameters():
        if "weight" in name and "0.conv1" in name:
            to_log["Gradient ratios"][name].append(
                ((lr * p.grad).std() / p.data.std()).log10().item()
            )

    if i % log_interval == 0:
        for log_group_name, log_group in to_log.items():
            for series_name, series in log_group.items():
                logger.log(log_group_name, series_name, np.mean(series))
            to_log[log_group_name] = defaultdict(list)


def train_loop(
    model,
    optimizer,
    lr_scheduler,
    loss_fn,
    train_dataloader,
    logger,
    log_interval,
    device,
):
    model.train()
    to_log = {
        "Training losses": defaultdict(list),
        "Learning rates": defaultdict(list),
        "Gradient ratios": defaultdict(list),
    }
    for i, (imgs, labels) in enumerate(tqdm(train_dataloader)):
        imgs, labels = imgs.to(device), labels.to(device)
        logits = model(imgs)
        loss = loss_fn(logits, labels)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        train_loop_log(
            model, lr_scheduler.get_last_lr()[0], loss, to_log, logger, log_interval, i
        )
        lr_scheduler.step()
        if i == 499:
            break


@torch.no_grad()
def eval_loop(model, val_dataloader, logger, metrics, device):
    model.eval()
    all_preds, all_labels = [], []
    for i, (imgs, labels) in enumerate(tqdm(val_dataloader)):
        imgs, labels = imgs.to(device), labels.to(device)
        logits = model(imgs)
        preds = logits.softmax(dim=-1)
        all_preds.append(preds)
        all_labels.append(labels)
        if i == 99:
            break

    all_preds = torch.cat(all_preds, dim=0)
    all_labels = torch.cat(all_labels, dim=0)
    for metric in metrics:
        metric(all_preds, all_labels)

    accs = {metric.__class__.__name__: metric.compute().item() for metric in metrics}
    for k, v in accs.items():
        logger.log("Evaluation", k, v)

    # Reseting internal state such that metric ready for new data
    for metric in metrics:
        metric.reset()


def train(
    model,
    optimizer,
    lr_scheduler,
    loss_fn,
    metrics,
    train_dataloader,
    val_dataloader,
    logger,
    epochs,
    val_interval,
    log_interval,
):
    device = torch.device("cuda")
    model.fc = nn.Linear(model.fc.in_features, len(train_dataloader.dataset.classes))
    model.to(device)
    metrics = [metric.to(device) for metric in metrics]

    # print(f"Evaluating pretrained model")
    # eval_loop(model, val_dataloader, logger, metrics, device)

    for e in range(epochs):
        print(f"Training epoch {e}")
        train_loop(
            model,
            optimizer,
            lr_scheduler,
            loss_fn,
            train_dataloader,
            logger,
            log_interval,
            device,
        )

        if e % val_interval == 0:
            print(f"Evaluating epoch {e}")
            eval_loop(model, val_dataloader, logger, metrics, device)
