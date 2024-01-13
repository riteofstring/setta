# def main():
#     # Ask the user for their username
#     username = input("Enter your username: ")

#     # Greet the user
#     print(f"Hello, {username}! Welcome to the interactive script.")

# if __name__ == "__main__":
#     main()


import tqdm
import time

for i in tqdm.tqdm(range(100)):
    time.sleep(0.1)


# import signal
# import time

# def signal_handler(sig, frame):
#     print('SIGINT received, terminating the script.')
#     exit(0)

# signal.signal(signal.SIGINT, signal_handler)

# try:
#     time.sleep(3)
# except KeyboardInterrupt:
#     print("KeyboardInterrupt caught (this should not be printed).")

# print("Script completed")