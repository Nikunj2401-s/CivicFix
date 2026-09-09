import { useEffect, useState } from 'react';

/**
 * Asks the browser for the current position as soon as the app loads,
 * then keeps it fresh. No button press needed.
 * Geolocation only works on https:// or http://localhost.
 */
export function useGeo(watch = false) {
  const [position, setPosition] = useState(null);   // [lat, lng]
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('This browser has no location support.');
      return;
    }
    const ok = (p) => {
      setPosition([p.coords.latitude, p.coords.longitude]);
      setAccuracy(p.coords.accuracy);
      setError(null);
    };
    const fail = (e) =>
      setError(e.code === 1 ? 'Location permission was denied.' : 'Could not get a location fix.');
    const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 };

    if (watch) {
      const id = navigator.geolocation.watchPosition(ok, fail, opts);
      return () => navigator.geolocation.clearWatch(id);
    }
    navigator.geolocation.getCurrentPosition(ok, fail, opts);
  }, [watch]);

  return { position, accuracy, error };
}
