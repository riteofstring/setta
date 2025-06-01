"""
GraphQL queries for Fly.io API.
All the ugly GraphQL is contained here so you can ignore it.
"""

# Get user's organizations
GET_ORGANIZATIONS_QUERY = """
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

# Create a new Fly app
CREATE_APP_MUTATION = """
mutation($input: CreateAppInput!) {
    createApp(input: $input) {
        app {
            id
            name
            hostname
        }
    }
}
"""

# Deploy an image to an app (high-level operation)
DEPLOY_IMAGE_MUTATION = """
mutation($input: DeployImageInput!) {
    deployImage(input: $input) {
        app {
            id
            name
            hostname
        }
        release {
            id
            version
            stable
        }
    }
}
"""

# Set secrets/environment variables
SET_SECRETS_MUTATION = """
mutation($input: SetSecretsInput!) {
    setSecrets(input: $input) {
        app {
            id
            name
        }
    }
}
"""

# Get app status and details
GET_APP_STATUS_QUERY = """
query($appName: String!) {
    app(name: $appName) {
        id
        name
        hostname
        status
        deployed
        currentRelease {
            id
            version
            stable
        }
    }
}
"""

# Delete an app - fixed response structure
DELETE_APP_MUTATION = """
mutation($appId: ID!) {
    deleteApp(appId: $appId) {
        clientMutationId
    }
}
"""
