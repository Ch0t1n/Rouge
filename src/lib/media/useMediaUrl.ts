"use client";

import { useEffect, useState } from "react";
import { isIdbRef, peekMediaUrl, resolveMediaUrl } from "./mediaStore";

/** Resuelve `idb:` refs (Modo Demo) a object URLs; URLs http/relativas pasan directo. */
export function useMediaUrl(url: string | null | undefined): { src: string | null; missing: boolean } {
  const [state, setState] = useState<{ for: string | null; src: string | null; missing: boolean }>(() => ({
    for: url ?? null,
    src: url ? peekMediaUrl(url) : null,
    missing: false,
  }));

  useEffect(() => {
    if (!url || !isIdbRef(url)) return;
    let alive = true;
    resolveMediaUrl(url).then((src) => alive && setState({ for: url, src, missing: !src }));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url) return { src: null, missing: false };
  if (!isIdbRef(url)) return { src: url, missing: false };
  return state.for === url ? { src: state.src, missing: state.missing } : { src: peekMediaUrl(url), missing: false };
}
