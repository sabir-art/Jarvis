/** Météo locale via open-meteo (gratuit, sans clé), avec cache et secours hors-ligne. */

export interface Weather {
  city: string;
  temperature: number;
  sky: string;
  live: boolean;
}

let cache: { at: number; data: Weather } | null = null;

export async function getWeather(): Promise<Weather> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data;
  const lat = Number(process.env.JARVIS_LAT ?? 48.8566);
  const lon = Number(process.env.JARVIS_LON ?? 2.3522);
  const city = process.env.JARVIS_CITY ?? "Paris";
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
      { signal: AbortSignal.timeout(5000) },
    );
    const j = (await r.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    const code = j.current?.weather_code ?? 0;
    const sky =
      code === 0 ? "ciel dégagé" : code < 4 ? "peu nuageux" : code < 50 ? "couvert" : code < 70 ? "pluie" : code < 80 ? "neige" : "averses";
    const data: Weather = { city, temperature: Math.round(j.current?.temperature_2m ?? 21), sky, live: true };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return { city, temperature: 21, sky: "ciel dégagé", live: false };
  }
}
