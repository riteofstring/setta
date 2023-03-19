import torch
import torch.nn as nn
from tqdm import tqdm


def train(
    model,
    optimizer,
    loss_fn,
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

    for i, (imgs, labels) in enumerate(tqdm(train_dataloader)):
        imgs, labels = imgs.to(device), labels.to(device)
        logits = model(imgs)
        loss = loss_fn(logits, labels)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        if i % log_interval == 0:
            logger.log("training", "loss", loss.item())
