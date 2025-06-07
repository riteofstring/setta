"""
GraphQL and REST API queries for Fly.io operations.
"""

# GraphQL Queries
CREATE_APP_MUTATION = """
mutation($input: CreateAppInput!) {
    createApp(input: $input) {
        app {
            id
            name
            hostname
            network
            organization {
                slug
            }
        }
    }
}
"""

DELETE_APP_MUTATION = """
mutation($appId: ID!) {
    deleteApp(appId: $appId) {
        deletedAppId
    }
}
"""

GET_APP_QUERY = """
query($appName: String!) {
    app(name: $appName) {
        id
        name
        hostname
        status
        ipAddresses {
            nodes {
                id
                address
                type
            }
        }
    }
}
"""

GET_ORGANIZATION_QUERY = """
query {
    viewer {
        organizations {
            nodes {
                id
                slug
                name
                type
            }
        }
    }
}
"""

# New queries for IP allocation
ALLOCATE_IPV4_MUTATION = """
mutation($input: AllocateIPAddressInput!) {
    allocateIpAddress(input: $input) {
        app {
            sharedIpAddress
        }
    }
}
"""

ALLOCATE_IPV6_MUTATION = """
mutation($input: AllocateIPAddressInput!) {
    allocateIpAddress(input: $input) {
        ipAddress {
            id
            address
            type
            region
            createdAt
        }
    }
}
"""


# Machine configuration for deployment
def get_machine_config(app_name: str):
    """Get the machine configuration for deployment."""
    return {
        "region": "yyz",  # Toronto, matching your test app
        "config": {
            "image": "flyio/hellofly:latest",  # Using Fly's hello world image for now
            "guest": {"cpu_kind": "shared", "cpus": 1, "memory_mb": 256},
            "services": [
                {
                    "protocol": "tcp",
                    "internal_port": 8080,
                    "autostop": "stop",
                    "autostart": True,
                    "ports": [
                        {"port": 80, "handlers": ["http"], "force_https": True},
                        {"port": 443, "handlers": ["http", "tls"]},
                    ],
                }
            ],
        },
    }
