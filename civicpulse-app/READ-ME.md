# The form now follows the server's rules

Apply, restart both. No database change.

## What was wrong

`REQUIRE_GEOTAG=false` in `.env` only ever told the *server* to stop enforcing it. The
browser had the same rule written into it separately, so the submit button stayed disabled
however the server was configured. Two copies of one rule, and only one of them listened.

There is now a single source of truth. `GET /api/issues/policy` returns what the server
will actually enforce, and the form reads it on load:

    { require_geotag, require_video, require_public_land,
      max_photo_age_hours, max_exif_drift_m, dupe_radius_m }

The checklist, the field labels and the submit button all follow it. Turning a rule off in
`.env` now visibly turns it off in the interface.

## To accept photos without a location tag

`server/.env`:

    REQUIRE_GEOTAG=false

Restart the server, reload the page. The photo field stops saying "geotagged", the
checklist item becomes just "Photo", and an untagged photo is accepted with a note
explaining the report will use device GPS instead.

Same for `REQUIRE_VIDEO=false` — the video field is then labelled optional and drops out
of the checklist.

## Why you could not make it work on Android

Chrome on Android removes EXIF location from any photo picked through a file input. It is
a privacy measure and there is no way around it from a web page: the phone's copy has the
tag, the copy the browser hands the site does not.

So on a phone the geotag rule cannot be satisfied at all. It works from a computer, where
the file is passed through untouched.

This is worth saying out loud rather than hiding:

> Android strips EXIF location from browser uploads for privacy, so a web app cannot rely
> on it. We capture device GPS at submission as the primary signal and read EXIF as
> corroboration where the platform allows it. A native wrapper would let the app stamp the
> coordinate itself, which is the proper fix.

That answer shows you tested on real devices. Most teams never find this.
