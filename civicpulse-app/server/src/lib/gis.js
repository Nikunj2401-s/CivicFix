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

/* Overpass is often blocked on campus and corporate networks, and its public instances
   rate-limit. Try each in turn, then fall back to Nominatim, which answers a coarser
   question but is reachable far more often. */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const NEAR_M = 25;
const TIMEOUT_MS = 3500;          // a report must not wait on someone else's server
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();          // coarse coordinate -> verdict, so dragging a pin is cheap

const PUBLIC_HIGHWAY = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'residential', 'service', 'living_street', 'pedestrian', 'footway',
  'path', 'cycleway', 'steps', 'track'
]);

const PUBLIC_SPACE = new Set([
  'park', 'garden', 'playground', 'pitch', 'recreation_ground', 'common',
  'village_green', 'cemetery', 'school', 'hospital', 'marketplace'
]);

/**
 * Reverse geocoding as a second opinion. Nominatim will not tell us about building
 * footprints, but it does say whether the nearest mapped thing is a road — which answers
 * the question that actually matters most of the time.
 */
async function coarseCheck(latitude, longitude) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const url = `${NOMINATIM}?format=json&zoom=18&lat=${latitude}&lon=${longitude}`;
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'CivicFix/1.0' } });
    clearTimeout(timer);
    if (!response.ok) throw new Error('nominatim');
    const data = await response.json();
    const type = data?.type || '';
    const category = data?.category || data?.class || '';
    const road = data?.address?.road;

    if (category === 'highway' || road) {
      return { land_class: 'public', land_note: `Nearest mapped feature is a road${road ? `: ${road}` : ''}.` };
    }
    if (['house', 'residential', 'apartments', 'building', 'yes'].includes(type) && !road) {
      return { land_class: 'private', land_note: 'The nearest mapped feature is a building rather than a road.' };
    }
    return { land_class: 'unknown', land_note: 'Nothing conclusive is mapped at this point.' };
  } catch {
    return { land_class: 'unknown', land_note: 'Land-use services are unreachable from this network, so the location was not checked.' };
  }
}

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

  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  let elements = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) continue;
      elements = (await response.json()).elements || [];
      break;
    } catch {
      // try the next mirror
    }
  }

  if (elements === null) {
    const fallback = await coarseCheck(latitude, longitude);
    cache.set(key, { at: Date.now(), value: fallback });
    return fallback;
  }

  const remember = (value) => { cache.set(key, { at: Date.now(), value }); return value; };
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
  if (openSpace) return remember({ land_class: 'public', land_note: 'Public open space at this location.' });
  if (closedAccess) return remember({ land_class: 'private', land_note: 'This land is tagged as private access in OpenStreetMap.' });
  if (closedLanduse) {
    return {
      land_class: 'private',
      land_note: `The pin sits inside a ${closedLanduse.landuse} plot with no public road nearby.`
    };
  }

  return remember({ land_class: 'unknown', land_note: `No mapped road or public space within ${NEAR_M} m of the pin.` });
}
