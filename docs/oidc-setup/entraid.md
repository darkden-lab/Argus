# Microsoft Entra ID (Azure AD) OIDC Setup

This guide walks through configuring Microsoft Entra ID as an OIDC provider for Argus.

## Prerequisites

- An Azure account with access to the Azure Portal
- Permissions to create App Registrations in your Entra ID tenant

## Step 1: Register an Application

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations**
2. Click **New registration**
3. Configure:
   - **Name**: `Argus Dashboard`
   - **Supported account types**: Select based on your needs (single tenant is recommended)
   - **Redirect URI**: Select **Web** and enter:
     ```
     https://argus.yourdomain.com/api/auth/oidc/callback
     ```
4. Click **Register**

## Step 2: Configure Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description and select an expiration period
4. Click **Add**
5. **Copy the secret value immediately** -- it is only shown once

## Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph** > **Delegated permissions**
3. Add:
   - `openid`
   - `profile`
   - `email`
4. Click **Grant admin consent** (if you have permission)

## Step 4: Configure Groups Claim (Optional)

To map Entra ID groups to Argus RBAC roles:

1. Go to **Token configuration**
2. Click **Add groups claim**
3. Select **Security groups** (or All groups)
4. Under **ID** token, check **Group ID** (or **sAMAccountName** if using on-premises sync)
5. Click **Add**

> **Note:** Entra ID sends group Object IDs by default. If you need group names, configure the optional claim for `groups` with the "Emit groups as role claims" option, or use the `cloud_displayName` attribute.

## Step 5: Note Your Configuration Values

From the **Overview** page of your app registration:

| Value | Where to Find |
|-------|---------------|
| Tenant ID | Overview > Directory (tenant) ID |
| Client ID | Overview > Application (client) ID |
| Client Secret | Certificates & secrets (from Step 2) |

The issuer URL for Entra ID is:
```
https://login.microsoftonline.com/<tenant-id>/v2.0
```

## Step 6: Configure Argus

### Option A: Via Dashboard UI

1. Go to **Settings > Authentication > OIDC Configuration**
2. Select **Microsoft Entra ID** from the provider presets
3. Enter your **Tenant ID** -- the issuer URL is auto-populated
4. Enter your **Client ID** and **Client Secret**
5. The redirect URL is auto-filled
6. Set **Groups Claim** to `groups`
7. Click **Save**
8. Click **Test Connection** to verify

### Option B: Via Environment Variables

```bash
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<application-client-id>
OIDC_CLIENT_SECRET=<client-secret-value>
OIDC_REDIRECT_URL=https://argus.yourdomain.com/api/auth/oidc/callback
```

### Option C: Via Helm Values

```yaml
oidc:
  enabled: true
  issuerURL: "https://login.microsoftonline.com/<tenant-id>/v2.0"
  clientID: "<application-client-id>"
  clientSecret: "<client-secret-value>"
  redirectURL: "https://argus.yourdomain.com/api/auth/oidc/callback"
  groupsClaim: "groups"
```

## Group-to-Role Mapping

After configuring OIDC, map Entra ID groups to Argus RBAC roles:

1. Go to **Settings > Authentication > Group Mappings**
2. Click **Add Mapping**
3. Enter the Entra ID **Group Object ID** (e.g., `a1b2c3d4-...`)
4. Select the Argus role to assign (e.g., `admin`, `viewer`)
5. Optionally scope to a specific cluster or namespace

## Troubleshooting

- **"AADSTS700016: Application not found"** -- Verify the Client ID and that the app registration exists in the correct tenant.
- **"AADSTS7000215: Invalid client secret"** -- The secret may have expired. Generate a new one.
- **Groups not appearing in tokens** -- Ensure the groups claim is configured in Token Configuration and admin consent has been granted.
- **Too many groups** -- If the user is in more than 150 groups, Entra ID returns a groups overage claim instead of the groups list. Consider using application roles instead.
