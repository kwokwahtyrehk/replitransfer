const identityFields = ["category", "brand", "pattern", "model", "size", "pcd", "color", "specialMarkings", "productName"] as const;

export function assertNewInventoryProducts(
  existing: object[],
  incoming: object[],
) {
  const key = (item: object) => JSON.stringify(identityFields.map(
    (field) => String((item as Record<string, unknown>)[field] ?? "").trim().toLowerCase(),
  ));
  const seen = new Set(existing.map(key));
  for (const [index, item] of Array.from(incoming.entries())) {
    const identity = key(item);
    if (seen.has(identity)) {
      throw new Error(`Row ${index + 2} duplicates an existing product or another CSV row. No products were imported. Import only new products; edit existing stock in Inventory.`);
    }
    seen.add(identity);
  }
}

export function parseInventoryCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(field); field = "";
    } else if (!quoted && (char === "\r" || char === "\n")) {
      row.push(field);
      if (row.some(value => value.trim())) rows.push(row);
      row = []; field = "";
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else field += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}
