import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WARNING_DURATION_MS } from "@/hooks/useSessionTimeout";
import { Clock, LogOut } from "lucide-react";

interface SessionTimeoutModalProps {
  open: boolean;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function SessionTimeoutModal({
  open,
  onStayLoggedIn,
  onLogout,
}: SessionTimeoutModalProps) {
  const [remaining, setRemaining] = useState(WARNING_DURATION_MS);

  // Reset and start countdown whenever the modal opens
  useEffect(() => {
    if (!open) {
      setRemaining(WARNING_DURATION_MS);
      return;
    }

    setRemaining(WARNING_DURATION_MS);
    const startedAt = Date.now();

    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = WARNING_DURATION_MS - elapsed;
      if (left <= 0) {
        setRemaining(0);
        clearInterval(tick);
      } else {
        setRemaining(left);
      }
    }, 500);

    return () => clearInterval(tick);
  }, [open]);

  // Percentage for the progress ring
  const pct = remaining / WARNING_DURATION_MS;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);

  const isUrgent = remaining < 60_000; // last 60 seconds

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        // Prevent closing by clicking outside or pressing Escape
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Session about to expire
          </DialogTitle>
          <DialogDescription>
            You've been inactive for a while. For your security, you'll be
            logged out automatically.
          </DialogDescription>
        </DialogHeader>

        {/* Countdown ring */}
        <div className="flex flex-col items-center gap-4 py-4">
          <svg width="80" height="80" className="-rotate-90">
            {/* Track */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-muted-foreground/20"
            />
            {/* Progress */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={
                isUrgent
                  ? "text-red-500 transition-all duration-500"
                  : "text-amber-500 transition-all duration-500"
              }
            />
          </svg>
          {/* Label in the centre (rotated back) */}
          <div className="absolute flex items-center justify-center w-[80px] h-[80px]">
            <span
              className={`text-xl font-bold tabular-nums ${
                isUrgent ? "text-red-600" : "text-amber-600"
              }`}
            >
              {formatCountdown(remaining)}
            </span>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            {isUrgent
              ? "Logging out very soon — click below to stay!"
              : "Click \"Stay logged in\" to continue your session."}
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            className="flex-1"
            onClick={onStayLoggedIn}
          >
            Stay logged in
          </Button>
          <Button
            variant="outline"
            className="flex-1 text-muted-foreground"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log out now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
