# Phone mode

## One-time

    cd client-ui
    npm install

In `server/.env`, set:

    REQUIRE_GEOTAG=false
    REQUIRE_VIDEO=false

Android strips EXIF location from photos picked through a browser, so a web app cannot
require a geotag and still work on a phone. Device GPS at the moment of filing is the
primary signal instead — arguably the better one, since it is captured live rather than
read from a file anyone could edit.

## Every time

    # terminal 1
    cd server && npm run dev

    # terminal 2
    cd client-ui && npm run dev:phone

Vite prints an **https** address. Use the one matching your Wi-Fi adapter — check with
`ipconfig` and look under "Wireless LAN adapter Wi-Fi". Yours was `10.9.57.50`, so:

    https://10.9.57.50:5173/

Phone must be on the same wifi.

## On the phone

1. Open that address
2. Certificate warning → **Advanced** → **Proceed anyway** (once per browser)
3. Allow location when asked
4. Sign in with an email account
5. Chrome menu → **Add to Home screen** to install it

Then it launches from an icon, full screen, no browser bar.

## What works

Everything: GPS and the blue dot, photo and video upload, the duplicate check, the GIS
land check, community verification, status tracking, directions.

Google sign-in will not work over a self-signed certificate — use email on the phone.

## If the page will not load

- **Windows Firewall.** In an admin PowerShell:
  `New-NetFirewallRule -DisplayName "Vite 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow`
- **Client isolation.** Campus and hotel wifi often stop devices talking to each other.
  Put the laptop on your phone's hotspot instead, then re-check `ipconfig` for the new IP.

## The real answer, for after tomorrow

For a genuinely downloadable app where the geotag requirement can be enforced:

1. **Deploy the server** — Render or Railway, with their managed Postgres, and Cloudinary
   for uploads since a hosted filesystem is wiped on restart.
2. **Wrap the client with Capacitor** — same React code, native shell, produces an `.apk`:

       npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/camera
       npx cap init CivicFix com.civicfix.app
       npm run build && npx cap add android && npx cap sync
       npx cap open android

Capacitor's camera plugin captures the photo inside the app, so the app stamps the
coordinate itself and the EXIF problem disappears entirely. That is the proper fix, and it
needs Android Studio and a few unhurried hours.
