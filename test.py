import numpy as np
import pandas as pd

x = np.linspace(-10, 10, 20)
sine = np.sin(x)
cosine = np.cos(x)
damped_sine = np.exp(-0.2*abs(x)) * sine
squared = x**2

# Randomly replace some values with NaN
np.random.seed(42)  # For reproducibility
sine[np.random.choice([True, False], size=sine.shape, p=[0.2, 0.8])] = np.nan
cosine[np.random.choice([True, False], size=cosine.shape, p=[0.15, 0.85])] = np.nan
damped_sine[np.random.choice([True, False], size=damped_sine.shape, p=[0.25, 0.75])] = np.nan
squared[np.random.choice([True, False], size=squared.shape, p=[0.1, 0.9])] = np.nan

df = pd.DataFrame({
   'input_value': x,
   'sine_wave': sine,
   'cosine_wave': cosine, 
   'damped_oscillation': damped_sine,
   'quadratic': squared
})

df.to_csv('function_data.csv', index=False)