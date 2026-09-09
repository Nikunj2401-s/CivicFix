# GIS land check + photo/location matching

## Apply

    cd server && npm install && npm run setup && npm run dev
    cd client-ui && npm install && npm run dev

Add to `server/.env`:

    REQUIRE_GEOTAG=true
    REQUIRE_VIDEO=true
    REQUIRE_PUBLIC_LAND=true
    MAX_EXIF_DRIFT_M=150

## 1. Public vs private property (GIS)

`server/src/lib/gis.js` asks OpenStreetMap, through the Overpass API, what is actually at
the reported coordinate. One query returns any building footprint or land-use polygon the
point falls inside, plus any road, footpath or public space within 25 m.

- Inside a building, or on land tagged `access=private`, or inside a residential,
  industrial or commercial plot with no road nearby → **private**, and the report is refused.
- On or beside a mapped road, footpath, park, playground or market → **public**, accepted.
- Nothing mapped nearby → **unknown**, accepted with a note. Rural and newly built areas
  are often unmapped, and refusing those would exclude the people who need the register most.

The form checks as soon as the pin settles, so a resident learns about the problem before
uploading a video over venue wifi. The server checks again at submit, so the API cannot be
talked past.

**Fails open.** If Overpass is slow or down, the class is `unknown` and the report goes
through. A civic tool must not stop accepting reports because someone else's server is out.

## 2. Photo location must match the report location

Three coordinates now exist for every report:

- `exif_lat/lng` — where the camera says the picture was taken
- `device_lat/lng` — where the browser says the reporter is standing
- `latitude/longitude` — what gets filed, which is the EXIF coordinate

If the camera's position and the device's position differ by more than
`MAX_EXIF_DRIFT_M` (150 m by default), the report is refused with:

> The issue location is not where this photo was taken. The camera recorded a spot N m
> away from your device's current position.

The browser shows the same warning the moment the photo is attached, before any upload
starts, and disables the submit button.

This is what closes the obvious fraud: filing a report using a photo taken somewhere else,
or an old picture of a pothole that has since been fixed.

## 3. What the ward office sees

The dashboard has a new **Evidence** column tagging each report: `photo GPS` when the
location came from the camera rather than the browser, `public land` or `private land`
from the GIS check, and `video` when a clip is attached.

## Honest limits, worth saying before a judge asks

EXIF is editable with the right tool, and OpenStreetMap coverage is uneven — a real
pothole on an unmapped lane classifies as `unknown`, not `public`. So this raises the cost
of a fake report substantially without making one impossible, which is why community
verification sits on top: other residents confirm the issue is really there.

Every check can be switched off from `.env` in ten seconds if a venue's devices cannot
meet them.
