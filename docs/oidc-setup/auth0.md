# Auth0 OIDC Setup

This guide walks through configuring Auth0 as an OIDC provider for Argus.

## Prerequisites

- An Auth0 account
- Access to the Auth0 Dashboard

## Step 1: Create an Application

1. Go to [Auth0 Dashboard](https://manage.auth0.com) > **Applications** > **Applications**
2. Click **Create Application**
3. Configure:
   - **Name**: `Argus Dashboard`
   - **Application Type**: Regular Web Application
4. Click **Create**

## Step 2: Configure Application Settings

1. In the application's **Settings** tab:
   - **Allowed Callback URLs**:
     ```
     https://argus.yourdomain.com/api/auth/oidc/callback
     ```
   - **Allowed Logout URLs** (optional):
     ```
     https://argus.yourdomain.com/login
     ```
   - **Allowed Web Origins**:
     ```
     https://argus.yourdomain.com
     ```
2. Scroll down and click **Save Changes**

## Step 3: Note Your Configuration Values

From the application's **Settings** tab:

| Value | Where to Find |
|-------|---------------|
| Domain | Settings > Domain (e.g., `your-tenant.auth0.com`) |
| Client ID | Settings > Client ID |
| Client Secret | Settings > Client Secret |

The issuer URL for Auth0 is:
```
https://your-tenant.auth0.com/
```

> **Note:** The trailing slash is required for Auth0 issuer URLs.

## Step 4: Configure Groups (Optional)

Auth0 does not include groups in the ID token by default. To add them:

### Option A: Using Auth0 Organizations

1. Go to **Organizations** in the Auth0 Dashboard
2. Create organizations and assign members with roles
3. Enable organizations for your application in **Settings** > **Organizations**

### Option B: Using an Action (Login Flow)

1. Go to **Actions** > **Flows** > **Login**
2. Click **Add Action** > **Build Custom**
3. Name: `Add Groups Claim`
4. Add this code:

   ```javascript
   exports.onExecutePostLogin = async (event, api) => {
     const roles = event.authorization?.roles || [];
     if (roles.length > 0) {
       api.idToken.setCustomClaim('groups', roles);
     }
   };
   ```

5. Click **Deploy**, then drag the action into the Login flow

### Option C: Using Auth0 Roles

1. Go to **User Management** > **Roles**
2. Create roles (e.g., `k8s-admins`, `k8s-viewers`)
3. Assign roles to users
4. Use the Action above to include roles as a groups claim

## Step 5: Configure Argus

### Option A: Via Dashboard UI

1. Go to **Settings > Authentication > OIDC Configuration**
2. Select **Auth0** from the provider presets
3. Enter your **Auth0 Domain** (e.g., `your-tenant.auth0.com`) -- the issuer URL is auto-populated
4. Enter your **Client ID** and **Client Secret**
5. Set **Groups Claim** to `groups` (if you configured the Action)
6. Click **Save**
7. Click **Test Connection** to verify

### Option B: Via Environment Variables

```bash
OIDC_ISSUER=https://your-tenant.auth0.com/
OIDC_CLIENT_ID=<your-client-id>
OIDC_CLIENT_SECRET=<your-client-secret>
OIDC_REDIRECT_URL=https://argus.yourdomain.com/api/auth/oidc/callback
```

### Option C: Via Helm Values

```yaml
oidc:
  enabled: true
  issuerURL: "https://your-tenant.auth0.com/"
  clientID: "<your-client-id>"
  clientSecret: "<your-client-secret>"
  redirectURL: "https://argus.yourdomain.com/api/auth/oidc/callback"
  groupsClaim: "groups"
```

## Group-to-Role Mapping

After configuring OIDC and the groups claim, map Auth0 roles to Argus RBAC roles:

1. Go to **Settings > Authentication > Group Mappings**
2. Click **Add Mapping**
3. Enter the Auth0 role name (e.g., `k8s-admins`)
4. Select the Argus role to assign
5. Optionally scope to a specific cluster or namespace

## Troubleshooting

- **"Callback URL mismatch"** -- The callback URL must match exactly what is configured in Auth0. Check for protocol (http vs https) and trailing slash differences.
- **"Unauthorized client"** -- Verify the Client ID and Client Secret are from the correct application.
- **Groups not in token** -- Ensure the Login Action is deployed and active in the Login flow.
- **Auth0 issuer URL** -- Auth0 issuer URLs must include the trailing slash: `https://your-tenant.auth0.com/` (not without the slash).
- **Custom domains** -- If you use a custom domain with Auth0, update the issuer URL to use your custom domain: `https://auth.yourdomain.com/`.
