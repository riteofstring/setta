from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.svm import SVC

from model_arena import compare, show

models = [
    LogisticRegression(C=1.0, max_iter=1000),
    SVC(C=2.0, gamma="scale"),
    RandomForestClassifier(n_estimators=64, max_depth=6, random_state=7),
]
features = [StandardScaler(), PolynomialFeatures(degree=1, include_bias=False)]
show(compare(models, features, shape="moons", noise=0.18, training_points=100, seed=7))
