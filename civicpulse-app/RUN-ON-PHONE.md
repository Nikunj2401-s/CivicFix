# Running CivicFix on a phone

## Why a tunnel is needed

Two things break if you just type your laptop's IP into the phone:

- **GPS is refused.** Browsers only hand out location on `https://` or `localhost`.
  A LAN address like `http://192.168.1.5:5173` is neither, so `navigator.geolocation`
  stays silent and the report form never gets a fix.
- **Google sign-in is refused** for the same reason.

A tunnel gives you a real HTTPS address pointing at your laptop, which fixes both.

## Cloudflare tunnel — free, no account

Download `cloudflared` from
https://github.com/cloudflare/cloudflared/releases (the `windows-amd64.exe`), put it
somewhere on your PATH, then:

    # terminal 1
    cd server && npm run dev

    # terminal 2
    cd client-ui && npm run dev

    # terminal 3
    cloudflared tunnel --url http://localhost:5173

The third prints a URL like `https://random-words-here.trycloudflare.com`. Open that on
the phone. The API works too, because Vite proxies `/api` and `/uploads` through the same
port the tunnel forwards.

**The URL changes every restart.** Fine for a demo; annoying for Google sign-in, see below.

## ngrok — steadier URL, needs a free account

    ngrok http 5173

A free account gets you one permanent subdomain, which saves re-registering the address
with Google every time:

    ngrok http --domain=your-name.ngrok-free.app 5173

## Google sign-in through a tunnel

The tunnel's address has to be registered, or Google refuses:

1. Google Cloud Console → Credentials → your OAuth client
2. Add the full `https://...` tunnel URL under **Authorised JavaScript origins**
3. Save, then wait a minute for it to take effect

With Cloudflare's changing URLs this means editing the origin each session. ngrok's fixed
domain avoids that, which is why it is worth the signup if you are demoing on a phone.

If it becomes a nuisance, delete `VITE_GOOGLE_CLIENT_ID` from `client-ui/.env` and use
email sign-in on the phone. Everything else works identically.

## Photos on a phone — this part matters

The evidence rules require a photo carrying a GPS tag. On a phone the file picker offers
two routes and they behave very differently:

- **"Camera" / "Take photo"** — captured inside the browser. **No EXIF at all.** The
  report will be refused.
- **"Gallery" / "Files"** — a photo already taken by the phone's camera app. **Keeps its
  GPS tag**, as long as location was enabled for the camera when it was taken.

So the working flow on a phone is: take the picture and the clip in the normal camera app
first, then open CivicFix and attach them from the gallery.

Enable it beforehand: Settings → Apps → Camera → Permissions → Location → Allow.
On iPhone: Settings → Privacy & Security → Location Services → Camera → While Using.

## Test before the demo, in this order

1. Tunnel URL opens on the phone
2. Sign in (email at minimum)
3. The map shows your blue dot — proves GPS is working over HTTPS
4. Take a photo and a short video in the camera app
5. File a report, attaching both from the gallery
6. Check it appears on the laptop's map

If step 3 fails, the tunnel is not HTTPS or the permission was denied — check the padlock
in the phone's address bar.

## Have this fallback ready

If venue wifi blocks the tunnel, run the whole demo on the laptop at `localhost:5173` and
transfer phone photos over a cable. The geotag rules still work, because the tag travels
with the file.
