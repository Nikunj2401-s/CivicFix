# "Failed to fetch" on sign in

Apply, then work through this in order. Do not skip steps — each one rules out a cause.

## 1. Is the server actually up?

    cd server
    npm run doctor

New command. It checks the environment variables, the database connection, every table
and column the app needs, and whether an admin account exists — and tells you the fix for
anything that fails.

Then:

    npm run dev

You want `CivicFix API on http://localhost:4000`. Leave it running.

Open http://localhost:4000/api/health in a browser. `{"ok":true}` means the server is fine
and the problem is on the client side.

## 2. Are you on the right client mode?

There are two, and mixing them up produces exactly this error:

    npm run dev         → http://localhost:5173     ← use this on the laptop
    npm run dev:phone   → https://10.x.x.x:5173     ← only for a phone

If you started `dev:phone` and then opened `http://localhost:5173`, nothing is listening
there. Use the address Vite actually prints.

## 3. Clear the stale service worker

This is the likely culprit, and it was my mistake.

The offline cache I added stores the JavaScript bundle. In development that means the
browser keeps running an old version of the app no matter how many times you fix the code
— including old versions with bugs I have already fixed. It also makes it impossible to
tell which version you are looking at.

`main.jsx` now registers the worker **only in a production build**, and actively unregisters
any worker left over from before, clearing its caches on the way.

To clear what is already on your machine:

**Laptop:** F12 → Application → Service Workers → Unregister → then Application → Storage →
Clear site data → reload.

**Phone:** padlock in the address bar → Site settings → Clear & reset → reload.

Or open the site in an incognito window, which never had a worker in the first place.

## 4. Reinstall if you switched branches

Checking out `main` deleted `client-ui/node_modules` and checking back out restored part of
it, which can leave the folder inconsistent:

    cd client-ui
    npm install

## What "Failed to fetch" actually means

The browser could not reach the server at all — no response, no status code. So it is
always one of: the server is not running, the client is on a different address than you
think, or a cached bundle is calling somewhere stale. Never a bug in the sign-in logic
itself, which is why the steps above are ordered the way they are.
