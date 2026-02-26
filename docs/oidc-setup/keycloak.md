# Keycloak OIDC Setup

This guide walks through configuring Keycloak as an OIDC provider for Argus.

## Prerequisites

- A running Keycloak instance
- Admin access to the Keycloak Admin Console

## Step 1: Create a Client

1. Go to **Keycloak Admin Console** > Select your **Realm** (or create one)
2. Go to **Clients** > **Create client**
3. Configure:
   - **Client type**: OpenID Connect
   - **Client ID**: `argus-dashboard`
4. Click **Next**
5. **Client authentication**: ON (enables confidential access type)
6. **Authorization**: OFF
7. Click **Next**
8. **Valid redirect URIs**:
   ```
   https://argus.yourdomain.com/api/auth/oidc/callback
   ```
9. **Web origins**: `https://argus.yourdomain.com`
10. Click **Save**

## Step 2: Get Client Secret

1. Go to **Clients** > `argus-dashboard` > **Credentials** tab
2. Copy the **Client secret**

## Step 3: Configure Groups Claim

By default, Keycloak does not include groups in the ID token. Add a mapper:

1. Go to **Clients** > `argus-dashboard` > **Client scopes** tab
2. Click `argus-dashboard-dedicated`
3. Click **Add mapper** > **By configuration** > **Group Membership**
4. Configure:
   - **Name**: `groups`
   - **Token Claim Name**: `groups`
   - **Full group path**: OFF (recommended, sends just the group name)
   - **Add to ID token**: ON
   - **Add to access token**: ON
5. Click **Save**

## Step 4: Create Groups and Assign Users

1. Go to **Groups** > **Create group**
2. Create groups like `k8s-admins`, `k8s-viewers`
3. Go to **Users** > Select a user > **Groups** tab > **Join group**

## Step 5: Note Your Configuration Values

| Value | Where to Find |
|-------|---------------|
| Keycloak Host | Your Keycloak URL (e.g., `https://keycloak.yourdomain.com`) |
| Realm | The realm name |
| Client ID | `argus-dashboard` |
| Client Secret | Clients > argus-dashboard > Credentials |

The issuer URL for Keycloak is:
```
https://keycloak.yourdomain.com/realms/<realm-name>
```

## Step 6: Configure Argus

### Option A: Via Dashboard UI

1. Go to **Settings > Authentication > OIDC Configuration**
2. Select **Keycloak** from the provider presets
3. Enter your **Keycloak Host** and **Realm** -- the issuer URL is auto-populated
4. Enter your **Client ID** (`argus-dashboard`) and **Client Secret**
5. Set **Groups Claim** to `groups`
6. Click **Save**
7. Click **Test Connection** to verify

### Option B: Via Environment Variables

```bash
OIDC_ISSUER=https://keycloak.yourdomain.com/realms/my-realm
OIDC_CLIENT_ID=argus-dashboard
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URL=https://argus.yourdomain.com/api/auth/oidc/callback
```

### Option C: Via Helm Values

```yaml
oidc:
  enabled: true
  issuerURL: "https://keycloak.yourdomain.com/realms/my-realm"
  clientID: "argus-dashboard"
  clientSecret: "<client-secret>"
  redirectURL: "https://argus.yourdomain.com/api/auth/oidc/callback"
  groupsClaim: "groups"
```

## Group-to-Role Mapping

After configuring OIDC, map Keycloak groups to Argus RBAC roles:

1. Go to **Settings > Authentication > Group Mappings**
2. Click **Add Mapping**
3. Enter the Keycloak group name (e.g., `k8s-admins`)
4. Select the Argus role to assign
5. Optionally scope to a specific cluster or namespace

## Troubleshooting

- **"Client not found"** -- Verify the Client ID matches exactly and the client is in the correct realm.
- **"Invalid redirect uri"** -- The redirect URI must match exactly, including protocol and path. Check for trailing slashes.
- **Groups not in token** -- Verify the Group Membership mapper is added to the client scope and "Add to ID token" is enabled.
- **"Full group path" issues** -- If group names include slashes (e.g., `/my-org/k8s-admins`), disable "Full group path" in the mapper to get just the group name.
- **HTTPS issues with self-signed certs** -- If Keycloak uses a self-signed certificate, the backend may fail OIDC discovery. Add the CA certificate to the system trust store or use a valid certificate.
