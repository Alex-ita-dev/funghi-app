import { useEffect, useRef, useState } from "react";
import {
  type LiveFix,
  movementHeading,
  normalizeDegrees,
} from "../lib/location";
type CompassEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};
type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};
export function useHeading(fix: LiveFix | null, now: number) {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const [device, setDevice] = useState<{ degrees: number; at: number } | null>(
    null,
  );
  const [course, setCourse] = useState<{ degrees: number; at: number } | null>(
    null,
  );
  const previous = useRef<LiveFix | null>(null);
  useEffect(() => {
    if (!fix) return;
    const heading = movementHeading(previous.current, fix);
    if (heading !== null) setCourse({ degrees: heading, at: fix.timestamp });
    else setCourse(null);
    if (
      !previous.current ||
      heading !== null ||
      fix.timestamp - previous.current.timestamp > 30000
    )
      previous.current = fix;
  }, [fix]);
  useEffect(() => {
    if (!listening) return;
    const handler = (raw: Event) => {
      if (document.hidden) return;
      const event = raw as CompassEvent;
      const angle =
        screen.orientation?.angle ??
        (window as Window & { orientation?: number }).orientation ??
        0;
      const degrees =
        typeof event.webkitCompassHeading === "number" &&
        (event.webkitCompassAccuracy === undefined ||
          (event.webkitCompassAccuracy >= 0 &&
            event.webkitCompassAccuracy <= 50))
          ? event.webkitCompassHeading + angle
          : event.absolute && event.alpha !== null
            ? 360 - event.alpha + angle
            : null;
      if (degrees === null || !Number.isFinite(degrees)) return;
      setDevice({ degrees: normalizeDegrees(degrees), at: Date.now() });
      setMessage("");
    };
    const hide = () => {
      if (document.hidden) {
        setDevice(null);
        setCourse(null);
      }
    };
    window.addEventListener("deviceorientationabsolute", handler);
    window.addEventListener("deviceorientation", handler);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler);
      window.removeEventListener("deviceorientation", handler);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [listening]);
  async function enable() {
    const sensor = window.DeviceOrientationEvent as
      OrientationConstructor | undefined;
    if (!sensor) {
      setMessage(
        "Bussola non disponibile. Uso la direzione GPS quando cammini.",
      );
      return;
    }
    try {
      if (
        sensor.requestPermission &&
        (await sensor.requestPermission()) !== "granted"
      ) {
        setMessage(
          "Bussola non autorizzata. Resta disponibile la direzione GPS.",
        );
        return;
      }
      setListening(true);
      setMessage(
        "In attesa della bussola. Tieni il telefono in piano, lontano da metalli.",
      );
    } catch {
      setMessage(
        "Sensore non accessibile. Resta disponibile la direzione GPS.",
      );
    }
  }
  const sensorFresh = device && now - device.at < 5000;
  const gpsFresh = course && now - course.at < 15000 && course.at <= now + 5000;
  return {
    degrees: sensorFresh ? device.degrees : gpsFresh ? course.degrees : null,
    source: sensorFresh
      ? "Bussola"
      : gpsFresh
        ? "Movimento GPS"
        : "Direzione non disponibile",
    enable,
    message,
  };
}
