import click
import requests

BACKEND = "http://localhost:8000/"
USERNAME = "Kevin"
PASSWORD = "123"


def try_login():
    # username = input("Username:")
    # password = getpass.getpass("Password:")
    username = USERNAME
    password = PASSWORD
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


def get_code(access_token, code_id):
    r = requests.post(
        f"{BACKEND}codeGenerator/getCode",
        data={"codeId": code_id},
        headers={"Authorization": f"Bearer {access_token}"},
    )
    print(r.json()["code"])


@click.command()
@click.argument("code_id")
def run(code_id):
    login_fail, r = try_login()
    if login_fail:
        return
    get_code(r.json()["access_token"], code_id)


@click.group()
def cli():
    pass


cli.add_command(run)

if __name__ == "__main__":
    cli()
