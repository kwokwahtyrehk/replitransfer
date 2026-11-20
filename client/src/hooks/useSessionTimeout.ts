import { useEffect, useRef, useCallback } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 min inactivity → show warning
const WARNING_DURATION_MS = 5 * 60 * 1000; // 5-min countdown in warning modal

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

interface UseSessionTimeoutOptions {
  onWarn: () => void;      // called when idle timeout fires
  onExpire: () => void;    // called when warning countdown reaches 0
  enabled: boolean;
}

export function useSessionTimeout({
  onWarn,
  onExpire,
  enabled,
}: UseSessionTimeoutOptions) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningActiveRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
  }, []);

  const startIdleTimer = useCallback(() => {
    clearTimers();
    warningActiveRef.current = false;
    idleTimerRef.current = setTimeout(() => {
      warningActiveRef.current = true;
      onWarn();
      expireTimerRef.current = setTimeout(() => {
        onExpire();
      }, WARNING_DURATION_MS);
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, onWarn, onExpire]);

  // Called by the modal "Stay logged in" button
  const resetTimer = useCallback(() => {
    warningActiveRef.current = false;
    startIdleTimer();
  }, [startIdleTimer]);

  useEffect(() => {
    if (!enabled) return;

    startIdleTimer();

    const handleActivity = () => {
      // Only reset the idle timer if the warning isn't showing yet
      if (!warningActiveRef.current) {
        startIdleTimer();
      }
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      );
    };
  }, [enabled, startIdleTimer, clearTimers]);

  return { resetTimer };
}

export { IDLE_TIMEOUT_MS, WARNING_DURATION_MS };
