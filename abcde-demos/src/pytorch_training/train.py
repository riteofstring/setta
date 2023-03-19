import torch
import torch.nn as nn
from tqdm import tqdm


def train_loop(
    model, optimizer, loss_fn, train_dataloader, logger, log_interval, device
):
    model.train()
    for i, (imgs, labels) in enumerate(tqdm(train_dataloader)):
        imgs, labels = imgs.to(device), labels.to(device)
        logits = model(imgs)
        loss = loss_fn(logits, labels)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        if i % log_interval == 0:
            logger.log("Training", "loss", loss.item())

        if i > 100:
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
        if i > 100:
            break

    all_preds = torch.cat(all_preds, dim=0)
    all_labels = torch.cat(all_labels, dim=0)
    for metric in metrics:
        metric(all_preds, all_labels)

    accs = {metric.__class__.__name__: metric.compute().item() for metric in metrics}
    print("accs", accs)
    for k, v in accs.items():
        logger.log("Evaluation", k, v)

    # Reseting internal state such that metric ready for new data
    for metric in metrics:
        metric.reset()


def train(
    model,
    optimizer,
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

    for e in range(epochs):
        print(f"Training epoch {e}")
        train_loop(
            model, optimizer, loss_fn, train_dataloader, logger, log_interval, device
        )

        if e % val_interval == 0:
            print(f"Evaluating epoch {e}")
            eval_loop(model, val_dataloader, logger, metrics, device)
