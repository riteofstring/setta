from sklearn.datasets import make_moons
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

from model_workshop import show

data = make_moons(n_samples=400, noise=0.2, random_state=7)
steps = [
    StandardScaler(),
    PolynomialFeatures(degree=1, include_bias=False),
    LogisticRegression(C=1.0, max_iter=1000),
]
pipeline = make_pipeline(*steps)
show(pipeline, data)
