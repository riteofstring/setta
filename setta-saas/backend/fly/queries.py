"""
GraphQL queries for Fly.io API operations.
"""

# Organization queries
GET_ORGANIZATION = """
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

# App queries
CREATE_APP = """
mutation CreateApp($input: CreateAppInput!) {
    createApp(input: $input) {
        app {
            id
            name
            organization {
                slug
            }
            hostname
        }
    }
}
"""

DELETE_APP = """
mutation DeleteApp($appId: ID!) {
    deleteApp(appId: $appId) {
        deletedAppId
    }
}
"""

GET_APP = """
query GetApp($appName: String!) {
    app(name: $appName) {
        id
        name
        hostname
        deployed
        status
        version
        appUrl
    }
}
"""

# Volume queries
CREATE_VOLUME = """
mutation CreateVolume($input: CreateVolumeInput!) {
    createVolume(input: $input) {
        volume {
            id
            name
            region
            sizeGb
            encrypted
            createdAt
        }
    }
}
"""

DELETE_VOLUME = """
mutation DeleteVolume($volumeId: ID!) {
    deleteVolume(volumeId: $volumeId) {
        deletedVolumeId
    }
}
"""

# IP Address allocation queries
ALLOCATE_IP_ADDRESS = """
mutation AllocateIPAddress($input: AllocateIPAddressInput!) {
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

# For shared IPv4
ALLOCATE_SHARED_IP = """
mutation AllocateSharedIP($input: AllocateIPAddressInput!) {
    allocateIpAddress(input: $input) {
        app {
            sharedIpAddress
        }
    }
}
"""

# Deployment queries
SET_VM_SIZE = """
mutation SetVMSize($input: SetVMSizeInput!) {
    setVmSize(input: $input) {
        vmSize {
            name
            cpuCores
            memoryGb
        }
        processGroup
    }
}
"""
