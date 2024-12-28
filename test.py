import numpy as np
import pandas as pd

# Generate x values between -10 and 10
x = np.linspace(-10, 10, 20)

# Calculate damped sine wave
y = np.exp(-0.2*abs(x)) * np.sin(x)

# Create dataframe with descriptive column names
df = pd.DataFrame({
   'input_amplitude': x,
   'damped_oscillation': y
})

# Save to CSV
df.to_csv('damped_sine.csv', index=False)