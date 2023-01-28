export default {
  "3de52698-8016-43fa-b401-87e583b70b95": {
    id: "3de52698-8016-43fa-b401-87e583b70b95",
    name: "firstRun",
    ownerId: "25961114-6655-4e2c-b70f-e2e3aaa84131",
    outputGroups: [
      "67863f2c-9916-4d9b-9c60-b7ed3781f49d",
      "966d6f92-3f4f-447c-8a7c-b04dc419a965",
    ],
    code: 'import src.pytorch_lightning_mnist.model \n\
import torchvision.transforms \n\
import torchvision.datasets \n\
import torch.utils.data \n\
import pytorch_lightning \n\
import src.pytorch_lightning_mnist.train \n\
\n\
\n\
s0 = src.pytorch_lightning_mnist.model.MNISTModel() \n\
p0 = "." \n\
s3 = torchvision.transforms.ToTensor() \n\
p1 = s3 \n\
p2 = True \n\
s2 = torchvision.datasets.MNIST(root=p0, transform=p1, download=p2) \n\
p3 = s2 \n\
s1 = torch.utils.data.DataLoader(dataset=p3) \n\
s4 = pytorch_lightning.Trainer() \n\
p4 = s4 \n\
p5 = s0 \n\
p6 = s1 \n\
s5 = src.pytorch_lightning_mnist.train.train(trainer=p4, model=p5, dataloader=p6)',
  },
};
