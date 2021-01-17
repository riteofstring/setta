import torch


def optimizer_factory(model, optimizer, kwargs):
    device = torch.device("cuda")
    model = model.to(device)
    return optimizer(model.parameters(), **kwargs)


def dataset_factory(dataset, transform, kwargs):
    return dataset(transform=transform, **kwargs)
