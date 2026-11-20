interface InvoiceProductDetails {
  productName?: string | null;
  category: string;
  brand?: string | null;
  pattern?: string | null;
  model?: string | null;
  size?: string | null;
  specialMarkings?: string | null;
}

// Invoice descriptions are snapshots, not inventory names (which may be null
// for tyres/wheels). Recover legacy blank descriptions from retained details.
export function getInvoiceProductName(item: InvoiceProductDetails): string {
  if (item.productName?.trim()) return item.productName;
  if (item.category !== "tyres" && item.category !== "wheels") return "";
  const name = [item.brand, item.category === "tyres" ? item.pattern : item.model]
    .filter((value) => value?.trim()).join(" ");
  const details = [item.size, item.category === "tyres" ? item.specialMarkings : null]
    .filter((value) => value?.trim()).join(" ");
  return [name, details].filter(Boolean).join(" - ");
}