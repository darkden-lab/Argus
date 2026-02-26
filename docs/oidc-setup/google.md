# Google OIDC Setup

This guide walks through configuring Google as an OIDC provider for Argus.

## Prerequisites

- A Google Cloud project
- Access to the Google Cloud Console

## Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com) > **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the **OAuth consent screen** first:
   - User Type: **Internal** (for organization only) or **External**
   - App name: `Argus Dashboard`
   - User support email: your email
   - Authorized domains: `yourdomain.com`
   - Click **Save and Continue**
   - Scopes: Add `openid`, `email`, `profile`
   - Click **Save and Continue**

4. Back in **Credentials** > **Create OAuth client ID**:
   - Application type: **Web application**
   - Name: `Argus Dashboard`
   - Authorized redirect URIs: Add:
     ```
     https://argus.yourdomain.com/api/auth/oidc/callback
     ```
   - Click **Create**

5. **Copy the Client ID and Client Secret** from the dialog

## Step 2: Note Your Configuration Values

| Value | Description |
|-------|-------------|
| Issuer URL | `https://accounts.google.com` |
| Client ID | From the OAuth client credentials |
| Client Secret | From the OAuth client credentials |

## Step 3: Configure Argus

### Option A: Via Dashboard UI

1. Go to **Settings > Authentication > OIDC Configuration**
2. Select **Google** from the provider presets
3. Enter your **Client ID** and **Client Secret**
4. The issuer URL (`https://accounts.google.com`) and redirect URL are auto-filled
5. Click **Save**
6. Click **Test Connection** to verify

### Option B: Via Environment Variables

```bash
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
OIDC_CLIENT_SECRET=<your-client-secret>
OIDC_REDIRECT_URL=https://argus.yourdomain.com/api/auth/oidc/callback
```

### Option C: Via Helm Values

```yaml
oidc:
  enabled: true
  issuerURL: "https://accounts.google.com"
  clientID: "<your-client-id>.apps.googleusercontent.com"
  clientSecret: "<your-client-secret>"
  redirectURL: "https://argus.yourdomain.com/api/auth/oidc/callback"
```

## Limitations

- Google OIDC does not provide a `groups` claim in the ID token by default. Group-based RBAC mapping is not available without additional setup via Google Workspace Admin SDK.
- For group-based access control, consider using Google Workspace and configuring a custom claim, or assign roles manually per user in Argus.

## Troubleshooting

- **"Error 400: redirect_uri_mismatch"** -- The redirect URI in your OAuth client must exactly match `https://argus.yourdomain.com/api/auth/oidc/callback`. Check for trailing slashes or protocol mismatches.
- **"Error 403: access_denied"** -- If using an Internal OAuth consent screen, only users in your Google Workspace organization can sign in.
- **"Error: invalid_client"** -- Verify the Client ID and Client Secret are correct.
