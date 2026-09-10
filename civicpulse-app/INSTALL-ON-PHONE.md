# CivicFix as a phone app

The app is now installable. It gets its own icon on the home screen, opens full screen
with no browser bar, keeps working when the connection drops, and respects the notch and
home indicator. On Android it also gets long-press shortcuts straight to Report and Map.

## Run it

    cd server && npm run dev
    cd client-ui && npm run dev
    npx cloudflared tunnel --url http://localhost:5173

Open the printed `https://...trycloudflare.com` address on the phone. HTTPS is required —
without it the browser will not offer installation, and will not give the app GPS.

## Install it

**Android / Chrome** — a banner appears offering to install. If it does not, use the
three-dot menu → *Install app* or *Add to Home screen*.

**iPhone / Safari** — Share button → *Add to Home Screen*. Note that iOS only offers this
in Safari, not Chrome.

Launch it from the icon. No address bar, no tabs. It looks like an app because at that
point it is one.

## What is cached, and what deliberately is not

The shell — the HTML, the icons, the JavaScript — is cached, so it opens instantly and
does not show a browser error when the signal drops.

**Reports are never cached.** A civic register showing yesterday's issues as if they were
current would be worse than showing nothing, so anything under `/api` always goes to the
network. Same for photos and video, which are far too large to keep.

## Photos, on a phone

The evidence rule needs a GPS tag in the photo. In the file picker:

- **Camera / Take photo** → captured in the browser, **no EXIF**, report refused
- **Gallery / Files** → taken by the phone's camera app, **keeps its GPS tag**

So: take the photo and clip in the normal camera app first, then attach from the gallery.
Turn on location for the camera beforehand — Android: Settings → Apps → Camera →
Permissions → Location. iPhone: Settings → Privacy → Location Services → Camera.

## Turning this into a real APK, after the hackathon

A PWA covers everything except a file you can hand someone. For an actual installable
`.apk`, Capacitor wraps this same React code in a native shell:

    npm install @capacitor/core @capacitor/cli
    npx cap init CivicFix com.civicfix.app
    npm install @capacitor/android
    npm run build
    npx cap add android
    npx cap sync
    npx cap open android        # builds the APK in Android Studio

You need Android Studio and a JDK — several gigabytes and a few hours the first time,
which is why it is a job for after the deadline, not before it. The payoff is the native
camera and GPS plugins, which sidestep the EXIF problem entirely: a photo captured through
Capacitor's camera can be tagged by the app itself.

## Worth saying to a judge

"It installs to the home screen and runs offline-capable from a service worker. The same
codebase wraps to a native APK with Capacitor when we need store distribution — we kept it
a web app because a civic tool should not require anyone to download anything to file a
report."
