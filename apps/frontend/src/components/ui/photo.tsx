"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building } from "lucide-react";

/**
 * A listing photo in a fixed frame that never shows the browser's broken-
 * image icon. Photo URLs come from krisha/2GIS and go stale (listings are
 * removed, hosts block hotlinking), so a missing URL and a URL that fails
 * to load look the same: a placeholder — or nothing, for heroes that
 * should just collapse.
 */
export function Photo({
  src,
  alt = "",
  className = "",
  iconClassName = "h-5 w-5",
  fallback,
  hideWhenMissing = false,
}: {
  src?: string | null;
  alt?: string;
  /** Size, shape and spacing of the frame. */
  className?: string;
  iconClassName?: string;
  /** Replaces the default building icon. */
  fallback?: ReactNode;
  /** Render nothing instead of a placeholder (hero images). */
  hideWhenMissing?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
    // An image that failed before hydration never fires onError for React.
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);

  const missing = !src || failed;
  if (missing && hideWhenMissing) return null;

  return (
    <div className={`overflow-hidden bg-muted ${className}`}>
      {missing ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          {fallback ?? <Building className={iconClassName} aria-hidden="true" />}
        </div>
      ) : (
        // No loading="lazy": a deferred image can read as `complete` with
        // zero width in the hydration check above and be hidden for good.
        <img ref={img} src={src} alt={alt} onError={() => setFailed(true)}
          className="h-full w-full object-cover" />
      )}
    </div>
  );
}
