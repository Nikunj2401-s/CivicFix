# Google sign-in

## Apply the code

    cd server && npm install && npm run setup && npm run dev
    cd client-ui && npm run dev

Until a client ID is configured, the Google button simply does not render and email
sign-in works exactly as before. Nothing breaks while you set this up.

## Get a client ID (about ten minutes, only you can do this)

1. Go to https://console.cloud.google.com/ and create a project — call it CivicFix.
2. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: CivicFix. Add your email as support and developer contact.
   - Scopes: leave the defaults, you only need email and profile.
   - Test users: add every Google account that will sign in during the demo.
     While the app is unpublished, only these accounts can log in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: Web application
   - **Authorised JavaScript origins:** `http://localhost:5173`
   - Leave redirect URIs empty; the button uses the token flow, not a redirect.
4. Copy the client ID. It looks like `1234567890-abc123.apps.googleusercontent.com`.

## Configure both halves

`client-ui/.env` — create it:

    VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com

`server/.env` — add the same value:

    GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com

Restart both dev servers. Vite only reads `.env` at startup.

## How it works

The browser gets an ID token from Google and posts it to `/api/auth/google`. The server
verifies that token against Google's public keys with `google-auth-library` — it does not
trust anything the page claims. Only then does it find or create the user and issue our
own JWT, exactly like a password login. From that point the app cannot tell the two apart.

A returning user who first signed up with a password and later uses Google with the same
address gets linked to their existing account rather than a duplicate.

## The admin account is deliberately excluded

`admin@city.gov` cannot sign in through Google — the endpoint refuses that address with
403. The ward office signs in with its password only.

The reason is worth stating if asked: role is decided by our database, never by the
identity provider. Anyone who owns a Google address gets a resident account and nothing
more. Administrative access is granted deliberately, by whoever runs `npm run setup`.

## If it fails during the demo

Delete `VITE_GOOGLE_CLIENT_ID` from `client-ui/.env` and restart. The button disappears
and email sign-in carries the demo. Have one email account ready as a fallback either way —
Google's consent screen occasionally asks for extra confirmation on an unpublished app.

## Also in this build

Every invented location string is gone — no ward number, no city name anywhere in the
interface.
