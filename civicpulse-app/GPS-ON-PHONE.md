# GPS on the phone without a tunnel

Cloudflare and ngrok are both blocked on your network. This route needs neither — the
laptop serves the app over HTTPS itself, using a self-signed certificate.

## Setup

    cd client-ui
    npm install                 # picks up two new dev dependencies

## Run

    # terminal 1
    cd server && npm run dev

    # terminal 2
    cd client-ui && npm run dev:https

Vite now prints something like:

    ➜  Local:   https://localhost:5173/
    ➜  Network: https://192.168.1.57:5173/

Note the **https**, and use the Network address on the phone. The phone must be on the
same wifi as the laptop.

## The certificate warning

The certificate is self-signed, so the phone does not trust it and shows a full-page
warning the first time.

**Chrome on Android:** tap *Advanced* → *Proceed to 192.168.1.57 (unsafe)*
**Safari on iPhone:** tap *Show Details* → *visit this website* → *Visit Website*

Once through, the origin counts as secure and **geolocation works**. That is the whole
point — a browser will not hand out GPS on plain http, no matter how you ask.

You only accept the warning once per browser.

## What works and what does not

| | |
|---|---|
| GPS / blue dot | ✅ works |
| Camera and gallery upload | ✅ works |
| Reports, map, verification, directions | ✅ works |
| Google sign-in | ❌ Google will not accept a self-signed origin — use email |
| Installing as an app | ⚠️ Chrome usually refuses on an untrusted certificate |

For a demo that needs Google sign-in or home-screen install, you still need a real
tunnel. For proving GPS and the geotag rules on a phone, this is enough.

## If the laptop's IP changes

It will, on a different network. Run `ipconfig` and look for IPv4 Address under your
wifi adapter, or just read the Network line Vite prints.

## Windows firewall

The first run may pop a firewall prompt. Allow it for **private networks**, or the phone
cannot reach port 5173.

## Back to normal

    npm run dev

Plain http on localhost, exactly as before. Nothing about the https mode is permanent.
