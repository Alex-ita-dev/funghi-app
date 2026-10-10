import type { Page } from "@playwright/test";
export function weather() {
  const today = Math.floor(Date.now() / 86400000) * 86400000;
  const dates = Array.from({ length: 30 }, (_, i) =>
    new Date(today - (30 - i) * 86400000).toISOString().slice(0, 10),
  );
  return {
    elevation: 612,
    daily: {
      time: dates,
      rain_sum: dates.map((_, i) => (i === 25 ? 10 : 3)),
      showers_sum: dates.map(() => 0),
      temperature_2m_mean: dates.map(() => 17),
      temperature_2m_min: dates.map(() => 12),
      temperature_2m_max: dates.map(() => 22),
      et0_fao_evapotranspiration: dates.map(() => 2),
      shortwave_radiation_sum: dates.map(() => 12),
    },
    hourly: {
      time: dates.flatMap((d) =>
        Array.from(
          { length: 24 },
          (_, h) => `${d}T${String(h).padStart(2, "0")}:00`,
        ),
      ),
      relative_humidity_2m: Array(720).fill(80),
      vapour_pressure_deficit: Array(720).fill(0.6),
      wind_speed_10m: Array(720).fill(8),
      soil_temperature_6cm: Array(720).fill(16),
      soil_moisture_3_to_9cm: Array(720).fill(0.3),
    },
  };
}

export async function mockLand(page: Page, code = 2) {
  await page.route("https://ic.imagery1.arcgis.com/**/getSamples?**", (route) =>
    route.fulfill({
      json: {
        samples: Array.from({ length: 9 }, (_, locationId) => ({
          locationId,
          value: String(code),
          resolution: 10,
          attributes: { Year: 2025 },
        })),
      },
    }),
  );
  await page.route("https://geo.vliz.be/**", (route) =>
    route.fulfill({ json: { type: "FeatureCollection", features: [] } }),
  );
}
