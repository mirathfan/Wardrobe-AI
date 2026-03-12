import { useEffect, useMemo, useState } from "react";

import { formatTimeLabel, greetingForHour } from "../utils/time";

export function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const greeting = useMemo(() => greetingForHour(now.getHours()), [now]);
  const timeLabel = useMemo(() => formatTimeLabel(now), [now]);

  return { now, greeting, timeLabel };
}
