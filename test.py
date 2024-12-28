import numpy as np
import pandas as pd

x = np.linspace(-10, 10, 20)
sine = np.sin(x)
cosine = np.cos(x)
damped_sine = np.exp(-0.2*abs(x)) * sine
squared = x**2

df = pd.DataFrame({
   'input_value': x,
   'sine_wave': sine,
   'cosine_wave': cosine, 
   'damped_oscillation': damped_sine,
   'quadratic': squared
})

df.to_csv('function_data.csv', index=False)