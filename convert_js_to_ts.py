import os
import glob

# CONFIGURATION: Set your root folder here
ROOT_FOLDER = "frontend/src/forks"  # Change this to your desired path

def convert_js_to_ts(root_folder):
    """
    Convert all .js files to .ts and .jsx files to .tsx
    in the specified root folder and all subdirectories
    """
    
    # Validate the root folder
    if not os.path.exists(root_folder):
        print(f"Error: The specified folder '{root_folder}' does not exist.")
        return
    
    if not os.path.isdir(root_folder):
        print(f"Error: '{root_folder}' is not a directory.")
        return
    
    # Change to the root folder to make glob work properly
    original_cwd = os.getcwd()
    os.chdir(root_folder)
    
    try:
        # Counter for tracking conversions
        js_count = 0
        jsx_count = 0
        
        print(f"Searching in: {os.path.abspath(root_folder)}")
        print("-" * 50)
        
        # Find all .js files recursively
        js_files = glob.glob('**/*.js', recursive=True)
        for js_file in js_files:
            ts_file = js_file[:-3] + '.ts'  # Replace .js with .ts
            try:
                os.rename(js_file, ts_file)
                print(f"Renamed: {js_file} -> {ts_file}")
                js_count += 1
            except OSError as e:
                print(f"Error renaming {js_file}: {e}")
        
        # Find all .jsx files recursively
        jsx_files = glob.glob('**/*.jsx', recursive=True)
        for jsx_file in jsx_files:
            tsx_file = jsx_file[:-4] + '.tsx'  # Replace .jsx with .tsx
            try:
                os.rename(jsx_file, tsx_file)
                print(f"Renamed: {jsx_file} -> {tsx_file}")
                jsx_count += 1
            except OSError as e:
                print(f"Error renaming {jsx_file}: {e}")
        
        # Summary
        print("-" * 50)
        print(f"Conversion complete!")
        print(f"Converted {js_count} .js files to .ts")
        print(f"Converted {jsx_count} .jsx files to .tsx")
        print(f"Total files converted: {js_count + jsx_count}")
        
    finally:
        # Always change back to original directory
        os.chdir(original_cwd)

if __name__ == "__main__":
    root_folder = os.path.abspath(ROOT_FOLDER)
    
    # Confirm before proceeding
    print("This script will rename all .js files to .ts and .jsx files to .tsx")
    print(f"in '{root_folder}' and all subdirectories.")
    print()
    
    confirm = input("Do you want to proceed? (y/N): ").lower().strip()
    
    if confirm == 'y' or confirm == 'yes':
        convert_js_to_ts(ROOT_FOLDER)
    else:
        print("Operation cancelled.")