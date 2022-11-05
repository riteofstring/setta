import argparse
import getpass

import requests

BACKEND = "http://localhost:8000/"


def try_login():
    username = input("Username:")
    password = getpass.getpass("Password:")
    r = requests.post(
        f"{BACKEND}auth/login",
        data={"username": username, "password": password},
    )
    login_fail = r.status_code != 201
    if login_fail:
        print("Incorrect username/password combination\n")
    else:
        print("Login success")
    return login_fail, r


def get_code(access_token, codeId):
    r = requests.post(
        f"{BACKEND}codeGenerator/getCode",
        data={"codeId": codeId},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    print(r.json()["code"])


def main(codeId):
    MAX_ATTEMPTS = 3
    for i in range(MAX_ATTEMPTS):
        login_fail, returned_data = try_login()
        if not login_fail:
            break
        if i == MAX_ATTEMPTS - 1:
            print("Too many attempts")

    access_token = returned_data.json()["access_token"]
    get_code(access_token, codeId)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("codeId", type=str)
    args = parser.parse_args()
    main(args.codeId)
