import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { appendUniqueById } from "./collections";
import type { City, Option, Place } from "./types";
export function useLocationCatalog(
  initialCountries: Option[],
  setPlace: (place: Place | null) => void,
) {
  const countries = initialCountries;
  const [states, setStates] = useState<Option[]>([]),
    [cities, setCities] = useState<City[]>([]);
  const [country, setCountry] = useState("IN"),
    [state, setState] = useState(""),
    [city, setCity] = useState("");
  const [cityQuery, setCityQuery] = useState(""),
    [cityTotal, setCityTotal] = useState(0),
    [cityOffset, setCityOffset] = useState(0),
    [citiesLoading, setCitiesLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const boot = useRef(true);
  const initializedCountry = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLocationError("");
    setStates([]);
    setCities([]);
    setState("");
    setCity("");
    setPlace(null);
    setCityQuery("");
    setCityOffset(0);
    api<Option[]>(`/locations/${country}/states`, { signal: controller.signal })
      .then((options) => {
        setStates(options);
        if (options.length === 1 && options[0].id === "_") setState("_");
        if (!initializedCountry.current && country === "IN") {
          initializedCountry.current = true;
          const telangana = options.find((s) => s.name === "Telangana");
          if (telangana) setState(telangana.id);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLocationError(e.message);
      });
    return () => controller.abort();
  }, [country]);
  useEffect(() => {
    if (!state) {
      setCitiesLoading(false);
      return;
    }
    const controller = new AbortController();
    setCitiesLoading(true);
    setLocationError("");
    const timer = window.setTimeout(
      () => {
        api<{ items: City[]; total: number }>(
          `/locations/${country}/${state}/cities?q=${encodeURIComponent(cityQuery)}&offset=${cityOffset}`,
          { signal: controller.signal },
        )
          .then((data) => {
            setCities((prev) =>
              cityOffset
                ? appendUniqueById(prev, data.items)
                : data.items,
            );
            setCityTotal(data.total);
            setCitiesLoading(false);
            if (boot.current && data.items.length) {
              boot.current = false;
              const initial = data.items.find((c) => c.name === "Hyderabad");
              if (initial) {
                setCity(initial.id);
                const defaultPlace = {
                  name: initial.name,
                  latitude: initial.latitude,
                  longitude: initial.longitude,
                  country: "India",
                  state: "Telangana",
                  timezone: "Asia/Kolkata",
                };
                setPlace(defaultPlace);
              }
            }
          })
          .catch((e) => {
            if (e.name !== "AbortError") {
              setLocationError(e.message);
              setCitiesLoading(false);
            }
          });
      },
      cityQuery ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [country, state, cityQuery, cityOffset]);

  return {
    countries,
    states,
    cities,
    country,
    state,
    city,
    cityQuery,
    cityTotal,
    cityOffset,
    citiesLoading,
    setStates,
    setCities,
    setCountry,
    setState,
    setCity,
    setCityQuery,
    setCityTotal,
    setCityOffset,
    boot,
    locationError,
    setLocationError,
  };
}
