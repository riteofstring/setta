import torch.nn


p0=[0.2, 0.3, "0.5"]
s0=torch.nn.CrossEntropyLoss(weight=p0)
