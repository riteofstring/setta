import numpy as np
import pandas as pd

# Generate x values
x = np.linspace(0, 20, 10000)

# Create an interesting function: damped oscillation with noise
def interesting_function(x):
    # Combine several mathematical elements:
    # 1. Damped oscillation
    # 2. Non-linear component
    # 3. Random noise
    damped_oscillation = np.exp(-0.2 * x) * np.sin(2 * x)
    non_linear = 0.1 * x**2 * np.exp(-0.5 * x)
    noise = np.random.normal(0, 0.05, len(x))
    
    return damped_oscillation + non_linear + noise

# Generate y values
y = interesting_function(x)

# Create DataFrame with just y values
df = pd.DataFrame({'value': y})

# Save to CSV
df.to_csv('interesting_function_samples.csv', index=False)