import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
export function useData<T>(
  query: () => Promise<T>,
  dependencies: unknown[],
  initial: T,
) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: setValue,
      error: () => {},
    });
    return () => subscription.unsubscribe();
  }, dependencies);
  return value;
}
