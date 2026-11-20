import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, ClipboardList, X, FileSpreadsheet,
  ChevronDown, ChevronUp, FileText, Eye, EyeOff,
  Cloud, CloudOff, Loader2, Truck, GripVertical, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import * as XLSX from "xlsx-js-style";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import CreateInvoiceModal, { type PrefilledInvoiceItem } from "@/components/create-invoice-modal";
import { toast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  brand: string;
  description: string;
  size: string;
  type: string;
  price: string;
  quantity: string;
  depositMode: "%" | "$";
  deposit: string;
  remark: string;
  cost: string;
  costQty: string;
  estimatedFreight: string;
  skipCost?: boolean;
}

interface CustomerTableRow {
  itemId: string;
  unitType: string;                             // "pieces" | "box" | custom
  paymentMode: "nil" | "deposit" | "balance";   // what to show in Payment Total
}

interface CustomerTable {
  rows: CustomerTableRow[];
  visible: boolean;
}

interface DeliveryOrderRow {
  orderId: string;
  itemId: string;
  unitType: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  items: OrderItem[];
  collapsed?: boolean;
  customerTable?: CustomerTable;
}

interface ClientTab {
  id: string;
  name: string;
  orders: PurchaseOrder[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "order_tabs_v2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function n(val: string | undefined): number {
  if (val === undefined || val === "") return 0;
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

function fmt(v: number): string { return v.toFixed(2); }

function depositAmt(item: OrderItem): number {
  const sub = n(item.price) * n(item.quantity);
  return item.depositMode === "%" ? (sub * n(item.deposit)) / 100 : n(item.deposit);
}

function costSub(item: OrderItem): number {
  return n(item.cost) * n(item.costQty);
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numToWords(num: number): string {
  const i = Math.round(num);
  if (i === 0) return "Zero";
  if (i < 0) return "Minus " + numToWords(-i);
  if (i < 20) return ONES[i];
  if (i < 100) return TENS[Math.floor(i / 10)] + (i % 10 ? " " + ONES[i % 10] : "");
  if (i < 1000) return ONES[Math.floor(i / 100)] + " Hundred" + (i % 100 ? " " + numToWords(i % 100) : "");
  return i.toString();
}

function blankItem(): OrderItem {
  return {
    id: crypto.randomUUID(), brand: "", description: "", size: "", type: "",
    price: "", quantity: "", depositMode: "%", deposit: "", remark: "",
    cost: "", costQty: "", estimatedFreight: "",
  };
}

function blankOrder(seq: number): PurchaseOrder {
  return {
    id: crypto.randomUUID(), orderNumber: `#${seq}`,
    orderDate: todayStr(), items: [blankItem()], collapsed: false,
  };
}

const DEFAULT_TABS: ClientTab[] = [
  { id: "kelvin-sy",  name: "Kelvin Sy", orders: [blankOrder(1)] },
  { id: "mnl-mrk",   name: "MNL-MRK",   orders: [blankOrder(1)] },
  { id: "alvin",     name: "Alvin",      orders: [blankOrder(1)] },
];

interface OrderStore {
  tabs: ClientTab[];
  updatedAt: number; // ms timestamp — 0 means unknown/old format
}

function migrateTabs(arr: any[]): ClientTab[] {
  return arr.map((tab: any) => {
    if (tab.items && !tab.orders) {
      return { id: tab.id, name: tab.name, orders: [{ id: crypto.randomUUID(), orderNumber: "#1", orderDate: todayStr(), items: tab.items, collapsed: false }] };
    }
    return tab;
  });
}

function loadLocalStore(): OrderStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: DEFAULT_TABS, updatedAt: 0 };
    const parsed = JSON.parse(raw);
    // New format: { tabs: [...], updatedAt: number }
    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.tabs)) {
      return { tabs: migrateTabs(parsed.tabs), updatedAt: parsed.updatedAt || 0 };
    }
    // Old format: just an array
    if (Array.isArray(parsed)) {
      return { tabs: migrateTabs(parsed), updatedAt: 0 };
    }
    return { tabs: DEFAULT_TABS, updatedAt: 0 };
  } catch { return { tabs: DEFAULT_TABS, updatedAt: 0 }; }
}

function loadTabs(): ClientTab[] {
  return loadLocalStore().tabs;
}

// ─── Customer Table Excel Export ──────────────────────────────────────────────

function exportCustomerTableToExcel(
  order: PurchaseOrder,
  tabName: string,
  ctRows: CustomerTableRow[],
) {
  const orderItems = ctRows.map((r) => ({
    ctRow: r,
    item: order.items.find((i) => i.id === r.itemId),
  })).filter((x) => x.item) as { ctRow: CustomerTableRow; item: OrderItem }[];

  let grandTotal = 0;
  let grandPayment = 0;

  const dataRows = orderItems.map(({ ctRow, item }, idx) => {
    const qty = n(item.quantity);
    const sub = n(item.price) * qty;
    const dep = depositAmt(item);
    const bal = sub - dep;
    const depPct = item.depositMode === "%" ? `${item.deposit}%` : `$${Math.round(dep)}`;
    const depPctNum = item.depositMode === "%" ? n(item.deposit) : (sub > 0 ? (dep / sub) * 100 : 0);
    const balPct = `${Math.round(100 - depPctNum)}%`;
    const mode = ctRow.paymentMode ?? "nil";
    const remark = mode === "nil" ? "—"
      : mode === "deposit" ? `${depPct} deposit; Total $${Math.round(sub)}`
      : `${balPct} balance; Total $${Math.round(sub)}`;
    const paymentTotal = mode === "nil" ? sub : mode === "deposit" ? dep : bal;
    const modeLabel = mode === "nil" ? "Nil" : mode === "deposit" ? "Deposit" : "Balance";
    grandTotal += sub;
    grandPayment += paymentTotal;

    return [
      idx + 1,
      `${numToWords(qty)} (${qty})`,
      ctRow.unitType || "pieces",
      item.brand,
      item.description,
      item.size,
      item.type,
      n(item.price),
      qty,
      sub,
      modeLabel,
      paymentTotal,
      remark,
    ];
  });

  // Title: "June 2026 Shipment"
  const now = new Date();
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const title = `${monthYear} Shipment`;

  const headers = [
    "No.", "Quantity (Words)", "Unit", "Brand", "Description",
    "Size", "Type", "Price", "Qty", "Subtotal",
    "Nil / Dep / Bal", "Payment Total", "Remark",
  ];

  const NUM_COLS = 13;

  const aoa: any[][] = [
    [title, ...Array(NUM_COLS - 1).fill("")],   // row 0: title (merged)
    headers,                                      // row 1: column headers (hidden)
    ...dataRows,                                  // row 2+: data
    ["", "", "", "", "", "", "", "", "TOTAL", grandTotal, "", grandPayment, ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge title row across all columns
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: NUM_COLS - 1 } }];

  // Hide the column-header row (row index 1)
  ws["!rows"] = [undefined, { hidden: true }] as any[];

  // Column widths — hidden: true hides the column in Excel
  ws["!cols"] = [
    { wch: 5,  hidden: true },   // No.
    { wch: 22, hidden: true },   // Quantity (Words)
    { wch: 8,  hidden: true },   // Unit
    { wch: 14 },                 // Brand
    { wch: 42 },                 // Description (full length)
    { wch: 20 },                 // Size (full length)
    { wch: 10 },                 // Type
    { wch: 10 },                 // Price
    { wch: 6  },                 // Qty
    { wch: 12, hidden: true },   // Subtotal
    { wch: 12, hidden: true },   // Nil / Dep / Bal
    { wch: 14 },                 // Payment Total
    { wch: 32 },                 // Remark
  ];

  // Apply Arial font + center alignment to every cell
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: "z", v: "" };
      const border = { style: "thin", color: { rgb: "000000" } };
      ws[addr].s = {
        font: { name: "Arial", sz: R === 0 ? 12 : 10, bold: R === 0 },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: { top: border, bottom: border, left: border, right: border },
      };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Customer Table");
  XLSX.writeFile(wb, `${tabName}_${order.orderNumber}_CustomerTable.xlsx`);
}

// ─── CustomerTable Component ───────────────────────────────────────────────────

function CustomerTable({
  order,
  tabName,
  ctRows,
  onUpdateRow,
  onClose,
  onExportDelivery,
  onSyncMissing,
}: {
  order: PurchaseOrder;
  tabName: string;
  ctRows: CustomerTableRow[];
  onUpdateRow: (itemId: string, field: keyof CustomerTableRow, value: any) => void;
  onClose: () => void;
  onExportDelivery: () => void;
  onSyncMissing: (items: OrderItem[]) => void;
}) {
  const UNIT_OPTIONS = ["pieces", "box"];

  const rows = ctRows.map((r) => ({ ctRow: r, item: order.items.find((i) => i.id === r.itemId) }))
    .filter((x) => x.item) as { ctRow: CustomerTableRow; item: OrderItem }[];

  const missingItems = order.items.filter((i) => !ctRows.some((r) => r.itemId === i.id));

  const grandTotal = rows.reduce((s, { item }) => s + n(item.price) * n(item.quantity), 0);

  const inputCls = "h-7 px-1 text-xs border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 rounded w-full min-w-0";

  return (
    <div className="border rounded-lg overflow-hidden mt-2 bg-blue-50/20">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-blue-100/60 border-b">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-700" />
          <span className="font-semibold text-sm text-blue-800">Customer Table — {order.orderNumber}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 border-green-400 text-green-700 hover:bg-green-50"
            onClick={onExportDelivery}
          >
            <Truck className="w-3 h-3" />
            Delivery Order
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={() => exportCustomerTableToExcel(order, tabName, ctRows)}
          >
            <FileSpreadsheet className="w-3 h-3" />
            Export Excel
          </Button>
          <button onClick={onClose} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Sync banner — shown when order items exist that aren't in the table */}
      {missingItems.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 border-b text-xs">
          <span className="text-amber-800 font-medium">⚠ {missingItems.length} item{missingItems.length !== 1 ? "s" : ""} in the order not included in this table</span>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-amber-400 text-amber-700 hover:bg-amber-100" onClick={() => onSyncMissing(missingItems)}>
            Add all
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "1300px" }}>
          <thead>
            <tr className="bg-blue-100/40 text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
              <th className="px-2 py-2 text-center border-r w-7">No.</th>
              <th className="px-2 py-2 text-center border-r w-28">Quantity (Words)</th>
              <th className="px-2 py-2 text-center border-r w-24">Unit</th>
              <th className="px-2 py-2 text-left border-r w-24">Brand</th>
              <th className="px-2 py-2 text-left border-r w-36">Description</th>
              <th className="px-2 py-2 text-left border-r w-24">Size</th>
              <th className="px-2 py-2 text-left border-r w-20">Type</th>
              <th className="px-2 py-2 text-right border-r w-20">Price</th>
              <th className="px-2 py-2 text-center border-r w-12">Qty</th>
              <th className="px-2 py-2 text-right border-r w-28">Payment Total</th>
              <th className="px-2 py-2 text-center border-r w-28">Nil / Dep / Bal</th>
              <th className="px-2 py-2 text-left border-r">Remark</th>
              <th className="px-2 py-2 text-right w-22">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ctRow, item }, idx) => {
              const qty = n(item.quantity);
              const sub = n(item.price) * qty;
              const dep = depositAmt(item);
              const bal = sub - dep;
              const depPct = item.depositMode === "%" ? `${item.deposit}%` : `$${fmt(dep)}`;
              const depPctNum = item.depositMode === "%" ? n(item.deposit) : (sub > 0 ? (dep / sub) * 100 : 0);
              const balPct = `${fmt(100 - depPctNum)}%`;
              const mode = (ctRow.paymentMode ?? "nil") as "nil" | "deposit" | "balance";
              const remark = mode === "nil" ? "—"
                : mode === "deposit" ? `${depPct} deposit; Total $${Math.round(sub)}`
                : `${balPct} balance; Total $${Math.round(sub)}`;
              const paymentTotal = mode === "nil" ? sub : mode === "deposit" ? dep : bal;
              const remarkColor = mode === "nil" ? "text-muted-foreground"
                : mode === "deposit" ? "text-green-700" : "text-blue-700";

              return (
                <tr key={ctRow.itemId} className="border-t hover:bg-blue-50/40">
                  <td className="px-2 py-1 text-center border-r text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1 text-center border-r font-medium">
                    <div>{numToWords(qty)}</div>
                    <div className="text-muted-foreground">({qty})</div>
                  </td>
                  <td className="px-0.5 py-0.5 border-r">
                    <div className="flex gap-0.5">
                      <select
                        value={UNIT_OPTIONS.includes(ctRow.unitType) ? ctRow.unitType : "__custom__"}
                        onChange={(e) => {
                          if (e.target.value === "__custom__") {
                            onUpdateRow(ctRow.itemId, "unitType", "");
                          } else {
                            onUpdateRow(ctRow.itemId, "unitType", e.target.value);
                          }
                        }}
                        className="h-7 text-xs border rounded px-1 bg-transparent"
                      >
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                        <option value="__custom__">Custom</option>
                      </select>
                      {!UNIT_OPTIONS.includes(ctRow.unitType) && (
                        <Input
                          className={inputCls}
                          value={ctRow.unitType}
                          onChange={(e) => onUpdateRow(ctRow.itemId, "unitType", e.target.value)}
                          placeholder="type unit…"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1 border-r">{item.brand || "—"}</td>
                  <td className="px-2 py-1 border-r">{item.description || "—"}</td>
                  <td className="px-2 py-1 border-r">{item.size || "—"}</td>
                  <td className="px-2 py-1 border-r">{item.type || "—"}</td>
                  <td className="px-2 py-1 text-right border-r tabular-nums">${fmt(n(item.price))}</td>
                  <td className="px-2 py-1 text-center border-r tabular-nums">{qty}</td>
                  <td className="px-2 py-1 text-right border-r tabular-nums font-bold text-primary">${fmt(paymentTotal)}</td>
                  <td className="px-1 py-1 text-center border-r">
                    <div className="flex rounded overflow-hidden border border-muted-foreground/30 text-[10px]">
                      <button
                        onClick={() => onUpdateRow(ctRow.itemId, "paymentMode", "nil")}
                        className={`flex-1 px-1.5 py-1 transition-colors ${mode === "nil" ? "bg-slate-600 text-white font-bold" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      >Nil</button>
                      <button
                        onClick={() => onUpdateRow(ctRow.itemId, "paymentMode", "deposit")}
                        className={`flex-1 px-1.5 py-1 transition-colors ${mode === "deposit" ? "bg-green-600 text-white font-bold" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      >Dep</button>
                      <button
                        onClick={() => onUpdateRow(ctRow.itemId, "paymentMode", "balance")}
                        className={`flex-1 px-1.5 py-1 transition-colors ${mode === "balance" ? "bg-blue-600 text-white font-bold" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                      >Bal</button>
                    </div>
                  </td>
                  <td className="px-2 py-1 border-r text-xs">
                    <span className={remarkColor}>{remark}</span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums font-medium">${fmt(sub)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-blue-100/40 font-semibold">
              <td colSpan={9} className="px-2 py-2 text-right border-r text-muted-foreground text-xs">Total</td>
              <td className="px-2 py-2 text-right border-r tabular-nums text-primary font-bold">
                ${fmt(rows.reduce((s, { ctRow, item }) => {
                  const sub = n(item.price) * n(item.quantity);
                  const dep = depositAmt(item);
                  const mode = (ctRow.paymentMode ?? "nil") as "nil" | "deposit" | "balance";
                  return s + (mode === "nil" ? sub : mode === "deposit" ? dep : sub - dep);
                }, 0))}
              </td>
              <td colSpan={2} className="border-r" />
              <td className="px-2 py-2 text-right tabular-nums text-primary">${fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── OrderBlock Component ─────────────────────────────────────────────────────

const inputCls = "h-7 px-1 text-xs border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 rounded w-full min-w-0";

function OrderBlock({
  order,
  tabName,
  onUpdateItem,
  onAddItem,
  onAddItemCopy,
  onRemoveItem,
  onUpdateOrder,
  onDeleteOrder,
  onToggleCollapse,
  onSetCustomerTable,
  canDelete,
  deliveryMode,
  deliverySelectedIds,
  onToggleDelivery,
  copiedItem,
  onCopyItem,
  onCreateInvoice,
  selectedIds,
  onSelectedIdsChange,
}: {
  order: PurchaseOrder;
  tabName: string;
  onUpdateItem: (itemId: string, field: keyof OrderItem, value: string) => void;
  onAddItem: () => void;
  onAddItemCopy: (item: OrderItem) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateOrder: (field: keyof PurchaseOrder, value: any) => void;
  onDeleteOrder: () => void;
  onToggleCollapse: () => void;
  onSetCustomerTable: (ct: CustomerTable | undefined) => void;
  canDelete: boolean;
  deliveryMode?: boolean;
  deliverySelectedIds?: Set<string>;
  onToggleDelivery?: (itemId: string) => void;
  copiedItem: OrderItem | null;
  onCopyItem: (item: OrderItem) => void;
  onCreateInvoice: (items: PrefilledInvoiceItem[], cost: number) => void;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: OrderItem } | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", (e) => e.key === "Escape" && close());
    return () => window.removeEventListener("click", close);
  }, [ctxMenu]);

  const items = order.items;
  const totalQty = items.reduce((s, i) => s + n(i.quantity), 0);
  const totalSubtotal = items.reduce((s, i) => s + n(i.price) * n(i.quantity), 0);
  const totalDeposit = items.reduce((s, i) => s + depositAmt(i), 0);
  const totalCostSub = items.reduce((s, i) => i.skipCost ? s : s + costSub(i), 0);
  const totalFreight = items.reduce((s, i) => i.skipCost ? s : s + n(i.estimatedFreight), 0);
  const totalCost = totalCostSub + totalFreight;
  const totalCostQty = items.reduce((s, i) => s + n(i.costQty), 0);
  // True order value: only items that are NOT balance duplicates (skipCost=true items are
  // balance collections for goods already counted in a deposit order — exclude them here).
  const totalTrueValue = items.reduce((s, i) => i.skipCost ? s : s + n(i.price) * n(i.quantity), 0);
  // Cash actually collected in this order: balance portion for skipCost items with deposit,
  // deposit portion for costed items with deposit, full price for items with no deposit split.
  const totalCashIn = items.reduce((s, i) => {
    const sub = n(i.price) * n(i.quantity);
    const dep = depositAmt(i);
    if (dep > 0 && i.skipCost) return s + (sub - dep);   // balance order — collect the balance
    if (dep > 0 && !i.skipCost) return s + dep;           // deposit order — collect the deposit
    return s + sub;                                        // full payment — collect everything
  }, 0);
  const grossProfit = totalCashIn - totalCost;
  const hasBalanceItems = items.some((i) => i.skipCost);
  const allBalance = items.length > 0 && items.every((i) => i.skipCost);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectedIdsChange(next);
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      onSelectedIdsChange(new Set());
    } else {
      onSelectedIdsChange(new Set(items.map((i) => i.id)));
    }
  }

  function generateCustomerTable() {
    const rows: CustomerTableRow[] = Array.from(selectedIds)
      .map((id) => {
        const existing = order.customerTable?.rows.find((r) => r.itemId === id);
        return existing ?? { itemId: id, unitType: "pieces", paymentMode: "nil" as const };
      });
    onSetCustomerTable({ rows, visible: true });
  }

  function syncMissingToCustomerTable(missingItems: OrderItem[]) {
    if (!order.customerTable) return;
    const newRows: CustomerTableRow[] = missingItems.map((i) => ({
      itemId: i.id,
      unitType: "pieces",
      paymentMode: "nil" as const,
    }));
    onSetCustomerTable({
      ...order.customerTable,
      rows: [...order.customerTable.rows, ...newRows],
    });
  }

  function exportCtDelivery() {
    if (!order.customerTable) return;
    const tmpl = loadDeliveryTemplate();
    const rows = order.customerTable.rows
      .map((r) => ({ item: order.items.find((i) => i.id === r.itemId)!, unitType: r.unitType }))
      .filter((r) => r.item);
    exportDeliveryOrderToWord(rows, tmpl, tabName, "");
  }

  function updateCtRow(itemId: string, field: keyof CustomerTableRow, value: any) {
    if (!order.customerTable) return;
    onSetCustomerTable({
      ...order.customerTable,
      rows: order.customerTable.rows.map((r) =>
        r.itemId === itemId ? { ...r, [field]: value } : r
      ),
    });
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Order Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onToggleCollapse} className="text-muted-foreground hover:text-foreground">
            {order.collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <span className="font-semibold text-sm">{tabName} — Order {order.orderNumber}</span>
          <DatePicker
            value={order.orderDate}
            onChange={(value) => onUpdateOrder("orderDate", value)}
            aria-label={`Change date for order ${order.orderNumber}`}
            className="h-auto w-auto border-0 bg-transparent p-0 text-xs text-muted-foreground shadow-none hover:bg-transparent hover:text-primary"
            data-testid={`input-order-date-${order.id}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</span>
          {canDelete && (
            <button onClick={onDeleteOrder} className="text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!order.collapsed && (
        <>
          {/* Selection toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b text-xs">
              <span className="text-blue-700 font-medium">{selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected</span>
              <Button size="sm" className="h-6 text-xs px-2 gap-1 bg-blue-600 hover:bg-blue-700" onClick={generateCustomerTable}>
                <FileText className="w-3 h-3" />
                Generate Customer Table
              </Button>
              <button className="text-muted-foreground hover:text-foreground ml-1" onClick={() => onSelectedIdsChange(new Set())}>
                Clear
              </button>
            </div>
          )}

          {/* Main Order Table */}
          <div
            className={`overflow-x-auto transition-colors ${isDragOver ? "ring-2 ring-inset ring-blue-400 bg-blue-50/30" : ""}`}
            onDragEnter={(e) => {
              if (!e.dataTransfer.types.includes("application/order-item")) return;
              dragCounter.current += 1;
              setIsDragOver(true);
            }}
            onDragLeave={() => {
              dragCounter.current -= 1;
              if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false); }
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("application/order-item")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              dragCounter.current = 0;
              setIsDragOver(false);
              const raw = e.dataTransfer.getData("application/order-item");
              if (!raw) return;
              try {
                const item: OrderItem = JSON.parse(raw);
                onAddItemCopy({ ...item, id: crypto.randomUUID() });
              } catch {}
            }}
          >
            <table className="w-full text-xs border-collapse" style={{ minWidth: "1540px" }}>
              <thead>
                <tr className="bg-muted/30 text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
                  {deliveryMode && (
                    <th className="px-2 py-2 text-center border-r w-8 bg-green-50">
                      <Truck className="w-3 h-3 mx-auto text-green-600" />
                    </th>
                  )}
                  <th className="px-2 py-2 text-center border-r w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === items.length && items.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-1.5 py-2 text-center border-r w-7">#</th>
                  <th className="px-1.5 py-2 text-left border-r w-24">Brand</th>
                  <th className="px-1.5 py-2 text-left border-r w-36">Description</th>
                  <th className="px-1.5 py-2 text-left border-r w-24">Size</th>
                  <th className="px-1.5 py-2 text-left border-r w-20">Type</th>
                  <th className="px-1.5 py-2 text-right border-r w-20">Price</th>
                  <th className="px-1.5 py-2 text-right border-r w-14">Qty</th>
                  <th className="px-1.5 py-2 text-right border-r w-22">Subtotal</th>
                  <th className="px-1.5 py-2 text-center border-r w-28">Deposit (%/$)</th>
                  <th className="px-1.5 py-2 text-left border-r w-28">Remark</th>
                  <th className="px-1.5 py-2 text-center border-r w-8" title="Include cost in totals">💰</th>
                  <th className="px-1.5 py-2 text-right border-r w-20">Cost</th>
                  <th className="px-1.5 py-2 text-right border-r w-14">C.Qty</th>
                  <th className="px-1.5 py-2 text-right border-r w-24">Cost Sub.</th>
                  <th className="px-1.5 py-2 text-right border-r w-24">Est. Freight</th>
                  <th className="px-1.5 py-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={deliveryMode ? 17 : 16} className="py-6 text-center text-muted-foreground">No items. Click "Add Item" below.</td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const sub = n(item.price) * n(item.quantity);
                    const dep = depositAmt(item);
                    const cSub = costSub(item);
                    const isSelected = selectedIds.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/order-item", JSON.stringify(item));
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtxMenu({ x: e.clientX, y: e.clientY, item });
                        }}
                        className={`border-t transition-colors cursor-grab active:cursor-grabbing ${deliverySelectedIds?.has(item.id) ? "bg-green-50" : isSelected ? "bg-blue-50" : "hover:bg-blue-50/20"}`}
                      >
                        {deliveryMode && (
                          <td className="px-2 py-1 text-center border-r bg-green-50/40">
                            <input
                              type="checkbox"
                              checked={deliverySelectedIds?.has(item.id) ?? false}
                              onChange={() => onToggleDelivery?.(item.id)}
                              className="cursor-pointer accent-green-600"
                            />
                          </td>
                        )}
                        <td className="px-2 py-1 text-center border-r">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)} className="cursor-pointer" />
                        </td>
                        <td className="px-1 py-1 text-center text-muted-foreground border-r select-none">
                          <div className="flex items-center justify-center gap-0.5">
                            <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                            <span className="text-[11px]">{idx + 1}</span>
                          </div>
                        </td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls} value={item.brand} onChange={(e) => onUpdateItem(item.id, "brand", e.target.value)} placeholder="Brand" /></td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls} value={item.description} onChange={(e) => onUpdateItem(item.id, "description", e.target.value)} placeholder="Description" /></td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls} value={item.size} onChange={(e) => onUpdateItem(item.id, "size", e.target.value)} placeholder="225/45R17" /></td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls} value={item.type} onChange={(e) => onUpdateItem(item.id, "type", e.target.value)} placeholder="Type" /></td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls + " text-right"} type="number" step="0.01" value={item.price} onChange={(e) => onUpdateItem(item.id, "price", e.target.value)} placeholder="0.00" /></td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls + " text-right"} type="number" step="1" value={item.quantity} onChange={(e) => onUpdateItem(item.id, "quantity", e.target.value)} placeholder="0" /></td>
                        <td className="px-1.5 py-1 text-right border-r tabular-nums font-medium">{sub !== 0 ? fmt(sub) : "—"}</td>
                        <td className="px-0.5 py-0.5 border-r">
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => onUpdateItem(item.id, "depositMode", item.depositMode === "%" ? "$" : "%")}
                              className="shrink-0 text-[10px] font-bold w-7 h-6 rounded border border-muted-foreground/30 bg-muted hover:bg-primary hover:text-white hover:border-primary transition-colors"
                            >{item.depositMode}</button>
                            <Input className={inputCls + " text-right"} type="number" step="0.01" value={item.deposit} onChange={(e) => onUpdateItem(item.id, "deposit", e.target.value)} placeholder={item.depositMode === "%" ? "%" : "0.00"} />
                            {dep !== 0 && <span className="shrink-0 text-[10px] text-green-700 font-medium tabular-nums whitespace-nowrap">=${fmt(dep)}</span>}
                          </div>
                        </td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls} value={item.remark} onChange={(e) => onUpdateItem(item.id, "remark", e.target.value)} placeholder="Remark" /></td>
                        <td className="px-1 py-0.5 text-center border-r">
                          <button
                            title={item.skipCost ? "Cost excluded from totals — click to include" : "Cost included in totals — click to exclude"}
                            onClick={() => onUpdateItem(item.id, "skipCost", !item.skipCost)}
                            className={`w-6 h-6 rounded text-sm transition-colors ${item.skipCost ? "opacity-30 hover:opacity-60" : "opacity-100 hover:opacity-70"}`}
                          >💰</button>
                        </td>
                        <td className={`px-0.5 py-0.5 border-r ${item.skipCost ? "opacity-40" : ""}`}><Input className={inputCls + " text-right"} type="number" step="0.01" value={item.cost} onChange={(e) => onUpdateItem(item.id, "cost", e.target.value)} placeholder="0.00" /></td>
                        <td className={`px-0.5 py-0.5 border-r ${item.skipCost ? "opacity-40" : ""}`}><Input className={inputCls + " text-right"} type="number" step="1" value={item.costQty} onChange={(e) => onUpdateItem(item.id, "costQty", e.target.value)} placeholder="0" /></td>
                        <td className={`px-1.5 py-1 text-right border-r tabular-nums font-medium ${item.skipCost ? "opacity-40 line-through text-muted-foreground" : "text-orange-700"}`}>{cSub !== 0 ? fmt(cSub) : "—"}</td>
                        <td className="px-0.5 py-0.5 border-r"><Input className={inputCls + " text-right"} type="number" step="0.01" value={item.estimatedFreight} onChange={(e) => onUpdateItem(item.id, "estimatedFreight", e.target.value)} placeholder="0.00" /></td>
                        <td className="px-1.5 py-1 text-center">
                          <button onClick={() => onRemoveItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td colSpan={deliveryMode ? 8 : 7} className="px-2 py-1.5 text-right text-muted-foreground border-r text-xs">Total</td>
                    <td className="px-2 py-1.5 text-right border-r tabular-nums">{totalQty % 1 === 0 ? totalQty : fmt(totalQty)}</td>
                    <td className="px-2 py-1.5 text-right border-r tabular-nums text-primary">{fmt(totalSubtotal)}</td>
                    <td className="px-2 py-1.5 text-right border-r tabular-nums text-green-700">{fmt(totalDeposit)}</td>
                    <td className="border-r" />
                    <td className="border-r" />
                    <td className="border-r" />
                    <td className="px-2 py-1.5 text-right border-r tabular-nums">{totalCostQty % 1 === 0 ? totalCostQty : fmt(totalCostQty)}</td>
                    <td className="px-2 py-1.5 text-right border-r tabular-nums text-orange-700">{fmt(totalCostSub)}</td>
                    <td className="px-2 py-1.5 text-right border-r tabular-nums text-blue-700">{fmt(totalFreight)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Add Item */}
          <div className="px-3 py-2 border-t bg-muted/20 flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={onAddItem} className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />Add Item
            </Button>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                onClick={() => {
                  const selected = items.filter((i) => selectedIds.has(i.id));
                  const invoiceItems: PrefilledInvoiceItem[] = selected.map((i) => ({
                    productName: [i.brand, i.description, i.size, i.type].filter(Boolean).join(" ").trim() || "Item",
                    quantity: Math.max(1, Math.round(n(i.quantity))),
                    price: n(i.price),
                  }));
                  const totalCost = selected.reduce((s, i) => {
                    if (i.skipCost) return s;
                    return s + costSub(i) + n(i.estimatedFreight);
                  }, 0);
                  onCreateInvoice(invoiceItems, totalCost);
                }}
              >
                <Receipt className="w-3 h-3" />Create Invoice ({selectedIds.size})
              </Button>
            )}
            {order.customerTable?.visible && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-blue-700" onClick={() => onSetCustomerTable({ ...order.customerTable!, visible: false })}>
                <EyeOff className="w-3 h-3" />Hide Customer Table
              </Button>
            )}
            {order.customerTable && !order.customerTable.visible && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-blue-700" onClick={() => onSetCustomerTable({ ...order.customerTable!, visible: true })}>
                <Eye className="w-3 h-3" />Show Customer Table
              </Button>
            )}
          </div>

          {/* Summary Cards */}
          {items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-t bg-muted/10">
              <div className="rounded-md border bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Qty</p>
                <p className="text-lg font-bold tabular-nums">{totalQty % 1 === 0 ? totalQty : fmt(totalQty)}</p>
                {hasBalanceItems && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    Incl. {items.filter(i => i.skipCost).reduce((s,i) => s + n(i.quantity), 0)} balance qty
                  </p>
                )}
              </div>
              <div className="rounded-md border bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {allBalance ? "Balance Collection" : "Order Value"}
                </p>
                {/* Primary: true order value (no balance-duplicate items) */}
                <p className="text-lg font-bold text-primary tabular-nums">${fmt(totalTrueValue)}</p>
                {/* Secondary: cash actually collected in this order */}
                {totalCashIn !== totalTrueValue && (
                  <p className="text-[10px] text-blue-700 tabular-nums font-medium">
                    {allBalance ? "Balance" : "Cash In"}: ${fmt(totalCashIn)}
                  </p>
                )}
                {hasBalanceItems && !allBalance && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">Excl. balance items</p>
                )}
                {allBalance && (
                  <p className="text-[10px] text-blue-600 tabular-nums">No new goods value</p>
                )}
              </div>
              <div className="rounded-md border bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Cost</p>
                <p className="text-lg font-bold text-orange-600 tabular-nums">${fmt(totalCost)}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">Cost: ${fmt(totalCostSub)} + Freight: ${fmt(totalFreight)}</p>
              </div>
              <div className="rounded-md border bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gross Profit</p>
                <p className={`text-lg font-bold tabular-nums ${totalTrueValue - totalCost >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  ${fmt(totalTrueValue - totalCost)}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">Order Value − Cost</p>
                {totalCashIn !== totalTrueValue && (
                  <p className={`text-[10px] font-medium tabular-nums mt-0.5 ${grossProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    Cash In − Cost: ${fmt(grossProfit)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Customer Table */}
          {order.customerTable?.visible && (
            <div className="p-3 border-t">
              <CustomerTable
                order={order}
                tabName={tabName}
                ctRows={order.customerTable.rows}
                onUpdateRow={updateCtRow}
                onClose={() => onSetCustomerTable({ ...order.customerTable!, visible: false })}
                onExportDelivery={exportCtDelivery}
                onSyncMissing={syncMissingToCustomerTable}
              />
            </div>
          )}
        </>
      )}

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="bg-white border rounded-lg shadow-xl py-1 min-w-[160px] text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2"
            onClick={() => { onCopyItem(ctxMenu.item); setCtxMenu(null); }}
          >
            📋 Copy item
          </button>
          <button
            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${copiedItem ? "hover:bg-muted" : "opacity-40 cursor-not-allowed"}`}
            onClick={() => {
              if (!copiedItem) return;
              onAddItemCopy({ ...copiedItem, id: crypto.randomUUID() });
              setCtxMenu(null);
            }}
          >
            📌 Paste item here {!copiedItem && "(nothing copied)"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Delivery Order Template ──────────────────────────────────────────────────

interface DeliveryTemplateRow {
  text: string;
  bold: boolean;
  fontSize: number;
  fontFamily: string;
}

interface DeliveryTemplate {
  headerRows: DeliveryTemplateRow[];
  footer: string;
  footerSize: number;
  shippingMarkBold: boolean;
  shippingMarkFontSize: number;
}

const DEFAULT_DELIVERY_TEMPLATE: DeliveryTemplate = {
  headerRows: [
    { text: "國華膠輪汽車用品", bold: true, fontSize: 11, fontFamily: "Arial" },
    { text: "Kwok Wah Tyre & Motoring Accessories Co.", bold: true, fontSize: 11, fontFamily: "Arial" },
    { text: "G/F, 290 Sai Yeung Choi Street North, Kowloon", bold: false, fontSize: 8, fontFamily: "Arial" },
    { text: "Tel: +852 23804092   Email: kwokwahtyre@biznetvigator.com", bold: false, fontSize: 8, fontFamily: "Arial" },
  ],
  footer: "Kwok Wah Tyre & Motoring Accessories Co",
  footerSize: 8,
  shippingMarkBold: true,
  shippingMarkFontSize: 13,
};

const DELIVERY_TEMPLATE_KEY = "delivery_order_template";

function loadDeliveryTemplate(): DeliveryTemplate {
  try {
    const raw = localStorage.getItem(DELIVERY_TEMPLATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.headerRows && Array.isArray(parsed.headerRows)) {
        return { ...DEFAULT_DELIVERY_TEMPLATE, ...parsed };
      }
      // migrate old flat format (line1-line4)
      if (parsed.line1 !== undefined) {
        return {
          headerRows: [
            { ...DEFAULT_DELIVERY_TEMPLATE.headerRows[0], text: parsed.line1 ?? DEFAULT_DELIVERY_TEMPLATE.headerRows[0].text },
            { ...DEFAULT_DELIVERY_TEMPLATE.headerRows[1], text: parsed.line2 ?? DEFAULT_DELIVERY_TEMPLATE.headerRows[1].text },
            { ...DEFAULT_DELIVERY_TEMPLATE.headerRows[2], text: parsed.line3 ?? DEFAULT_DELIVERY_TEMPLATE.headerRows[2].text },
            { ...DEFAULT_DELIVERY_TEMPLATE.headerRows[3], text: parsed.line4 ?? DEFAULT_DELIVERY_TEMPLATE.headerRows[3].text },
          ],
          footer: DEFAULT_DELIVERY_TEMPLATE.footer,
          footerSize: DEFAULT_DELIVERY_TEMPLATE.footerSize,
        };
      }
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_DELIVERY_TEMPLATE));
}

// ─── Delivery Order Word Export ───────────────────────────────────────────────

function exportDeliveryOrderToWord(
  rows: { item: OrderItem; unitType: string }[],
  tmpl: DeliveryTemplate,
  tabName: string,
  shippingNameOverride: string
) {
  const date = todayStr();
  const dateStr = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const shippingName = shippingNameOverride.trim() || tabName;

  const headerHtml = tmpl.headerRows.map((r) =>
    `<p style="font-family:${r.fontFamily},sans-serif;font-size:${r.fontSize}px;font-weight:${r.bold ? "bold" : "normal"};margin:2px 0;text-align:center;">${r.text}</p>`
  ).join("");

  const totalQty = rows.reduce((s, { item }) => s + n(item.quantity), 0);

  const bodyRows = rows.map(({ item, unitType }) => {
    const qty = n(item.quantity);
    return `
      <tr>
        <td style="text-align:center;white-space:nowrap">${numToWords(qty)} (${qty}) ${unitType || "pieces"}</td>
        <td>${item.brand}</td>
        <td>${item.description}</td>
        <td>${item.size}</td>
        <td>${item.type}</td>
      </tr>`;
  }).join("");

  const totalRow = `
    <tr>
      <td style="text-align:center;font-weight:bold">Total ${numToWords(totalQty)} (${totalQty}) pieces</td>
      <td></td><td></td><td></td><td></td>
    </tr>`;

  const html = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; }
  .doc-title { font-size: 13px; font-weight: bold; text-align: center; margin: 10px 0 4px; }
  .doc-date { text-align: left; font-size: 11px; margin-bottom: 10px; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 1px solid #333; padding: 4px 6px; font-size: 11px; font-family: Arial, sans-serif; }
  .footer { font-size: ${tmpl.footerSize}px; text-align: left; margin-top: 10px; }
</style>
</head>
<body>
<div class="header">${headerHtml}</div>
<div class="doc-title">Delivery Order</div>
<div class="doc-date">Date: ${dateStr}</div>
<div style="font-family:Arial,sans-serif;font-size:${tmpl.shippingMarkFontSize}px;font-weight:${tmpl.shippingMarkBold ? "bold" : "normal"};text-align:left;margin-bottom:10px;">Shipping Mark: ${shippingName}</div>
<table>
  <tbody>${bodyRows}${totalRow}</tbody>
</table>
<p class="footer">${tmpl.footer}</p>
</body>
</html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-word;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Delivery_Order_${date}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── DeliveryOrder Component ──────────────────────────────────────────────────

const DO_UNIT_OPTIONS = ["pieces", "box"];

function DeliveryOrderTable({
  rows,
  tabName,
  onUpdateUnitType,
  onClose,
}: {
  rows: { orderId: string; itemId: string; unitType: string; item: OrderItem }[];
  tabName: string;
  onUpdateUnitType: (itemId: string, unitType: string) => void;
  onClose: () => void;
}) {
  const doInputCls = "h-7 px-1 text-xs border-0 bg-transparent focus:bg-white focus:border focus:border-green-300 rounded w-full min-w-0";
  const [tmpl, setTmplState] = useState<DeliveryTemplate>(loadDeliveryTemplate);
  const [showTmpl, setShowTmpl] = useState(false);
  const [shippingNameOverride, setShippingNameOverride] = useState("");

  function updateRow(idx: number, patch: Partial<DeliveryTemplateRow>) {
    const next: DeliveryTemplate = {
      ...tmpl,
      headerRows: tmpl.headerRows.map((r, i) => i === idx ? { ...r, ...patch } : r),
    };
    setTmplState(next);
    localStorage.setItem(DELIVERY_TEMPLATE_KEY, JSON.stringify(next));
  }

  function updateShipping(patch: Partial<Pick<DeliveryTemplate, "shippingMarkBold" | "shippingMarkFontSize">>) {
    const next = { ...tmpl, ...patch };
    setTmplState(next);
    localStorage.setItem(DELIVERY_TEMPLATE_KEY, JSON.stringify(next));
  }

  function updateFooter(patch: Partial<Pick<DeliveryTemplate, "footer" | "footerSize">>) {
    const next = { ...tmpl, ...patch };
    setTmplState(next);
    localStorage.setItem(DELIVERY_TEMPLATE_KEY, JSON.stringify(next));
  }

  function resetTmpl() {
    const def = JSON.parse(JSON.stringify(DEFAULT_DELIVERY_TEMPLATE));
    setTmplState(def);
    localStorage.setItem(DELIVERY_TEMPLATE_KEY, JSON.stringify(def));
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-green-50/10">
      <div className="flex items-center justify-between px-3 py-2 bg-green-100/60 border-b">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-green-700" />
          <span className="font-semibold text-sm text-green-800">Delivery Order</span>
          <span className="text-xs text-muted-foreground">({rows.length} item{rows.length !== 1 ? "s" : ""})</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showTmpl ? "default" : "outline"}
            className={`h-7 text-xs gap-1 ${showTmpl ? "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
            onClick={() => setShowTmpl((v) => !v)}
          >
            <FileText className="w-3 h-3" />Template
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => exportDeliveryOrderToWord(rows, tmpl, tabName, shippingNameOverride)}
          >
            <FileText className="w-3 h-3" />Export Word
          </Button>
          <button onClick={onClose} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Template editor */}
      {showTmpl && (
        <div className="px-4 py-3 bg-amber-50/60 border-b space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">Header Template — changes save automatically</span>
            <button className="text-xs text-muted-foreground hover:text-amber-700 underline" onClick={resetTmpl}>
              Reset to default
            </button>
          </div>

          {/* Header rows */}
          {tmpl.headerRows.map((row, i) => (
            <div key={i} className="space-y-1">
              <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Row {i + 1}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  className="flex-1 min-w-[160px] h-7 text-xs border rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={row.text}
                  onChange={(e) => updateRow(i, { text: e.target.value })}
                  placeholder={`Row ${i + 1} text`}
                />
                <select
                  className="h-7 text-xs border rounded px-1 bg-white"
                  value={row.fontFamily}
                  onChange={(e) => updateRow(i, { fontFamily: e.target.value })}
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Helvetica">Helvetica</option>
                </select>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-muted-foreground">Size</label>
                  <input
                    type="number"
                    min={6}
                    max={36}
                    className="w-14 h-7 text-xs border rounded px-1 bg-white text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                    value={row.fontSize}
                    onChange={(e) => updateRow(i, { fontSize: Number(e.target.value) || row.fontSize })}
                  />
                  <span className="text-[10px] text-muted-foreground">px</span>
                </div>
                <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={row.bold}
                    onChange={(e) => updateRow(i, { bold: e.target.checked })}
                    className="accent-amber-500"
                  />
                  <span className="font-semibold">Bold</span>
                </label>
              </div>
            </div>
          ))}

          {/* Shipping Mark */}
          <div className="border-t border-amber-200 pt-2 space-y-1">
            <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Shipping Mark (under date)</span>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">Shipping Mark:</span>
              </div>
              <input
                className="flex-1 min-w-[160px] h-7 text-xs border rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                value={shippingNameOverride}
                onChange={(e) => setShippingNameOverride(e.target.value)}
                placeholder={`defaults to tab name: "${tabName}"`}
              />
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground">Size</label>
                <input
                  type="number"
                  min={6}
                  max={36}
                  className="w-14 h-7 text-xs border rounded px-1 bg-white text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={tmpl.shippingMarkFontSize}
                  onChange={(e) => updateShipping({ shippingMarkFontSize: Number(e.target.value) || tmpl.shippingMarkFontSize })}
                />
                <span className="text-[10px] text-muted-foreground">px</span>
              </div>
              <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={tmpl.shippingMarkBold}
                  onChange={(e) => updateShipping({ shippingMarkBold: e.target.checked })}
                  className="accent-amber-500"
                />
                <span className="font-semibold">Bold</span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-amber-200 pt-2 space-y-1">
            <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Footer (after table)</span>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                className="flex-1 min-w-[160px] h-7 text-xs border rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                value={tmpl.footer}
                onChange={(e) => updateFooter({ footer: e.target.value })}
                placeholder="Footer text"
              />
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground">Size</label>
                <input
                  type="number"
                  min={6}
                  max={24}
                  className="w-14 h-7 text-xs border rounded px-1 bg-white text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={tmpl.footerSize}
                  onChange={(e) => updateFooter({ footerSize: Number(e.target.value) || tmpl.footerSize })}
                />
                <span className="text-[10px] text-muted-foreground">px</span>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "700px" }}>
          <thead>
            <tr className="bg-green-100/40 text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">
              <th className="px-2 py-2 text-center border-r w-8">No.</th>
              <th className="px-2 py-2 text-center border-r w-32">Quantity</th>
              <th className="px-2 py-2 text-center border-r w-32">Unit</th>
              <th className="px-2 py-2 text-left border-r w-28">Brand</th>
              <th className="px-2 py-2 text-left border-r">Description</th>
              <th className="px-2 py-2 text-left border-r w-28">Size</th>
              <th className="px-2 py-2 text-left w-24">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, unitType, itemId }, idx) => {
              const qty = n(item.quantity);
              const isCustom = !DO_UNIT_OPTIONS.includes(unitType);
              return (
                <tr key={itemId} className="border-t hover:bg-green-50/40">
                  <td className="px-2 py-1 text-center border-r text-muted-foreground">{idx + 1}</td>
                  <td className="px-2 py-1 text-center border-r font-medium">
                    <div>{numToWords(qty)}</div>
                    <div className="text-muted-foreground">({qty})</div>
                  </td>
                  <td className="px-0.5 py-0.5 border-r">
                    <div className="flex gap-0.5">
                      <select
                        value={isCustom ? "__custom__" : unitType}
                        onChange={(e) => {
                          if (e.target.value === "__custom__") {
                            onUpdateUnitType(itemId, "");
                          } else {
                            onUpdateUnitType(itemId, e.target.value);
                          }
                        }}
                        className="h-7 text-xs border rounded px-1 bg-transparent"
                      >
                        {DO_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                        <option value="__custom__">Custom</option>
                      </select>
                      {isCustom && (
                        <input
                          className={doInputCls}
                          value={unitType}
                          onChange={(e) => onUpdateUnitType(itemId, e.target.value)}
                          placeholder="type unit…"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1 border-r">{item.brand || "—"}</td>
                  <td className="px-2 py-1 border-r">{item.description || "—"}</td>
                  <td className="px-2 py-1 border-r">{item.size || "—"}</td>
                  <td className="px-2 py-1">{item.type || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Order Page ──────────────────────────────────────────────────────────

export default function Order() {
  const [tabs, setTabsState] = useState<ClientTab[]>(loadTabs);
  const [activeTabId, setActiveTabId] = useState<string>(() => loadTabs()[0]?.id ?? "");
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [syncStatus, setSyncStatus] = useState<"saved" | "saving" | "local">("saved");
  const [deliveryMode, setDeliveryMode] = useState(false);
  const [deliverySelected, setDeliverySelected] = useState<Map<string, Set<string>>>(new Map()); // orderId → Set<itemId>
  const [copiedItem, setCopiedItem] = useState<OrderItem | null>(null);
  const [selectedIdsByOrder, setSelectedIdsByOrder] = useState<Record<string, Set<string>>>({});
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => loadTabs()[0]?.orders[0]?.id ?? null);
  const [orderNavCollapsed, setOrderNavCollapsed] = useState(() => localStorage.getItem("order_nav_collapsed") === "1");
  const keyboardClipboard = useRef<OrderItem[]>([]);
  const [deliveryUnits, setDeliveryUnits] = useState<Record<string, string>>({}); // itemId → unitType
  const [showDeliveryOrder, setShowDeliveryOrder] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<{
    open: boolean;
    items: PrefilledInvoiceItem[];
    cost: number;
    customerName: string;
  }>({ open: false, items: [], cost: 0, customerName: "" });

  const skipNextSave = useRef(false);
  const serverDataApplied = useRef(false);
  const serverCheckDone = useRef(false);
  const lastSyncedJson = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStoreRef = useRef<OrderStore | null>(null);
  const saveInFlightRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const retryPausedForAuthRef = useRef(false);
  const lastAuthRetryAtRef = useRef(0);
  const mountedRef = useRef(true);
  const saveToServerRef = useRef<(store: OrderStore) => void>(() => {});
  // Tracks when local data was last modified by the user (not by server sync)
  const localUpdatedAt = useRef<number>(loadLocalStore().updatedAt);

  // ── Load from server ──
  const { data: serverData } = useQuery<{ data: OrderStore | ClientTab[] | null }>({
    queryKey: ["/api/order-store"],
    staleTime: 25_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Count total items across all tabs/orders — used to prefer the richer dataset on conflict
  function countItems(tabList: ClientTab[]): number {
    return tabList.reduce((s, t) => s + t.orders.reduce((os, o) => os + o.items.length, 0), 0);
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!serverData) return;
    serverCheckDone.current = true;
    const sRaw = serverData.data;

    // Parse server payload — old format = plain array, new format = { tabs, updatedAt }
    let serverTabs: ClientTab[] | null = null;
    let serverUpdatedAt = 0;
    if (Array.isArray(sRaw)) {
      serverTabs = sRaw;
      serverUpdatedAt = 0;
    } else if (sRaw && Array.isArray((sRaw as OrderStore).tabs)) {
      serverTabs = (sRaw as OrderStore).tabs;
      serverUpdatedAt = (sRaw as OrderStore).updatedAt || 0;
    }
    if (!serverTabs || serverTabs.length === 0) {
      // An empty server is still a completed reconciliation. Preserve and
      // publish an existing local workspace rather than waiting for a tab edit.
      const localStore = latestStoreRef.current ?? { tabs, updatedAt: localUpdatedAt.current };
      if (localStore.updatedAt > 0 && !saveTimerRef.current && !saveInFlightRef.current) {
        setSyncStatus("saving");
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null;
          saveToServerRef.current(localStore);
        }, 1500);
      }
      return;
    }

    const incomingJson = JSON.stringify(serverTabs);
    const isFirstLoad = !serverDataApplied.current;

    if (isFirstLoad) {
      serverDataApplied.current = true;
      const serverItemCount = countItems(serverTabs);
      const localItemCount = countItems(tabs);
      // Server wins if: strictly newer timestamp, OR same/unknown timestamp but server has more items
      // (protects against device clocks skew or laptop overwriting richer server data)
      const serverIsNewer = serverUpdatedAt > localUpdatedAt.current;
      const serverIsRicher = serverUpdatedAt === localUpdatedAt.current && serverItemCount > localItemCount;
      const localIsEmptyish = localUpdatedAt.current === 0;
      if (serverIsNewer || serverIsRicher || localIsEmptyish) {
        lastSyncedJson.current = incomingJson;
        localUpdatedAt.current = serverUpdatedAt;
        skipNextSave.current = true;
        setTabsState(serverTabs);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: serverTabs, updatedAt: serverUpdatedAt }));
        if (!serverTabs.find((t) => t.id === activeTabId)) setActiveTabId(serverTabs[0].id);
      } else {
        // Local is newer → keep local, mark server json as "seen"
        lastSyncedJson.current = incomingJson;
        // The initial tabs effect may have run before the server check completed.
        // Explicitly queue the retained local snapshot now.
        const localStore = latestStoreRef.current ?? { tabs, updatedAt: localUpdatedAt.current };
        if (localUpdatedAt.current > serverUpdatedAt) {
          setSyncStatus("saving");
          if (!saveTimerRef.current && !saveInFlightRef.current) {
            saveTimerRef.current = setTimeout(() => {
              saveTimerRef.current = null;
              saveToServerRef.current(localStore);
            }, 1500);
          }
        }
      }
      return;
    }

    // Subsequent polls (cross-device live sync)
    const serverHasNewData = incomingJson !== lastSyncedJson.current;
    const noPendingEdits = syncStatus === "saved";
    if (!serverHasNewData || !noPendingEdits) return;
    // Only apply if server is strictly newer than local
    if (serverUpdatedAt <= localUpdatedAt.current) return;

    lastSyncedJson.current = incomingJson;
    localUpdatedAt.current = serverUpdatedAt;
    skipNextSave.current = true;
    setTabsState(serverTabs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: serverTabs, updatedAt: serverUpdatedAt }));
    if (!serverTabs.find((t) => t.id === activeTabId)) setActiveTabId(serverTabs[0].id);
  }, [serverData, syncStatus]);

  // ── Save to server ──
  const { mutate: saveToServer } = useMutation({
    mutationFn: (store: OrderStore) => {
      saveInFlightRef.current = true;
      return apiRequest("PUT", "/api/order-store", { data: store });
    },
    onSuccess: (_, savedStore) => {
      saveInFlightRef.current = false;
      retryAttemptRef.current = 0;
      retryPausedForAuthRef.current = false;
      // A request can complete after a newer local edit. Never acknowledge the
      // older response as the current state.
      const isCurrent = savedStore.updatedAt === localUpdatedAt.current
        && JSON.stringify(savedStore.tabs) === JSON.stringify(latestStoreRef.current?.tabs);
      if (isCurrent) {
        setSyncStatus("saved");
        lastSyncedJson.current = JSON.stringify(savedStore.tabs);
        queryClient.setQueryData(["/api/order-store"], { data: savedStore });
      } else if (mountedRef.current) {
        setSyncStatus("saving");
      }
    },
    onError: (error) => {
      saveInFlightRef.current = false;
      const isUnauthorized = error instanceof Error && /^401(?:\s|:)/.test(error.message);
      retryPausedForAuthRef.current = isUnauthorized;
      if (isUnauthorized) lastAuthRetryAtRef.current = Date.now();
      if (mountedRef.current) setSyncStatus("local");
      // Authentication failures are deliberately not retried on a tight loop.
      if (!isUnauthorized) {
        const delay = Math.min(60_000, 2_000 * 2 ** retryAttemptRef.current++);
        if (!retryTimerRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            const latest = latestStoreRef.current;
            if (latest && !saveInFlightRef.current) {
              setSyncStatus("saving");
              saveToServer(latest);
            }
          }, delay);
        }
      }
    },
  });
  saveToServerRef.current = saveToServer;

  // ── Watch tabs: write localStorage + debounce server save ──
  useEffect(() => {
    // Always cancel any pending save first — prevents stale closures from firing
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Don't save until we know what the server has (prevents phone overwriting PC data on open)
    if (!serverCheckDone.current) {
      // Still persist locally (preserve across page refreshes) but keep existing timestamp
      const localStore = { tabs, updatedAt: localUpdatedAt.current };
      latestStoreRef.current = localStore;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localStore));
      return;
    }
    if (skipNextSave.current) {
      // Server sync applied — save to localStorage but don't reset the user's timestamp
      skipNextSave.current = false;
      const localStore = { tabs, updatedAt: localUpdatedAt.current };
      latestStoreRef.current = localStore;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localStore));
      return;
    }
    // Real user edit — stamp with current time
    const now = Date.now();
    localUpdatedAt.current = now;
    const store: OrderStore = { tabs, updatedAt: now };
    latestStoreRef.current = store;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    setSyncStatus("saving");
    saveTimerRef.current = setTimeout(() => saveToServer(store), 1500);
  }, [tabs]);

  // Retry the current local snapshot when connectivity or attention returns.
  useEffect(() => {
    const retryLatest = () => {
      if (!serverCheckDone.current || saveInFlightRef.current) return;
      if (retryPausedForAuthRef.current && Date.now() - lastAuthRetryAtRef.current < 10_000) return;
      const latest = latestStoreRef.current;
      if (!latest || latest.updatedAt !== localUpdatedAt.current) return;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      retryPausedForAuthRef.current = false;
      setSyncStatus("saving");
      saveToServer(latest);
    };
    window.addEventListener("online", retryLatest);
    window.addEventListener("focus", retryLatest);
    return () => {
      window.removeEventListener("online", retryLatest);
      window.removeEventListener("focus", retryLatest);
    };
  }, [saveToServer]);

  function setTabs(fn: ClientTab[] | ((prev: ClientTab[]) => ClientTab[])) {
    setTabsState(fn as any);
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const selectedOrder = activeTab?.orders.find((o) => o.id === selectedOrderId) ?? activeTab?.orders[0];

  // Keep the workspace selection valid as tabs/orders are replaced or removed.
  useEffect(() => {
    if (!activeTab) {
      setSelectedOrderId(null);
      return;
    }
    setSelectedOrderId((current) =>
      current && activeTab.orders.some((o) => o.id === current)
        ? current
        : activeTab.orders[0]?.id ?? null
    );
    setSelectedIdsByOrder((current) => {
      const valid = new Set(activeTab.orders.map((o) => o.id));
      const next: Record<string, Set<string>> = {};
      Object.entries(current).forEach(([orderId, ids]) => {
        if (!valid.has(orderId)) return;
        const order = activeTab.orders.find((o) => o.id === orderId)!;
        const itemIds = new Set(order.items.map((item) => item.id));
        const pruned = new Set(Array.from(ids).filter((id) => itemIds.has(id)));
        if (pruned.size) next[orderId] = pruned;
      });
      return next;
    });
  }, [activeTabId, tabs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !selectedOrder) return;
      const target = event.target as HTMLElement | null;
      const isTextEntryTarget = target && (
        target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
        || target.isContentEditable
        || (
          target.tagName === "INPUT"
          && !["checkbox", "radio", "button", "submit", "reset"].includes((target as HTMLInputElement).type)
        )
      );
      if (isTextEntryTarget) return;
      const key = event.key.toLowerCase();
      const selected = selectedOrder.items.filter((item) => selectedIdsByOrder[selectedOrder.id]?.has(item.id));
      if (key === "c" && selected.length) {
        event.preventDefault();
        keyboardClipboard.current = selected.map((item) => ({ ...item }));
        setCopiedItem({ ...selected[0] });
        toast({ title: `${selected.length} item${selected.length === 1 ? "" : "s"} copied` });
      } else if (key === "v" && keyboardClipboard.current.length) {
        event.preventDefault();
        keyboardClipboard.current.forEach((item) => addItemCopy(selectedOrder.id, item));
        toast({ title: `${keyboardClipboard.current.length} item${keyboardClipboard.current.length === 1 ? "" : "s"} pasted` });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedOrder, selectedIdsByOrder]);

  function mutateActiveTab(fn: (tab: ClientTab) => ClientTab) {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? fn(t) : t)));
  }

  function mutateOrder(orderId: string, fn: (o: PurchaseOrder) => PurchaseOrder) {
    mutateActiveTab((tab) => ({ ...tab, orders: tab.orders.map((o) => (o.id === orderId ? fn(o) : o)) }));
  }

  function updateItem(orderId: string, itemId: string, field: keyof OrderItem, value: string) {
    mutateOrder(orderId, (o) => ({ ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)) }));
  }

  function addItem(orderId: string) {
    mutateOrder(orderId, (o) => ({ ...o, items: [...o.items, blankItem()] }));
  }

  function addItemCopy(orderId: string, item: OrderItem) {
    mutateOrder(orderId, (o) => ({ ...o, items: [...o.items, { ...item, id: crypto.randomUUID() }] }));
  }

  function removeItem(orderId: string, itemId: string) {
    mutateOrder(orderId, (o) => ({ ...o, items: o.items.filter((i) => i.id !== itemId) }));
  }

  function updateOrder(orderId: string, field: keyof PurchaseOrder, value: any) {
    mutateOrder(orderId, (o) => ({ ...o, [field]: value }));
  }

  function deleteOrder(orderId: string) {
    setSelectedIdsByOrder((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    mutateActiveTab((tab) => ({ ...tab, orders: tab.orders.filter((o) => o.id !== orderId) }));
  }

  function toggleCollapse(orderId: string) {
    mutateOrder(orderId, (o) => ({ ...o, collapsed: !o.collapsed }));
  }

  function setCustomerTable(orderId: string, ct: CustomerTable | undefined) {
    mutateOrder(orderId, (o) => ({ ...o, customerTable: ct }));
  }

  function addNewOrder() {
    const nextOrderNumber = Math.max(
      0,
      ...(activeTab?.orders.map((order) => {
        const parsed = Number.parseInt(order.orderNumber.replace(/\D/g, ""), 10);
        return Number.isFinite(parsed) ? parsed : 0;
      }) ?? []),
    ) + 1;
    const order = blankOrder(nextOrderNumber);
    setSelectedOrderId(order.id);
    mutateActiveTab((tab) => ({ ...tab, orders: [...tab.orders, order] }));
  }

  function toggleDeliveryItem(orderId: string, itemId: string) {
    setDeliverySelected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(orderId) ?? []);
      if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
      if (set.size === 0) next.delete(orderId); else next.set(orderId, set);
      return next;
    });
  }

  const totalDeliverySelected = Array.from(deliverySelected.values()).reduce((s, set) => s + set.size, 0);

  function getDeliveryDisplayRows() {
    const result: { orderId: string; itemId: string; unitType: string; item: OrderItem }[] = [];
    for (const [orderId, itemIds] of deliverySelected.entries()) {
      for (const tab of tabs) {
        const order = tab.orders.find((o) => o.id === orderId);
        if (!order) continue;
        for (const itemId of itemIds) {
          const item = order.items.find((i) => i.id === itemId);
          if (item) result.push({ orderId, itemId, unitType: deliveryUnits[itemId] ?? "pieces", item });
        }
      }
    }
    return result;
  }

  function generateDeliveryOrder() {
    setShowDeliveryOrder(true);
    setDeliveryMode(false);
  }

  function cancelDeliveryMode() {
    setDeliveryMode(false);
    setDeliverySelected(new Map());
  }

  function addTab() {
    const name = newTabName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setTabs((prev) => [...prev, { id, name, orders: [blankOrder(1)] }]);
    setActiveTabId(id);
    setNewTabName("");
    setAddingTab(false);
  }

  function removeTab(tabId: string) {
    if (tabs.length === 1) return;
    const remaining = tabs.filter((t) => t.id !== tabId);
    setTabs(remaining);
    if (activeTabId === tabId) setActiveTabId(remaining[0].id);
  }

  function exportToExcel() {
    if (!activeTab) return;
    const wb = XLSX.utils.book_new();
    const headers = ["Order", "Date", "#", "Brand", "Description", "Size", "Type", "Price", "Qty", "Subtotal", "Deposit Mode", "Deposit Input", "Deposit Amount", "Remark", "Cost", "Cost Qty", "Cost Subtotal", "Est. Freight", "Total Cost"];
    const rows: any[][] = [headers];
    activeTab.orders.forEach((order) => {
      order.items.forEach((item, idx) => {
        const sub = n(item.price) * n(item.quantity);
        const dep = depositAmt(item);
        const cSub = costSub(item);
        const fr = n(item.estimatedFreight);
        rows.push([order.orderNumber, order.orderDate, idx + 1, item.brand, item.description, item.size, item.type, n(item.price) || "", n(item.quantity) || "", sub || "", item.depositMode, n(item.deposit) || "", dep || "", item.remark?.trim() || "", n(item.cost) || "", n(item.costQty) || "", cSub || "", fr || "", (cSub + fr) || ""]);
      });
      rows.push([]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 4 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, activeTab.name.slice(0, 31).replace(/[\\/?*[\]]/g, "_"));
    XLSX.writeFile(wb, `Order_${activeTab.name}_${todayStr()}.xlsx`);
  }

  return (
    <div className="p-3 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold">Order</h1>
          {syncStatus === "saving" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />Saving…
            </span>
          )}
          {syncStatus === "saved" && serverDataApplied.current && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Cloud className="w-3 h-3" />Saved
            </span>
          )}
          {syncStatus === "local" && (
            <button
              className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
              title="Your edits are safely saved on this device. Retry remote save."
              onClick={() => {
                const latest = latestStoreRef.current;
                if (!latest || saveInFlightRef.current) return;
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
                retryPausedForAuthRef.current = false;
                retryAttemptRef.current = 0;
                setSyncStatus("saving");
                saveToServer(latest);
              }}
            >
              <CloudOff className="w-3 h-3" />Saved locally · Retry
            </button>
          )}
          <button
            title="Force reload all data from server (use if items appear missing on this device)"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            onClick={() => {
              localUpdatedAt.current = 0;
              serverDataApplied.current = false;
              lastSyncedJson.current = "";
              queryClient.invalidateQueries({ queryKey: ["/api/order-store"] });
            }}
          >
            <Cloud className="w-3 h-3" />↓ Reload
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={deliveryMode ? "default" : "outline"}
            onClick={() => {
              if (deliveryMode) {
                cancelDeliveryMode();
              } else {
                setDeliveryMode(true);
                setShowDeliveryOrder(false);
              }
            }}
            className={`gap-1.5 ${deliveryMode ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : "border-green-300 text-green-700 hover:bg-green-50"}`}
          >
            <Truck className="w-4 h-4" />Delivery Order
          </Button>
          <Button size="sm" variant="outline" onClick={exportToExcel} className="gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />Export Excel
          </Button>
        </div>
      </div>

      {/* Delivery Mode Banner */}
      {deliveryMode && (
        <div className="flex items-center gap-3 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <Truck className="w-4 h-4 text-green-600 shrink-0" />
          <span className="text-green-800 font-medium">
            {totalDeliverySelected === 0
              ? "Select items to include in the delivery order"
              : `${totalDeliverySelected} item${totalDeliverySelected !== 1 ? "s" : ""} selected`}
          </span>
          {totalDeliverySelected > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs px-3 bg-green-600 hover:bg-green-700 gap-1"
              onClick={generateDeliveryOrder}
            >
              <FileText className="w-3 h-3" />Create Delivery Order
            </Button>
          )}
          <button className="ml-auto text-muted-foreground hover:text-foreground text-xs" onClick={cancelDeliveryMode}>
            Cancel
          </button>
        </div>
      )}

      {/* Client Tabs */}
      <div className="flex items-center gap-0 flex-wrap border-b">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group relative flex items-center gap-1 px-3 py-2 text-sm font-medium cursor-pointer border-b-2 transition-colors ${activeTabId === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.name}
            {tabs.length > 1 && (
              <button className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-destructive transition-opacity" onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {addingTab ? (
          <div className="flex items-center gap-1 px-2 py-1">
            <Input autoFocus value={newTabName} onChange={(e) => setNewTabName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTab(); if (e.key === "Escape") { setAddingTab(false); setNewTabName(""); } }} placeholder="Client name" className="h-7 w-32 text-sm" />
            <Button size="sm" className="h-7 text-xs" onClick={addTab}>Add</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingTab(false); setNewTabName(""); }}>Cancel</Button>
          </div>
        ) : (
          <button className="flex items-center px-2 py-2 text-muted-foreground hover:text-foreground border-b-2 border-transparent" onClick={() => setAddingTab(true)}>
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab-level summary — aggregates across all orders, deduplicates balance items */}
      {activeTab && activeTab.orders.length > 0 && (() => {
        const allItems = activeTab.orders.flatMap((o) => o.items);
        if (allItems.length === 0) return null;
        const tabTrueValue = allItems.reduce((s, i) => i.skipCost ? s : s + n(i.price) * n(i.quantity), 0);
        const tabCashIn = allItems.reduce((s, i) => {
          const sub = n(i.price) * n(i.quantity);
          const dep = depositAmt(i);
          if (dep > 0 && i.skipCost) return s + (sub - dep);
          if (dep > 0 && !i.skipCost) return s + dep;
          return s + sub;
        }, 0);
        const tabCost = allItems.reduce((s, i) => i.skipCost ? s : s + costSub(i) + n(i.estimatedFreight), 0);
        const tabProfit = tabTrueValue - tabCost;
        const hasMultipleOrders = activeTab.orders.length > 1;
        return (
          <div className="rounded-md border bg-muted/20 px-3 py-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide self-center">
              {activeTab.name} — All Orders
            </span>
            <span className="tabular-nums">
              <span className="text-muted-foreground text-xs">Order Value </span>
              <span className="font-bold text-primary">${fmt(tabTrueValue)}</span>
            </span>
            {tabCashIn !== tabTrueValue && (
              <span className="tabular-nums">
                <span className="text-muted-foreground text-xs">Cash In </span>
                <span className="font-semibold text-blue-700">${fmt(tabCashIn)}</span>
              </span>
            )}
            <span className="tabular-nums">
              <span className="text-muted-foreground text-xs">Cost </span>
              <span className="font-semibold text-orange-600">${fmt(tabCost)}</span>
            </span>
            <span className="tabular-nums">
              <span className="text-muted-foreground text-xs">Gross Profit </span>
              <span className={`font-bold ${tabProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>${fmt(tabProfit)}</span>
            </span>
            {hasMultipleOrders && (
              <span className="text-[10px] text-muted-foreground self-center ml-auto">
                {activeTab.orders.length} orders · balance items excluded from Order Value
              </span>
            )}
          </div>
        );
      })()}

      {/* Orders workspace */}
      {activeTab && (
        <div className="flex items-start gap-2 sm:gap-3 min-w-0">
          <aside className={`${orderNavCollapsed ? "w-9" : "w-28 sm:w-36"} shrink-0 border rounded-lg bg-muted/20 overflow-hidden transition-[width]`}>
            <div className="flex items-center justify-between px-2 py-2 border-b bg-muted/40">
              {!orderNavCollapsed && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Orders</span>}
              <button
                className="text-xs text-muted-foreground hover:text-foreground ml-auto"
                title={orderNavCollapsed ? "Expand order navigator" : "Minimize order navigator"}
                onClick={() => {
                  const next = !orderNavCollapsed;
                  setOrderNavCollapsed(next);
                  localStorage.setItem("order_nav_collapsed", next ? "1" : "0");
                }}
              >{orderNavCollapsed ? "›" : "‹"}</button>
            </div>
            <div className="p-1 space-y-1">
              {activeTab.orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  title={`${order.orderNumber} · ${order.orderDate} · ${order.items.length} items`}
                  className={`w-full text-left rounded px-2 py-1.5 text-xs transition-colors ${selectedOrder?.id === order.id ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-foreground"}`}
                >
                  {orderNavCollapsed ? <span className="block text-center font-semibold">{order.orderNumber.replace("#", "")}</span> : (
                    <>
                      <span className="block font-semibold truncate">{order.orderNumber}</span>
                      <span className={`block text-[10px] truncate ${selectedOrder?.id === order.id ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{order.orderDate} · {order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </aside>
          <div className="min-w-0 flex-1 space-y-2">
          <div className="text-[10px] text-muted-foreground px-1">Select rows, then <kbd className="border rounded px-1">Ctrl/Cmd+C</kbd> to copy and <kbd className="border rounded px-1">Ctrl/Cmd+V</kbd> to paste.</div>
          {selectedOrder && (
            <OrderBlock
              key={selectedOrder.id}
              order={selectedOrder}
              tabName={activeTab.name}
              onUpdateItem={(itemId, field, value) => updateItem(selectedOrder.id, itemId, field, value)}
              onAddItem={() => addItem(selectedOrder.id)}
              onAddItemCopy={(item) => addItemCopy(selectedOrder.id, item)}
              onRemoveItem={(itemId) => removeItem(selectedOrder.id, itemId)}
              onUpdateOrder={(field, value) => updateOrder(selectedOrder.id, field, value)}
              onDeleteOrder={() => deleteOrder(selectedOrder.id)}
              onToggleCollapse={() => toggleCollapse(selectedOrder.id)}
              onSetCustomerTable={(ct) => setCustomerTable(selectedOrder.id, ct)}
              canDelete={activeTab.orders.length > 1}
              deliveryMode={deliveryMode}
              deliverySelectedIds={deliverySelected.get(selectedOrder.id)}
              onToggleDelivery={(itemId) => toggleDeliveryItem(selectedOrder.id, itemId)}
              copiedItem={copiedItem}
              onCopyItem={(item) => {
                setCopiedItem(item);
                keyboardClipboard.current = [{ ...item }];
              }}
              selectedIds={selectedIdsByOrder[selectedOrder.id] ?? new Set()}
              onSelectedIdsChange={(ids) => setSelectedIdsByOrder((prev) => ({ ...prev, [selectedOrder.id]: ids }))}
              onCreateInvoice={(invoiceItems, cost) =>
                setInvoiceModal({ open: true, items: invoiceItems, cost, customerName: activeTab.name })
              }
            />
          )}

          <div className="pt-2">
            <Button variant="outline" onClick={addNewOrder} className="w-full border-dashed gap-2">
              <Plus className="w-4 h-4" />New Order
            </Button>
          </div>
          </div>
        </div>
      )}

      {/* Delivery Order Table */}
      {showDeliveryOrder && (() => {
        const rows = getDeliveryDisplayRows();
        return rows.length > 0 ? (
          <DeliveryOrderTable
            rows={rows}
            tabName={activeTab?.name ?? ""}
            onUpdateUnitType={(itemId, unitType) =>
              setDeliveryUnits((prev) => ({ ...prev, [itemId]: unitType }))
            }
            onClose={() => setShowDeliveryOrder(false)}
          />
        ) : null;
      })()}

      {/* Create Invoice Modal — opened when items are selected from an order */}
      <CreateInvoiceModal
        isOpen={invoiceModal.open}
        onClose={() => setInvoiceModal((m) => ({ ...m, open: false }))}
        initialItems={invoiceModal.items}
        initialCost={invoiceModal.cost}
        initialCustomerName={invoiceModal.customerName}
      />
    </div>
  );
}
