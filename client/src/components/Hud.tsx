import { useEffect, useState } from "react";
import { getJSON } from "../api";

/** HUD du cockpit : heure vivante, date, météo. */
export default function Hud() {
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState<{ city: string; temperature: number; sky: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    const fetchWeather = () =>
      getJSON<{ city: string; temperature: number; sky: string }>("/api/weather")
        .then(setWeather)
        .catch(() => undefined);
    fetchWeather();
    const w = setInterval(fetchWeather, 10 * 60_000);
    return () => {
      clearInterval(t);
      clearInterval(w);
    };
  }, []);

  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const seconds = now.toLocaleTimeString("fr-FR", { second: "2-digit" }).padStart(2, "0");
  const date = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="hud">
      <div className="hud-time">
        {time}
        <span className="hud-seconds">:{seconds}</span>
      </div>
      <div className="hud-date">{date}</div>
      {weather && (
        <div className="hud-weather">
          {weather.temperature}° · {weather.sky} · {weather.city}
        </div>
      )}
    </div>
  );
}
