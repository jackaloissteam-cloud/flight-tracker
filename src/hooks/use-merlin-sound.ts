import { useRef, useCallback, useState } from "react";

const MERLIN_SOUND_URL = "https://hercules-cdn.com/file_KU73zid36uJvcuByrjUApwtB";

// Returns [prime, reveal, remainingSeconds]
// prime() MUST be called synchronously from a user gesture (e.g. onClick) — this
// is what satisfies browser autoplay policies. It starts playback immediately,
// muted, so nothing is heard yet.
// reveal() can be called later (e.g. from a setTimeout) to fade the already-
// playing audio in and start the countdown. Calling play()/volume changes from
// a delayed setTimeout without a fresh user gesture is what browsers block, so
// reveal() only ever touches an <audio> element that's already playing.
// remainingSeconds counts down while the MP3 plays, 0 when done.
export function useMerlinSound(): [() => void, () => void, number] {
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const fadeInRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const [remaining, setRemaining] = useState(0);

  const prime = useCallback(() => {
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (fadeInRef.current) { clearInterval(fadeInRef.current); fadeInRef.current = null; }
      if (tickRef.current)   { clearInterval(tickRef.current);   tickRef.current   = null; }

      const audio = new Audio(MERLIN_SOUND_URL);
      audio.volume = 0;
      audioRef.current = audio;

      // Kick off playback right away, synchronously within the user gesture,
      // so browser autoplay policies allow it. Jump to the midpoint once
      // metadata is available; if it's not ready yet, play from the start.
      const startPlayback = () => {
        if (audio.duration > 0) {
          audio.currentTime = audio.duration / 2;
        }
        audio.play().catch(() => undefined);
      };

      if (audio.readyState >= 1) {
        startPlayback();
      } else {
        audio.addEventListener("loadedmetadata", startPlayback, { once: true });
        // Fallback in case metadata never loads in time
        audio.play().catch(() => undefined);
      }

      audio.addEventListener("ended", () => {
        audioRef.current = null;
        setRemaining(0);
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      });
    } catch { /* silent */ }
  }, []);

  const reveal = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Fade in
    fadeInRef.current = setInterval(() => {
      if (!audioRef.current) { clearInterval(fadeInRef.current!); return; }
      if (audioRef.current.volume < 0.98) {
        audioRef.current.volume = Math.min(1.0, audioRef.current.volume + 0.06);
      } else {
        audioRef.current.volume = 1.0;
        clearInterval(fadeInRef.current!);
        fadeInRef.current = null;
      }
    }, 50);

    // Countdown tick every second
    const totalSecs = Math.max(0, Math.ceil(audio.duration - audio.currentTime));
    setRemaining(totalSecs);
    tickRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(tickRef.current!);
          tickRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  return [prime, reveal, remaining];
}
