# Okta OIDC Setup

This guide walks through configuring Okta as an OIDC provider for Argus.

## Prerequisites

- An Okta organization (developer or enterprise)
- Admin access to the Okta Admin Console

## Step 1: Create an Application

1. Go to [Okta Admin Console](https://your-org.okta.com/admin) > **Applications** > **Applications**
2. Click **Create App Integration**
3. Select:
   - **Sign-in method**: OIDC - OpenID Connect
   - **Application type**: Web Application
4. Click **Next**

## Step 2: Configure the Application

1. **App integration name**: `Argus Dashboard`
2. **Grant type**: Authorization Code (default)
3. **Sign-in redirect URIs**:
   ```
   https://argus.yourdomain.com/api/auth/oidc/callback
   ```
4. **Sign-out redirect URIs** (optional):
   ```
   https://argus.yourdomain.com/login
   ```
5. **Assignments**: Choose who can access (everyone, or specific groups)
6. Click **Save**

## Step 3: Configure Groups Claim

To map Okta groups to Argus RBAC roles:

1. Go to **Security** > **API** > **Authorization Servers**
2. Select **default** (or your custom authorization server)
3. Go to the **Claims** tab
4. Click **Add Claim**:
   - **Name**: `groups`
   - **Include in token type**: ID Token, Always
   - **Value type**: Groups
   - **Filter**: Matches regex `.*` (or a more specific filter)
5. Click **Create**

## Step 4: Note Your Configuration Values

From the application's **General** tab:

| Value | Where to Find |
|-------|---------------|
| Okta Domain | Admin Console URL (e.g., `your-org.okta.com`) |
| Client ID | General > Client Credentials > Client ID |
| Client Secret | General > Client Credentials > Client Secret |

The issuer URL for Okta is:
```
https://your-org.okta.com
```

Or if using a custom authorization server:
```
https://your-org.okta.com/oauth2/default
```

## Step 5: Configure Argus

### Option A: Via Dashboard UI

1. Go to **Settings > Authentication > OIDC Configuration**
2. Select **Okta** from the provider presets
3. Enter your **Okta Domain** (e.g., `your-org.okta.com`) -- the issuer URL is auto-populated
4. Enter your **Client ID** and **Client Secret**
5. Set **Groups Claim** to `groups`
6. Click **Save**
7. Click **Test Connection** to verify

### Option B: Via Environment Variables

```bash
OIDC_ISSUER=https://your-org.okta.com
OIDC_CLIENT_ID=<your-client-id>
OIDC_CLIENT_SECRET=<your-client-secret>
OIDC_REDIRECT_URL=https://argus.yourdomain.com/api/auth/oidc/callback
```

### Option C: Via Helm Values

```yaml
oidc:
  enabled: true
  issuerURL: "https://your-org.okta.com"
  clientID: "<your-client-id>"
  clientSecret: "<your-client-secret>"
  redirectURL: "https://argus.yourdomain.com/api/auth/oidc/callback"
  groupsClaim: "groups"
```

## Group-to-Role Mapping

After configuring OIDC, map Okta groups to Argus RBAC roles:

1. Go to **Settings > Authentication > Group Mappings**
2. Click **Add Mapping**
3. Enter the Okta group name (e.g., `k8s-admins`)
4. Select the Argus role to assign
5. Optionally scope to a specific cluster or namespace

## Troubleshooting

- **"The 'redirect_uri' parameter must be an absolute URI"** -- Ensure the redirect URI includes the full protocol and path.
- **"User is not assigned to the client application"** -- Go to the application's **Assignments** tab and add the user or their group.
- **Groups not in token** -- Verify the groups claim is added to the authorization server (Step 3). Test with Okta's token preview tool.
- **Custom authorization server** -- If you use a custom authorization server, the issuer URL includes the server ID: `https://your-org.okta.com/oauth2/<server-id>`.
