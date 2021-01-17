def run():
    import sys

    sys.path.insert(
        0,
        "D:\\Documents\\App Development\\ABCDE\\ui_specifier\\integration_tests\\reading_specs/../../src",
    )
    from torch.optim import Adadelta
    from torchvision.datasets import MNIST
    from torchvision.transforms import Compose, Normalize, ToTensor

    from ui_specifier.templates.pytorch_factories import (
        dataset_factory,
        optimizer_factory,
    )
    from ui_specifier.templates.simple_train_test import Net, main

    Optimizer = Adadelta
    TrainDataset = MNIST
    ValDataset = MNIST
    epochs = 1
    test_batch_size = 1000
    batch_size = 64
    stdx = 0.3081
    std = [stdx]
    meanx = 0.1307
    mean = [meanx]
    transformsxx = Normalize(mean=mean, std=std)
    transformsx = ToTensor()
    transforms = [transformsx, transformsxx]
    downloadx = True
    trainx = False
    rootx = "."
    download = True
    train = True
    root = "."
    lr = 0.1
    Model = Net()
    Transform = Compose(transforms=transforms)
    VariousParams = {
        "batch_size": batch_size,
        "test_batch_size": test_batch_size,
        "epochs": epochs,
    }
    Optimizer = optimizer_factory(model=Model, optimizer=Optimizer, kwargs={"lr": lr})
    TrainDataset = dataset_factory(
        dataset=TrainDataset,
        transform=Transform,
        kwargs={"root": root, "train": train, "download": download},
    )
    ValDataset = dataset_factory(
        dataset=ValDataset,
        transform=Transform,
        kwargs={"root": rootx, "train": trainx, "download": downloadx},
    )
    Main = main(
        model=Model,
        optimizer=Optimizer,
        train_set=TrainDataset,
        val_set=ValDataset,
        batch_size=batch_size,
        test_batch_size=test_batch_size,
        epochs=epochs,
    )


if __name__ == "__main__":
    run()
