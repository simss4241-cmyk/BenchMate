import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { photoRetryUrl, recoverPhotoSession } from "./photo-recovery";

// Keep the actual img element and its layout/overlay geometry unchanged.
export function BenchPhoto(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <RecoverablePhoto key={props.src} {...props} />;
}

function RecoverablePhoto({
  src,
  onError,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [attempt, setAttempt] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const busy = useRef(false);
  const attempts = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const protectedPhoto = !!src?.startsWith("/api/photos/");

  useEffect(() => {
    mounted.current = true;
    // Once a connection returns, allow another bounded recovery cycle.
    const reconnect = () => {
      if (
        protectedPhoto &&
        image.current?.complete &&
        !image.current.naturalWidth &&
        !busy.current
      ) {
        attempts.current = 0;
        setAttempt((value) => value + 1);
      }
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
    };
  }, [protectedPhoto]);

  return (
    <img
      {...props}
      ref={image}
      src={src && attempt ? photoRetryUrl(src, attempt) : src}
      onError={(event) => {
        onError?.(event);
        if (!protectedPhoto || busy.current || attempts.current >= 3) return;
        busy.current = true;
        const delay = [250, 1000, 3000][attempts.current++];
        timer.current = setTimeout(async () => {
          await recoverPhotoSession();
          if (mounted.current) {
            busy.current = false;
            setAttempt((value) => value + 1);
          }
        }, delay);
      }}
    />
  );
}
