import torch.nn


p0="dogs"
p6=5
s0=torch.nn.CrossEntropyLoss(weight=p0, some_random_arg=p6, anotho=5)
