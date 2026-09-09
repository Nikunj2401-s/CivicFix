# CivicFix — new UI (client-ui)

This is the Replit-designed frontend, rewired to your real Express + PostgreSQL API.
It sits **beside** your existing `client/` folder. Nothing about the old one changed,
so you always have a working fallback.

## Run it

```bash
# terminal 1 — the API, exactly as before
cd server
npm run dev

# terminal 2 — the new UI
cd client-ui
npm install
npm run dev
```

Open http://localhost:5173 (use `localhost`, not a LAN IP, or the browser withholds GPS).
To go back to the old UI, just run `npm run dev` in `client/` instead.

## What changed from the Replit export

`src/App.jsx` is almost untouched — 8 small edits. Everything else was done in
`src/lib/api.js`, which keeps the same exported function names the UI already called
but sends real requests instead of returning mock data.

The 8 edits:

1. Import `isAuthed` and `signOut`.
2. Sign-in actually sends the password and shows server errors (the mock ignored it).
3. The duplicate check passes the category, so it runs as a SQL query on the server
   rather than a filter in the browser.
4. Added a `Protected` wrapper — every page redirects to `/auth` without a token.
5. Added a `/sign-out` route that clears the token.
6. "Ward office" only appears in the sidebar for admin accounts.
7. The shell no longer shows a hardcoded name before `/auth/me` answers.
8. The ward card shows the real role instead of "Ward 154 · Shivajinagar".

## Things worth knowing

- **Photos.** The form produces a base64 data URL; `createIssue` converts it to a Blob
  and posts multipart `FormData`, because the API expects a file for Multer.
- **Duplicates.** `findNearbyIssues` calls `POST /api/issues/check-duplicate`, which does
  the bounding-box plus great-circle check in SQL against open reports in the same category.
- **Ids.** The mock used `CF-1048`; the database uses integers. The UI falls back to
  showing coordinates where it used to show a hardcoded street name.
- **Admin.** Status changes require an admin token. Sign in with your admin account or
  the dropdowns return 403.

Rate limiting, the 50 m rule and the priority formula all still live on the server, so
this UI cannot bypass any of them.
