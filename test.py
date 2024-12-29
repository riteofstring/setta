# import numpy as np
# import pandas as pd

# # Set random seed for reproducibility
# np.random.seed(42)

# # Generate sample size
# n_samples = 1000

# # Generate x values
# x = np.random.uniform(0, 100, n_samples)

# # Generate y values with some correlation to x plus random noise
# y = 0.5 * x + np.random.normal(0, 15, n_samples)

# # Generate a categorical variable
# categories = np.random.choice(['A', 'B', 'C'], size=n_samples)

# # Create a DataFrame
# df = pd.DataFrame({
#     'x_value': x,
#     'y_value': y,
#     'category': categories
# })

# # Save to CSV
# df.to_csv('scatter_data.csv', index=False)

# # Print first few rows to verify
# print("First few rows of the generated data:")
# print(df.head())

# x,y,z=1,2,3

# my_var = (x +
# y +
# z)

# print(my_var)