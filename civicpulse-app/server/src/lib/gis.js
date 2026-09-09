/**
 * Land-use classification from OpenStreetMap.
 *
 * A civic register is for public space — roads, footpaths, parks, drains. A pothole
 * inside someone's compound is not the ward office's to fix, and a report pinned on a
 * private plot is either a mistake or an attempt to aim municipal attention at a
 * neighbour. This asks OSM what is actually at the coordinate.
 *
 * Two questions go to Overpass in one request:
 *   1. Is the point inside a building or a plot tagged as private?
 *   2. Is there a road, footpath or public feature within 25 m?
 *
 * The service is public and occasionally slow, so every failure path returns
 * 'unknown' rather than blocking a report. A civic tool must not stop working
 * because someone else's server is down.
 */

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const NEAR_M = 25;
const TIMEOUT_MS = 6000;

const PUBLIC_HIGHWAY = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'residential', 'service', 'living_street', 'pedestrian', 'footway',
  'path', 'cycleway', 'steps', 'track'
]);

const PUBLIC_SPACE = new Set([
  'park', 'garden', 'playground', 'pitch', 'recreation_ground', 'common',
  'village_green', 'cemetery', 'school', 'hospital', 'marketplace'
]);

export async function classifyLand(latitude, longitude) {
  const query = `
    [out:json][timeout:5];
    (
      is_in(${latitude},${longitude})->.here;
      way(pivot.here)["building"];
      way(pivot.here)["landuse"];
      way(pivot.here)["access"];
      way(around:${NEAR_M},${latitude},${longitude})["highway"];
      way(around:${NEAR_M},${latitude},${longitude})["leisure"];
      way(around:${NEAR_M},${latitude},${longitude})["amenity"];
    );
    out tags;`;

  let elements;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'text/plain' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`overpass ${response.status}`);
    elements = (await response.json()).elements || [];
  } catch {
    return { land_class: 'unknown', land_note: 'Land-use data was unavailable, so the location could not be checked.' };
  }

  const tags = elements.map((element) => element.tags || {});

  const building = tags.find((t) => t.building);
  const publicBuilding = building &&
    ['school', 'hospital', 'civic', 'government', 'public', 'train_station', 'toilets'].includes(building.building);
  if (building && !publicBuilding) {
    return {
      land_class: 'private',
      land_note: `The pin sits inside a building${building.name ? ` (${building.name})` : ''}. Civic reports must be about public space.`
    };
  }

  const road = tags.find((t) => t.highway && PUBLIC_HIGHWAY.has(t.highway));
  const openSpace = tags.find((t) => PUBLIC_SPACE.has(t.leisure) || PUBLIC_SPACE.has(t.amenity));
  const closedAccess = tags.find((t) => ['private', 'no'].includes(t.access) && !t.highway);
  const closedLanduse = tags.find((t) =>
    ['residential', 'industrial', 'commercial', 'retail', 'farmyard', 'military'].includes(t.landuse) && !t.highway);

  if (road) {
    return {
      land_class: 'public',
      land_note: `Public road within ${NEAR_M} m${road.name ? `: ${road.name}` : ` (${road.highway})`}.`
    };
  }
  if (openSpace) return { land_class: 'public', land_note: 'Public open space at this location.' };
  if (closedAccess) return { land_class: 'private', land_note: 'This land is tagged as private access in OpenStreetMap.' };
  if (closedLanduse) {
    return {
      land_class: 'private',
      land_note: `The pin sits inside a ${closedLanduse.landuse} plot with no public road nearby.`
    };
  }

  return { land_class: 'unknown', land_note: `No mapped road or public space within ${NEAR_M} m of the pin.` };
}
