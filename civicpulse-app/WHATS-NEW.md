# Four additions

Apply, then:

    cd server && npm install && npm run setup && npm run dev
    cd client-ui && npm install && npm run dev

`npm run setup` is required — it adds the verification table and the new columns.
It is safe to re-run; nothing existing is touched.

## 1. Community verification

A resident can now say whether an issue is actually there. Separate from backing it:
backing says "this matters to me", verifying says "I have seen it with my own eyes".

- New `issue_verifications` table, primary key `(issue_id, user_id)` — one verdict each.
- A trigger keeps `issues.confirmations` and `issues.disputes` in step.
- You cannot verify your own report; the server returns 403.
- Changing your mind updates the existing row rather than adding another.
- The issue detail modal shows a trust percentage and both counts.
- The admin table has a **Verified** column: green above 60%, amber 40–60%, red below.

`POST /api/issues/:id/verify` with `{"verdict":"confirm"}` or `"dispute"`.
`DELETE /api/issues/:id/verify` withdraws it.

## 2. Geotag check on photos

The upload now reads the photo's EXIF GPS tag, in the browser and again on the server.

If the photo carries one, the form shows where the picture was actually taken and how
far that is from the pin, with a button to move the pin onto the photo's own location.
The server stores `exif_lat`, `exif_lng` and `exif_drift_m`, and sets `geo_source` to
`exif` when the two agree within 100 m.

**Files without a geotag are still accepted, deliberately.** A photo taken through the
browser's camera has no EXIF at all, and WhatsApp and most gallery apps strip it. Rejecting
those would reject most honest reports. EXIF is also editable, so it is treated as
corroboration rather than proof — the device GPS captured at submission time is the
primary signal, and the two together are stronger than either alone.

## 3. Video evidence

The upload accepts video as well as stills, up to 40 MB. `issues.media_type` records
which it is, and both the form preview and the admin thumbnail render video correctly.
EXIF reading is skipped for video.

## 4. The selected category is shown

The report form now displays a "Filing under" strip above the map showing the chosen
category, the severity, and the points it contributes before any backing.
