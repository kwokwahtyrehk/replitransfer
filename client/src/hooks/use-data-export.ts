import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function useDataExport() {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  async function downloadFullExport() {
    if (isExporting || !window.confirm(
      "Download all business data, including invoices, stock/DOT records, suppliers, expenses, orders and browser templates?\n\nThis file contains private customer and financial information. Keep it private, never upload it to public GitHub. Passwords and secrets are excluded. This does not change any data and is NOT an Invoice Restore file. Base44 requires a mapped import.",
    )) return;
    setIsExporting(true);
    try {
      const response = await fetch("/api/data-export", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401
        ? "Please sign in again before exporting."
        : "Full export failed. No data was changed. Please retry.");
      const data = await response.json();
      const browserData: Record<string, unknown> = {};
      for (const key of ["invoiceTemplateSettings", "delivery_order_template", "order_tabs_v2"]) {
        // Keep exact raw values too, so even an old browser format remains recoverable.
        const raw = localStorage.getItem(key);
        if (raw !== null) browserData[key] = raw;
      }
      data.browserData = {
        capturedAt: new Date().toISOString(),
        values: browserData,
        note: "Raw JSON strings from this browser only. Local orders may be newer than server orders; compare updatedAt before importing. Do not import both copies as separate orders.",
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tyrepro-full-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast({ title: "Export download started", description: "Includes table counts and migration instructions. Store the file privately." });
    } catch (error) {
      toast({ title: "Export failed", description: error instanceof Error ? error.message : "Please retry.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }
  return { isExporting, downloadFullExport };
}
