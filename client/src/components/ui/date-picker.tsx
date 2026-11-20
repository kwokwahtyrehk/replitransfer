import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  "data-testid"?: string
  "aria-label"?: string
  required?: boolean
  onBlur?: () => void
  displayFormat?: "localized" | "iso"
}

const parseLocalDate = (value: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)

  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : undefined
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const displayLocalDate = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)

const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      placeholder = "Select date",
      disabled,
      className,
      "data-testid": dataTestId,
      "aria-label": ariaLabel = "Select date",
      required,
      onBlur,
      displayFormat = "localized",
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false)
    const selectedDate = parseLocalDate(value)

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-required={required}
            onBlur={onBlur}
            className={cn(
              "w-full justify-between text-left font-normal",
              !selectedDate && "text-muted-foreground",
              className,
            )}
            data-testid={dataTestId}
          >
            {selectedDate
              ? (displayFormat === "iso" ? formatLocalDate(selectedDate) : displayLocalDate(selectedDate))
              : placeholder}
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[22rem] max-w-[calc(100vw-2rem)] p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={(date) => {
              if (!date) return
              onChange(formatLocalDate(date))
              setOpen(false)
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    )
  },
)
DatePicker.displayName = "DatePicker"

export { DatePicker }