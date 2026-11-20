import { 
  type InventoryItem, 
  type InventoryItemWithDotUnits,
  type InventoryDotUnit,
  type InsertInventoryItem,
  type Invoice,
  type InsertInvoice,
  type InvoiceItem,
  type InsertInvoiceItem,
  type InvoiceWithItems,
  type User,
  type InsertUser,
  type SupplyItem,
  type InsertSupplyItem,
  type SupplierDirectory,
  type InsertSupplierDirectory,
  type SupplyItemWithSuppliers,
  type Expense,
  type InsertExpense,
  type ExpenseSettings,
  inventoryItems,
  inventoryDotUnits,
  invoices,
  invoiceItems,
  users,
  supplyItems,
  supplierDirectory,
  supplyItemSuppliers,
  expenses,
  expenseSettings,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { and, eq, desc, gte, inArray, sql } from "drizzle-orm";
import { InvoiceNumberRepairError, type InvoiceNumberChange } from "@shared/invoice-number-repair";

export type InvoiceItemWithInventoryRef = InsertInvoiceItem & {
  inventoryItemId?: string;
  dotUnitIds?: string[];
  skipInventory?: boolean;
};

type InventoryItemUpdates = Omit<Partial<InsertInventoryItem>, "costPrice" | "sellingPrice"> & {
  costPrice?: number | null;
  sellingPrice?: number | null;
};

type DotUnitInput = {
  id?: string;
  dotCode: string;
  atWarehouse: boolean;
};

export interface IStorage {
  // Inventory methods
  getInventoryItems(): Promise<InventoryItemWithDotUnits[]>;
  getInventoryItem(id: string): Promise<InventoryItemWithDotUnits | undefined>;
  createInventoryItem(item: InsertInventoryItem, dotUnits?: DotUnitInput[]): Promise<InventoryItemWithDotUnits>;
  updateInventoryItem(id: string, updates: InventoryItemUpdates, dotUnits?: DotUnitInput[]): Promise<InventoryItemWithDotUnits | undefined>;
  deleteInventoryItem(id: string): Promise<boolean>;
  updateInventoryQuantity(id: string, quantity: number): Promise<boolean>;
  bulkUpdateInventory(items: InsertInventoryItem[]): Promise<boolean>;

  // Invoice methods
  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<InvoiceWithItems | undefined>;
  createInvoice(invoice: InsertInvoice, items: InvoiceItemWithInventoryRef[]): Promise<InvoiceWithItems>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>, items: InsertInvoiceItem[]): Promise<InvoiceWithItems | undefined>;
  repairInvoiceNumbers(changes: InvoiceNumberChange[]): Promise<number>;
  updateInvoiceStatus(id: string, status: string): Promise<boolean>;
  deleteInvoice(id: string): Promise<boolean>;

  // Invoice items methods
  getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]>;
  getInvoicesWithItems(): Promise<InvoiceWithItems[]>;

  // Profit calculation methods
  updateInvoiceProfit(id: string, cost: number): Promise<boolean>;

  // Follow-up methods
  updateInvoiceFollowUp(id: string, followUpRequired: number, paymentReceivedDate?: string | null): Promise<boolean>;
  batchUpdateInvoiceFollowUp(ids: string[], followUpRequired: number, paymentReceivedDate?: string | null): Promise<boolean>;
  getFollowUpInvoices(): Promise<Invoice[]>;

  // User authentication methods
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, newPassword: string): Promise<boolean>;

  // Supply methods
  getSupplyItems(): Promise<SupplyItem[]>;
  getSupplyItemsWithSuppliers(): Promise<SupplyItemWithSuppliers[]>;
  createSupplyItem(item: InsertSupplyItem): Promise<SupplyItem>;
  updateSupplyItem(id: string, updates: Partial<InsertSupplyItem>): Promise<SupplyItem | undefined>;
  deleteSupplyItem(id: string): Promise<boolean>;
  updateSupplyItemSuppliers(supplyItemId: string, supplierIds: string[]): Promise<void>;

  // Supplier Directory methods
  getSupplierDirectory(): Promise<SupplierDirectory[]>;
  createSupplierEntry(entry: InsertSupplierDirectory): Promise<SupplierDirectory>;
  updateSupplierEntry(id: string, updates: Partial<InsertSupplierDirectory>): Promise<SupplierDirectory | undefined>;
  deleteSupplierEntry(id: string): Promise<boolean>;

  // Expense methods
  getExpenses(): Promise<Expense[]>;
  createExpense(expense: InsertExpense): Promise<Expense>;
  updateExpense(id: string, updates: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: string): Promise<boolean>;
  confirmRecurringExpense(category: "rent" | "salary", month: string, expenseDate: string): Promise<{ expense: Expense; created: boolean }>;
  getExpenseSettings(): Promise<ExpenseSettings>;
  updateExpenseSettings(updates: { rentAmount: number; salaryAmount: number }): Promise<ExpenseSettings>;
}

export class MemStorage implements IStorage {
  private inventoryItems: Map<string, InventoryItem>;
  private inventoryDotUnits: Map<string, InventoryDotUnit>;
  private invoices: Map<string, Invoice>;
  private invoiceItems: Map<string, InvoiceItem>;
  private users: Map<string, User>;
  private expenses: Map<string, Expense>;
  private expenseSettings: ExpenseSettings;

  constructor() {
    this.inventoryItems = new Map();
    this.inventoryDotUnits = new Map();
    this.invoices = new Map();
    this.invoiceItems = new Map();
    this.users = new Map();
    this.expenses = new Map();
    this.expenseSettings = { id: 1, rentAmount: "42000.00", salaryAmount: "75500.00", updatedAt: new Date() };

    // Add some initial inventory items and default user
    this.seedData();
  }

  private seedData() {
    const sampleItems: InsertInventoryItem[] = [
      // Tyres
      {
        category: "tyres",
        brand: "Michelin",
        pattern: "Pilot Sport 4",
        size: "225/45R17",
        quantity: 45,
      },
      {
        category: "tyres",
        brand: "Continental",
        pattern: "EcoContact 6",
        size: "195/65R15",
        specialMarkings: "XL",
        quantity: 8,
      },
      {
        category: "tyres",
        brand: "Bridgestone",
        pattern: "Turanza T005",
        size: "205/55R16",
        quantity: 32,
      },
      // Wheels
      {
        category: "wheels",
        brand: "BBS",
        model: "CH-R",
        size: "18x8.5",
        pcd: "5x112",
        color: "Black",
        quantity: 12
      },
      {
        category: "wheels",
        brand: "OZ Racing",
        model: "Superturismo GT",
        size: "17x7.5",
        pcd: "5x100",
        color: "Graphite",
        quantity: 6
      },
      // Others
      {
        category: "others",
        productName: "Wheel Balancing Weights",
        quantity: 50
      },
      {
        category: "others",
        productName: "Valve Caps",
        quantity: 100
      }
    ];

    sampleItems.forEach(item => {
      const id = randomUUID();
      const inventoryItem: InventoryItem = {
        id,
        category: item.category,
        quantity: item.quantity ?? 0,
        remark: null,
        costPrice: null,
        sellingPrice: null,
        atWarehouse: false,
        brand: ("brand" in item) ? item.brand : null,
        pattern: ("pattern" in item) ? item.pattern : null,
        size: ("size" in item) ? item.size : null,
        specialMarkings: ("specialMarkings" in item) ? item.specialMarkings ?? null : null,
        model: ("model" in item) ? item.model : null,
        pcd: ("pcd" in item) ? item.pcd : null,
        color: ("color" in item) ? item.color : null,
        productName: ("productName" in item) ? item.productName : null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.inventoryItems.set(id, inventoryItem);
    });

    // Add default user
    const defaultUserId = randomUUID();
    const defaultUser: User = {
      id: defaultUserId,
      username: "kwokwahtyre",
      password: "admin", // In production, this should be hashed
      displayName: "Kwok Wah Tyre Admin",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(defaultUserId, defaultUser);
  }

  // Inventory methods
  private withDotUnits(item: InventoryItem): InventoryItemWithDotUnits {
    return {
      ...item,
      dotUnits: Array.from(this.inventoryDotUnits.values())
        .filter((unit) => unit.inventoryItemId === item.id),
    };
  }

  async getInventoryItems(): Promise<InventoryItemWithDotUnits[]> {
    return Array.from(this.inventoryItems.values()).sort((a, b) => {
      // Sort by category first
      const categoryCompare = a.category.localeCompare(b.category);
      if (categoryCompare !== 0) return categoryCompare;

      // Then sort within category
      if (a.category === "tyres") {
        const brandCompare = (a.brand || "").localeCompare(b.brand || "");
        if (brandCompare !== 0) return brandCompare;
        return (a.pattern || "").localeCompare(b.pattern || "");
      } else if (a.category === "wheels") {
        const brandCompare = (a.brand || "").localeCompare(b.brand || "");
        if (brandCompare !== 0) return brandCompare;
        return (a.model || "").localeCompare(b.model || "");
      } else {
        return (a.productName || "").localeCompare(b.productName || "");
      }
    }).map((item) => this.withDotUnits(item));
  }

  async getInventoryItem(id: string): Promise<InventoryItemWithDotUnits | undefined> {
    const item = this.inventoryItems.get(id);
    return item ? this.withDotUnits(item) : undefined;
  }

  async createInventoryItem(insertItem: InsertInventoryItem, dotUnits: DotUnitInput[] = []): Promise<InventoryItemWithDotUnits> {
    if (dotUnits.length > (insertItem.quantity ?? 0)) {
      throw new Error("DOT units cannot exceed available quantity");
    }
    const id = randomUUID();
    const item: InventoryItem = {
      id,
      category: insertItem.category,
      quantity: insertItem.quantity ?? 0,
      remark: null,
      costPrice: null,
      sellingPrice: null,
      atWarehouse: false,
      brand: ("brand" in insertItem) ? insertItem.brand : null,
      pattern: ("pattern" in insertItem) ? insertItem.pattern : null,
      size: ("size" in insertItem) ? insertItem.size : null,
      specialMarkings: ("specialMarkings" in insertItem) ? insertItem.specialMarkings ?? null : null,
      model: ("model" in insertItem) ? insertItem.model : null,
      pcd: ("pcd" in insertItem) ? insertItem.pcd : null,
      color: ("color" in insertItem) ? insertItem.color : null,
      productName: ("productName" in insertItem) ? insertItem.productName : null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.inventoryItems.set(id, item);
    dotUnits.forEach(({ dotCode, atWarehouse }) => {
      const dotId = randomUUID();
      this.inventoryDotUnits.set(dotId, {
        id: dotId,
        inventoryItemId: id,
        dotCode,
        atWarehouse,
        status: "available",
        invoiceItemId: null,
        createdAt: new Date(),
        soldAt: null,
      });
    });
    return this.withDotUnits(item);
  }

  async updateInventoryItem(id: string, updates: InventoryItemUpdates, dotUnits?: DotUnitInput[]): Promise<InventoryItemWithDotUnits | undefined> {
    const item = this.inventoryItems.get(id);
    if (!item) return undefined;
    const availableDotUnitCount = Array.from(this.inventoryDotUnits.values())
      .filter((unit) => unit.inventoryItemId === id && unit.status === "available").length;
    if ((updates.quantity ?? item.quantity) < availableDotUnitCount && dotUnits === undefined) {
      throw new Error("Quantity cannot be lower than the number of available DOT units");
    }

    const updatedItem: InventoryItem = {
      ...item,
      ...updates,
      costPrice: updates.costPrice === null ? null : updates.costPrice !== undefined ? updates.costPrice.toString() : item.costPrice,
      sellingPrice: updates.sellingPrice === null ? null : updates.sellingPrice !== undefined ? updates.sellingPrice.toString() : item.sellingPrice,
      updatedAt: new Date()
    };
    this.inventoryItems.set(id, updatedItem);
    if (dotUnits !== undefined) {
      if (dotUnits.length > updatedItem.quantity) {
        throw new Error("DOT units cannot exceed available quantity");
      }
      const currentAvailable = Array.from(this.inventoryDotUnits.values())
        .filter((unit) => unit.inventoryItemId === id && unit.status === "available");
      const keptIds = new Set(dotUnits.flatMap((unit) => unit.id ? [unit.id] : []));
      currentAvailable.filter((unit) => !keptIds.has(unit.id))
        .forEach((unit) => this.inventoryDotUnits.delete(unit.id));
      dotUnits.forEach(({ id: unitId, dotCode, atWarehouse }) => {
        if (unitId) {
          const existingUnit = this.inventoryDotUnits.get(unitId);
          if (!existingUnit || existingUnit.inventoryItemId !== id || existingUnit.status !== "available") {
            throw new Error("Invalid DOT unit");
          }
          this.inventoryDotUnits.set(unitId, { ...existingUnit, dotCode, atWarehouse });
        } else {
        const dotId = randomUUID();
        this.inventoryDotUnits.set(dotId, {
          id: dotId, inventoryItemId: id, dotCode, status: "available",
          atWarehouse, invoiceItemId: null, createdAt: new Date(), soldAt: null,
        });
        }
      });
    }
    return this.withDotUnits(updatedItem);
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    for (const [dotId, unit] of Array.from(this.inventoryDotUnits.entries())) {
      if (unit.inventoryItemId === id) this.inventoryDotUnits.delete(dotId);
    }
    return this.inventoryItems.delete(id);
  }

  async updateInventoryQuantity(id: string, quantity: number): Promise<boolean> {
    const item = this.inventoryItems.get(id);
    if (!item) return false;
    const availableDotUnitCount = Array.from(this.inventoryDotUnits.values())
      .filter((unit) => unit.inventoryItemId === id && unit.status === "available").length;
    if (quantity < availableDotUnitCount) return false;

    const updatedItem: InventoryItem = {
      ...item,
      quantity,
      updatedAt: new Date()
    };
    this.inventoryItems.set(id, updatedItem);
    return true;
  }

  async bulkUpdateInventory(items: InsertInventoryItem[]): Promise<boolean> {
    try {
      // Clear existing inventory
      this.inventoryItems.clear();
      
      // Add all new items
      for (const item of items) {
        const newItem: InventoryItem = {
          id: randomUUID(),
          category: item.category,
          quantity: item.quantity ?? 0,
          remark: item.remark ?? null,
          costPrice: ("costPrice" in item && item.costPrice) ? String(item.costPrice) : null,
          sellingPrice: ("sellingPrice" in item && item.sellingPrice) ? String(item.sellingPrice) : null,
          atWarehouse: false,
          brand: ("brand" in item) ? item.brand : null,
          pattern: ("pattern" in item) ? item.pattern : null,
          size: ("size" in item) ? item.size : null,
          specialMarkings: ("specialMarkings" in item) ? item.specialMarkings ?? null : null,
          model: ("model" in item) ? item.model : null,
          pcd: ("pcd" in item) ? item.pcd : null,
          color: ("color" in item) ? item.color : null,
          productName: ("productName" in item) ? item.productName : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.inventoryItems.set(newItem.id, newItem);
      }
      
      return true;
    } catch (error) {
      console.error("Bulk update error:", error);
      return false;
    }
  }

  // Invoice methods
  async getInvoices(): Promise<Invoice[]> {
    return Array.from(this.invoices.values()).sort((a, b) => 
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  }

  async getInvoice(id: string): Promise<InvoiceWithItems | undefined> {
    const invoice = this.invoices.get(id);
    if (!invoice) return undefined;

    const items = await this.getInvoiceItems(id);
    return { ...invoice, items };
  }

  async createInvoice(insertInvoice: InsertInvoice, items: InvoiceItemWithInventoryRef[]): Promise<InvoiceWithItems> {
    const id = randomUUID();
    
    // Always generate sequential invoice number for consistency  
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yearMonth = `KW${year}${month}`;
    
    // Find the highest sequence number across ALL invoices to maintain continuous sequence
    const existingInvoices = Array.from(this.invoices.values());
    
    let maxSequence = 0;
    for (const invoice of existingInvoices) {
      const sequenceMatch = invoice.invoiceNumber.match(/-(\d{5})$/);
      if (sequenceMatch) {
        const sequence = parseInt(sequenceMatch[1]);
        if (sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    }
    
    // Ensure minimum sequence starts from 39596 (for historical continuity)
    if (maxSequence < 39596) {
      maxSequence = 39596;
    }
    
    const sequence = String(maxSequence + 1).padStart(5, '0');
    const invoiceNumber = `${yearMonth}-${sequence}`;
    
    // Calculate total amount: subtotal - deposit + shipping
    const subtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price.toString()) * item.quantity);
    }, 0);
    const deposit = parseFloat(insertInvoice.deposit?.toString() || "0");
    const shipping = parseFloat(insertInvoice.shipping?.toString() || "0");
    const totalAmount = subtotal - deposit + shipping;

    // Get today's date string for createdAt/updatedAt
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const invoice: Invoice = {
      id,
      invoiceNumber,
      invoiceDate: insertInvoice.invoiceDate,
      carNo: insertInvoice.carNo ?? null,
      customerName: insertInvoice.customerName ?? null,
      totalAmount: totalAmount.toString(),
      status: insertInvoice.status ?? "pending",
      remark: insertInvoice.remark ?? null,
      internalNotes: insertInvoice.internalNotes ?? null,
      deposit: insertInvoice.deposit ?? "0",
      shipping: insertInvoice.shipping ?? "0",
      cost: null,
      profit: null,
      createdAt: todayString,
      updatedAt: todayString
    };

    this.invoices.set(id, invoice);

    // Create invoice items
    const createdItems: InvoiceItem[] = [];
    for (const itemData of items) {
      const itemId = randomUUID();
      const item: InvoiceItem = {
        id: itemId,
        invoiceId: id,
        inventoryItemId: itemData.inventoryItemId ?? null,
        category: itemData.category,
        quantity: itemData.quantity,
        price: itemData.price,
        brand: ("brand" in itemData) ? (itemData.brand ?? null) : null,
        pattern: ("pattern" in itemData) ? (itemData.pattern ?? null) : null,
        size: ("size" in itemData) ? (itemData.size ?? null) : null,
        specialMarkings: ("specialMarkings" in itemData) ? (itemData.specialMarkings ?? null) : null,
        model: ("model" in itemData) ? (itemData.model ?? null) : null,
        pcd: ("pcd" in itemData) ? (itemData.pcd ?? null) : null,
        color: ("color" in itemData) ? (itemData.color ?? null) : null,
        productName: ("productName" in itemData) ? (itemData.productName ?? null) : null
      };
      this.invoiceItems.set(itemId, item);
      createdItems.push(item);

      // Update inventory quantity based on category
      const inventoryItems = Array.from(this.inventoryItems.values());
      let inventoryItem: InventoryItem | undefined;

      if (itemData.inventoryItemId && !itemData.skipInventory) {
        inventoryItem = this.inventoryItems.get(itemData.inventoryItemId);
      } else if (itemData.skipInventory) {
        inventoryItem = undefined;
      } else if (item.category === "tyres") {
        inventoryItem = inventoryItems.find(inv => 
          inv.category === "tyres" && 
          inv.brand === item.brand && 
          inv.pattern === item.pattern && 
          inv.size === item.size
        );
      } else if (item.category === "wheels") {
        inventoryItem = inventoryItems.find(inv => 
          inv.category === "wheels" && 
          inv.brand === item.brand && 
          inv.model === item.model && 
          inv.size === item.size &&
          inv.pcd === item.pcd &&
          inv.color === item.color
        );
      } else if (item.category === "others") {
        inventoryItem = inventoryItems.find(inv => 
          inv.category === "others" && 
          inv.productName === item.productName
        );
      }
      
      if (inventoryItem) {
        await this.updateInventoryQuantity(inventoryItem.id, inventoryItem.quantity - item.quantity);
      }
    }

    return { ...invoice, items: createdItems };
  }

  async repairInvoiceNumbers(changes: InvoiceNumberChange[]): Promise<number> {
    const selectedIds = new Set(changes.map((change) => change.id));
    for (const change of changes) {
      if (!this.invoices.has(change.id)) {
        throw new InvoiceNumberRepairError("An invoice no longer exists. Refresh and try again.", 404);
      }
      if (Array.from(this.invoices.values()).some((invoice) =>
        !selectedIds.has(invoice.id) && invoice.invoiceNumber === change.invoiceNumber)) {
        throw new InvoiceNumberRepairError(`Invoice number ${change.invoiceNumber} already exists`, 409);
      }
    }
    // Validate the entire batch before making any changes.
    const updatedAt = new Date().toISOString().split("T")[0];
    for (const change of changes) {
      this.invoices.set(change.id, { ...this.invoices.get(change.id)!, invoiceNumber: change.invoiceNumber, updatedAt });
    }
    return changes.length;
  }

  async updateInvoice(id: string, invoiceUpdates: Partial<InsertInvoice>, items: InsertInvoiceItem[]): Promise<InvoiceWithItems | undefined> {
    const existingInvoice = this.invoices.get(id);
    if (!existingInvoice) return undefined;

    // Remove existing invoice items
    const itemsToDelete = Array.from(this.invoiceItems.entries()).filter(([, item]) => item.invoiceId === id);
    itemsToDelete.forEach(([itemId]) => this.invoiceItems.delete(itemId));

    // Calculate new total amount: subtotal - deposit + shipping
    const subtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price.toString()) * item.quantity);
    }, 0);
    const deposit = parseFloat(invoiceUpdates.deposit?.toString() || existingInvoice.deposit?.toString() || "0");
    const shipping = parseFloat(invoiceUpdates.shipping?.toString() || existingInvoice.shipping?.toString() || "0");
    const totalAmount = subtotal - deposit + shipping;

    // Check if invoice date changed and update invoice number accordingly
    let updatedInvoiceNumber = existingInvoice.invoiceNumber;
    if (invoiceUpdates.invoiceDate && invoiceUpdates.invoiceDate !== existingInvoice.invoiceDate) {
      // Extract the sequence number from the current invoice number
      const sequenceMatch = existingInvoice.invoiceNumber.match(/-(\d{5})$/);
      if (sequenceMatch) {
        const sequence = sequenceMatch[1]; // Keep the 5-digit sequence
        
        // Generate new year-month prefix based on the new invoice date
        const newDate = new Date(invoiceUpdates.invoiceDate);
        const year = String(newDate.getFullYear()).slice(-2);
        const month = String(newDate.getMonth() + 1).padStart(2, '0');
        const yearMonth = `KW${year}${month}`;
        
        // Create new invoice number with updated month but same sequence
        updatedInvoiceNumber = `${yearMonth}-${sequence}`;
      }
    }

    // Update invoice
    const todayString = new Date().toISOString().split('T')[0];
    const updatedInvoice: Invoice = {
      ...existingInvoice,
      ...invoiceUpdates,
      invoiceNumber: updatedInvoiceNumber,
      totalAmount: totalAmount.toString(),
      updatedAt: todayString
    };
    this.invoices.set(id, updatedInvoice);

    // Create new invoice items
    const createdItems: InvoiceItem[] = [];
    for (const itemData of items) {
      const itemId = randomUUID();
      const invoiceItem: InvoiceItem = {
        id: itemId,
        invoiceId: id,
        inventoryItemId: null,
        category: itemData.category,
        brand: itemData.brand ?? null,
        pattern: itemData.pattern ?? null,
        size: itemData.size ?? null,
        specialMarkings: itemData.specialMarkings ?? null,
        model: itemData.model ?? null,
        pcd: itemData.pcd ?? null,
        color: itemData.color ?? null,
        productName: itemData.productName ?? null,
        quantity: itemData.quantity,
        price: itemData.price.toString(),
      };
      this.invoiceItems.set(itemId, invoiceItem);
      createdItems.push(invoiceItem);
    }

    return { ...updatedInvoice, items: createdItems };
  }

  async updateInvoiceStatus(id: string, status: string): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice) return false;

    const updatedInvoice: Invoice = {
      ...invoice,
      status,
      updatedAt: new Date().toISOString().split('T')[0]
    };
    this.invoices.set(id, updatedInvoice);
    return true;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    // Delete associated invoice items first
    const items = Array.from(this.invoiceItems.values()).filter(item => item.invoiceId === id);
    items.forEach(item => this.invoiceItems.delete(item.id));
    
    return this.invoices.delete(id);
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return Array.from(this.invoiceItems.values()).filter(item => item.invoiceId === invoiceId);
  }

  async getInvoicesWithItems(): Promise<InvoiceWithItems[]> {
    const allInvoices = await this.getInvoices();
    const allItems = Array.from(this.invoiceItems.values());
    const itemsByInvoiceId = new Map<string, InvoiceItem[]>();
    for (const item of allItems) {
      const existing = itemsByInvoiceId.get(item.invoiceId) || [];
      existing.push(item);
      itemsByInvoiceId.set(item.invoiceId, existing);
    }
    return allInvoices.map(invoice => ({
      ...invoice,
      items: itemsByInvoiceId.get(invoice.id) || [],
    }));
  }

  async updateInvoiceProfit(id: string, cost: number): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice) return false;

    const totalAmount = parseFloat(invoice.totalAmount);
    const profit = totalAmount - cost;
    const todayString = new Date().toISOString().split('T')[0];

    const updatedInvoice: Invoice = {
      ...invoice,
      cost: cost.toString(),
      profit: profit.toString(),
      updatedAt: todayString
    };

    this.invoices.set(id, updatedInvoice);
    return true;
  }

  // Follow-up methods
  async updateInvoiceFollowUp(id: string, followUpRequired: number, paymentReceivedDate?: string | null): Promise<boolean> {
    const invoice = this.invoices.get(id);
    if (!invoice) return false;

    const todayString = new Date().toISOString().split('T')[0];
    
    let finalPaymentDate: string | null;
    if (paymentReceivedDate !== undefined) {
      // Explicit payment date provided
      finalPaymentDate = paymentReceivedDate;
    } else if (followUpRequired === 0) {
      // Marking as paid - record payment date
      finalPaymentDate = todayString;
    } else {
      // Marking for follow-up - clear payment date
      finalPaymentDate = null;
    }
    
    const updatedInvoice: Invoice = {
      ...invoice,
      followUpRequired,
      paymentReceivedDate: finalPaymentDate,
      updatedAt: todayString
    };

    this.invoices.set(id, updatedInvoice);
    return true;
  }

  async batchUpdateInvoiceFollowUp(ids: string[], followUpRequired: number, paymentReceivedDate?: string | null): Promise<boolean> {
    const todayString = new Date().toISOString().split('T')[0];
    
    for (const id of ids) {
      const invoice = this.invoices.get(id);
      if (invoice) {
        let finalPaymentDate: string | null;
        if (paymentReceivedDate !== undefined) {
          // Explicit payment date provided
          finalPaymentDate = paymentReceivedDate;
        } else if (followUpRequired === 0) {
          // Marking as paid - record payment date
          finalPaymentDate = todayString;
        } else {
          // Marking for follow-up - clear payment date
          finalPaymentDate = null;
        }
        
        const updatedInvoice: Invoice = {
          ...invoice,
          followUpRequired,
          paymentReceivedDate: finalPaymentDate,
          updatedAt: todayString
        };
        this.invoices.set(id, updatedInvoice);
      }
    }
    
    return true;
  }

  async getFollowUpInvoices(): Promise<Invoice[]> {
    return Array.from(this.invoices.values())
      .filter(invoice => invoice.followUpRequired === 1)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // User authentication methods
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password, // In production, this should be hashed
      displayName: insertUser.displayName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserPassword(id: string, newPassword: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return false;

    const updatedUser: User = {
      ...user,
      password: newPassword, // In production, this should be hashed
      updatedAt: new Date()
    };
    this.users.set(id, updatedUser);
    return true;
  }

  // Supply methods (MemStorage stubs)
  async getSupplyItems(): Promise<SupplyItem[]> { return []; }
  async getSupplyItemsWithSuppliers(): Promise<SupplyItemWithSuppliers[]> { return []; }
  async createSupplyItem(item: InsertSupplyItem): Promise<SupplyItem> { throw new Error("Not implemented"); }
  async updateSupplyItem(id: string, updates: Partial<InsertSupplyItem>): Promise<SupplyItem | undefined> { return undefined; }
  async deleteSupplyItem(id: string): Promise<boolean> { return false; }
  async updateSupplyItemSuppliers(supplyItemId: string, supplierIds: string[]): Promise<void> {}
  async getSupplierDirectory(): Promise<SupplierDirectory[]> { return []; }
  async createSupplierEntry(entry: InsertSupplierDirectory): Promise<SupplierDirectory> { throw new Error("Not implemented"); }
  async updateSupplierEntry(id: string, updates: Partial<InsertSupplierDirectory>): Promise<SupplierDirectory | undefined> { return undefined; }
  async deleteSupplierEntry(id: string): Promise<boolean> { return false; }

  async getExpenses(): Promise<Expense[]> {
    return Array.from(this.expenses.values()).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  }
  async createExpense(insertExpense: InsertExpense): Promise<Expense> {
    const expense: Expense = { id: randomUUID(), item: insertExpense.item, amount: insertExpense.amount.toFixed(2), expenseDate: insertExpense.expenseDate, category: insertExpense.category, recurringKey: null, createdAt: new Date(), updatedAt: new Date() };
    this.expenses.set(expense.id, expense);
    return expense;
  }
  async updateExpense(id: string, updates: Partial<InsertExpense>): Promise<Expense | undefined> {
    const current = this.expenses.get(id);
    if (!current) return undefined;
    const updated: Expense = { ...current, ...updates, amount: updates.amount === undefined ? current.amount : updates.amount.toFixed(2), updatedAt: new Date() };
    this.expenses.set(id, updated);
    return updated;
  }
  async deleteExpense(id: string): Promise<boolean> { return this.expenses.delete(id); }
  async confirmRecurringExpense(category: "rent" | "salary", month: string, expenseDate: string): Promise<{ expense: Expense; created: boolean }> {
    const recurringKey = `${category}:${month}`;
    const existing = Array.from(this.expenses.values()).find((expense) => expense.recurringKey === recurringKey);
    if (existing) return { expense: existing, created: false };
    const amount = category === "rent" ? this.expenseSettings.rentAmount : this.expenseSettings.salaryAmount;
    const expense: Expense = { id: randomUUID(), item: category === "rent" ? "Rent" : "Salary", amount, expenseDate, category, recurringKey, createdAt: new Date(), updatedAt: new Date() };
    this.expenses.set(expense.id, expense);
    return { expense, created: true };
  }
  async getExpenseSettings(): Promise<ExpenseSettings> { return this.expenseSettings; }
  async updateExpenseSettings(updates: { rentAmount: number; salaryAmount: number }): Promise<ExpenseSettings> {
    this.expenseSettings = { ...this.expenseSettings, rentAmount: updates.rentAmount.toFixed(2), salaryAmount: updates.salaryAmount.toFixed(2), updatedAt: new Date() };
    return this.expenseSettings;
  }
}

// DatabaseStorage implementation using PostgreSQL
export class DatabaseStorage implements IStorage {
  async getInventoryItems(): Promise<InventoryItemWithDotUnits[]> {
    const [items, dotUnits] = await Promise.all([
      db.select().from(inventoryItems).orderBy(desc(inventoryItems.createdAt)),
      db.select().from(inventoryDotUnits),
    ]);
    const dotUnitsByItem = new Map<string, InventoryDotUnit[]>();
    dotUnits.forEach((unit) => {
      const units = dotUnitsByItem.get(unit.inventoryItemId) ?? [];
      units.push(unit);
      dotUnitsByItem.set(unit.inventoryItemId, units);
    });
    return items.map((item) => ({ ...item, dotUnits: dotUnitsByItem.get(item.id) ?? [] }));
  }

  async getInventoryItem(id: string): Promise<InventoryItemWithDotUnits | undefined> {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!item) return undefined;
    const dotUnits = await db.select().from(inventoryDotUnits)
      .where(eq(inventoryDotUnits.inventoryItemId, id));
    return { ...item, dotUnits };
  }

  async createInventoryItem(insertItem: InsertInventoryItem, dotUnits: DotUnitInput[] = []): Promise<InventoryItemWithDotUnits> {
    if (dotUnits.length > (insertItem.quantity ?? 0)) {
      throw new Error("DOT units cannot exceed available quantity");
    }
    return db.transaction(async (tx) => {
      const [item] = await tx
        .insert(inventoryItems)
        .values({
          ...insertItem,
          costPrice: insertItem.costPrice ? insertItem.costPrice.toString() : null,
          sellingPrice: insertItem.sellingPrice ? insertItem.sellingPrice.toString() : null,
        })
        .returning();
      const createdDotUnits = dotUnits.length > 0
        ? await tx.insert(inventoryDotUnits).values(dotUnits.map(({ dotCode, atWarehouse }) => ({
            inventoryItemId: item.id,
            dotCode,
            atWarehouse,
          }))).returning()
        : [];
      return { ...item, dotUnits: createdDotUnits };
    });
  }

  async updateInventoryItem(id: string, updates: InventoryItemUpdates, dotUnits?: DotUnitInput[]): Promise<InventoryItemWithDotUnits | undefined> {
    return db.transaction(async (tx) => {
      const [existing] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, id));
      if (!existing) return undefined;
      const quantity = updates.quantity ?? existing.quantity;
      const currentUnits = await tx.select().from(inventoryDotUnits)
        .where(eq(inventoryDotUnits.inventoryItemId, id));
      const availableDotUnitCount = currentUnits.filter((unit) => unit.status === "available").length;
      if (dotUnits === undefined && quantity < availableDotUnitCount) {
        throw new Error("Quantity cannot be lower than the number of available DOT units");
      }
      if (dotUnits !== undefined && dotUnits.length > quantity) {
        throw new Error("DOT units cannot exceed available quantity");
      }
      const [item] = await tx
        .update(inventoryItems)
        .set({
          ...updates,
          costPrice: updates.costPrice === null ? null : updates.costPrice !== undefined ? updates.costPrice.toString() : undefined,
          sellingPrice: updates.sellingPrice === null ? null : updates.sellingPrice !== undefined ? updates.sellingPrice.toString() : undefined,
          updatedAt: new Date()
        })
        .where(eq(inventoryItems.id, id))
        .returning();

      if (dotUnits !== undefined) {
        const currentAvailable = currentUnits.filter((unit) => unit.status === "available");
        const currentById = new Map(currentAvailable.map((unit) => [unit.id, unit]));
        const keptIds = new Set(dotUnits.flatMap((unit) => unit.id ? [unit.id] : []));
        const removableUnits = currentAvailable.filter((unit) => !keptIds.has(unit.id));
        if (removableUnits.length) {
          await tx.delete(inventoryDotUnits)
            .where(inArray(inventoryDotUnits.id, removableUnits.map((unit) => unit.id)));
        }
        for (const unit of dotUnits.filter((entry) => entry.id)) {
          if (!currentById.has(unit.id!)) throw new Error("Invalid DOT unit");
          await tx.update(inventoryDotUnits)
            .set({ dotCode: unit.dotCode, atWarehouse: unit.atWarehouse })
            .where(eq(inventoryDotUnits.id, unit.id!));
        }
        const newUnits = dotUnits.filter((entry) => !entry.id);
        if (newUnits.length > 0) {
          await tx.insert(inventoryDotUnits).values(newUnits.map((unit) => ({
            inventoryItemId: id,
            dotCode: unit.dotCode,
            atWarehouse: unit.atWarehouse,
          })));
        }
      }

      const updatedDotUnits = await tx.select().from(inventoryDotUnits)
        .where(eq(inventoryDotUnits.inventoryItemId, id));
      return { ...item, dotUnits: updatedDotUnits };
    });
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    const result = await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateInventoryQuantity(id: string, quantity: number): Promise<boolean> {
    const availableDotUnits = await db.select({ id: inventoryDotUnits.id }).from(inventoryDotUnits)
      .where(and(eq(inventoryDotUnits.inventoryItemId, id), eq(inventoryDotUnits.status, "available")));
    if (quantity < availableDotUnits.length) return false;
    const result = await db
      .update(inventoryItems)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async bulkUpdateInventory(items: InsertInventoryItem[]): Promise<boolean> {
    try {
      // Clear existing inventory
      await db.delete(inventoryItems);
      
      // Insert all new items
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          ...item,
          costPrice: item.costPrice ? item.costPrice.toString() : null,
          sellingPrice: item.sellingPrice ? item.sellingPrice.toString() : null,
        }));
        await db.insert(inventoryItems).values(itemsToInsert);
      }
      
      return true;
    } catch (error) {
      console.error("Bulk update error:", error);
      return false;
    }
  }

  // Invoice methods
  async getInvoices(): Promise<Invoice[]> {
    const results = await db.select().from(invoices).orderBy(
      desc(invoices.invoiceDate),
      desc(sql`CAST(RIGHT(invoice_number, 5) AS INTEGER)`)
    );
    // Ensure dates are strings
    return results.map(invoice => ({
      ...invoice,
      invoiceDate: typeof invoice.invoiceDate === 'string' ? invoice.invoiceDate : invoice.invoiceDate,
      createdAt: typeof invoice.createdAt === 'string' ? invoice.createdAt : invoice.createdAt,
      updatedAt: typeof invoice.updatedAt === 'string' ? invoice.updatedAt : invoice.updatedAt,
    }));
  }

  async getInvoice(id: string): Promise<InvoiceWithItems | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return undefined;

    const items = await this.getInvoiceItems(id);
    return { ...invoice, items };
  }

  async createInvoice(insertInvoice: InsertInvoice, items: InvoiceItemWithInventoryRef[]): Promise<InvoiceWithItems> {
    // Always generate sequential invoice number for consistency
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yearMonth = `KW${year}${month}`;
    
    // Find the highest sequence number across ALL invoices to maintain continuous sequence
    // Return a single number, not the entire invoice history. The suffix rule
    // intentionally matches the historical numbering behavior.
    const [sequenceResult] = await db.select({
      maximum: sql<number>`coalesce(max(substring(${invoices.invoiceNumber} from '-([0-9]{5})$')::integer), 0)`.mapWith(Number),
    }).from(invoices);
    let maxSequence = sequenceResult.maximum;
    
    // Ensure minimum sequence starts from 39596 (for historical continuity)
    if (maxSequence < 39596) {
      maxSequence = 39596;
    }
    
    const sequence = String(maxSequence + 1).padStart(5, '0');
    const invoiceNumber = `${yearMonth}-${sequence}`;
    
    // Calculate total amount: subtotal - deposit + shipping
    const subtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price.toString()) * item.quantity);
    }, 0);
    const deposit = parseFloat(insertInvoice.deposit?.toString() || "0");
    const shipping = parseFloat(insertInvoice.shipping?.toString() || "0");
    const totalAmount = subtotal - deposit + shipping;

    // Creation only needs product records here; DOT validation has already
    // happened in the route and the transaction checks selected units again.
    const inventoryItemsList = await db.select().from(inventoryItems);
    const inventoryDeductions = new Map<string, number>();
    for (const itemData of items) {
      if (itemData.skipInventory) continue;

      let inventoryItem = itemData.inventoryItemId
        ? inventoryItemsList.find((item) => item.id === itemData.inventoryItemId)
        : undefined;

      // Retain legacy matching for older API clients that do not send an inventory ID.
      if (!inventoryItem && itemData.category === "tyres") {
        inventoryItem = inventoryItemsList.find((item) =>
          item.category === "tyres" &&
          item.brand === itemData.brand &&
          item.pattern === itemData.pattern &&
          item.size === itemData.size
        );
      } else if (!inventoryItem && itemData.category === "wheels") {
        inventoryItem = inventoryItemsList.find((item) =>
          item.category === "wheels" &&
          item.brand === itemData.brand &&
          item.model === itemData.model &&
          item.size === itemData.size &&
          item.pcd === itemData.pcd &&
          item.color === itemData.color
        );
      } else if (!inventoryItem && itemData.category === "others") {
        inventoryItem = inventoryItemsList.find((item) =>
          item.category === "others" && item.productName === itemData.productName
        );
      }

      if (inventoryItem) {
        inventoryDeductions.set(
          inventoryItem.id,
          (inventoryDeductions.get(inventoryItem.id) || 0) + itemData.quantity
        );
      }
    }

    // Get today's date string for createdAt/updatedAt
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return db.transaction(async (tx) => {
      for (const [inventoryItemId, quantity] of Array.from(inventoryDeductions.entries())) {
        const [updatedInventory] = await tx
          .update(inventoryItems)
          .set({ quantity: sql`${inventoryItems.quantity} - ${quantity}` })
          .where(and(eq(inventoryItems.id, inventoryItemId), gte(inventoryItems.quantity, quantity)))
          .returning({ id: inventoryItems.id });

        if (!updatedInventory) {
          throw new Error(`Insufficient stock for inventory item ${inventoryItemId}`);
        }
      }

      const [invoice] = await tx
        .insert(invoices)
        .values({
          ...insertInvoice,
          invoiceNumber,
          totalAmount: totalAmount.toString(),
          createdAt: todayString,
          updatedAt: todayString,
        })
        .returning();

      const createdItems: InvoiceItem[] = [];
      for (const itemData of items) {
        const { dotUnitIds, skipInventory, ...invoiceItemData } = itemData;
        const inventoryItemId = itemData.inventoryItemId;
        const [item] = await tx
          .insert(invoiceItems)
          .values({
            ...invoiceItemData,
            invoiceId: invoice.id,
          })
          .returning();
        if (dotUnitIds && dotUnitIds.length > 0) {
          if (!inventoryItemId || dotUnitIds.length !== itemData.quantity) {
            throw new Error("A DOT-tracked invoice row must include one available DOT unit per item");
          }
          const soldUnits = await tx
            .update(inventoryDotUnits)
            .set({
              status: "sold",
              invoiceItemId: item.id,
              soldAt: new Date(),
            })
            .where(and(
              inArray(inventoryDotUnits.id, dotUnitIds),
              eq(inventoryDotUnits.inventoryItemId, inventoryItemId),
              eq(inventoryDotUnits.status, "available"),
            ))
            .returning({ id: inventoryDotUnits.id });
          if (soldUnits.length !== dotUnitIds.length) {
            throw new Error("One or more selected DOT units are no longer available");
          }
        }
        createdItems.push(item);
      }

      return { ...invoice, items: createdItems };
    });
  }

  async repairInvoiceNumbers(changes: InvoiceNumberChange[]): Promise<number> {
    return db.transaction(async (tx) => {
      // Serialize invoice writers while validating uniqueness and applying swaps.
      // Reads remain available. All temporary numbers disappear at commit/rollback.
      await tx.execute(sql`LOCK TABLE invoices IN SHARE ROW EXCLUSIVE MODE`);
      const ids = changes.map((change) => change.id);
      const selectedIds = new Set(ids);
      const existing = await tx.select({ id: invoices.id }).from(invoices)
        .where(inArray(invoices.id, ids));
      if (existing.length !== changes.length) {
        throw new InvoiceNumberRepairError("An invoice no longer exists. Refresh and try again.", 404);
      }
      const conflicts = await tx.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
        .from(invoices).where(inArray(invoices.invoiceNumber, changes.map((change) => change.invoiceNumber)));
      const conflict = conflicts.find((invoice) => !selectedIds.has(invoice.id));
      if (conflict) {
        throw new InvoiceNumberRepairError(`Invoice number ${conflict.invoiceNumber} already exists`, 409);
      }

      // Vacate current numbers first so A -> B / B -> A is valid.
      const token = randomUUID();
      for (const change of changes) {
        await tx.update(invoices).set({ invoiceNumber: `__repair_${token}_${change.id}` })
          .where(eq(invoices.id, change.id));
      }
      const updatedAt = new Date().toISOString().split("T")[0];
      for (const change of changes) {
        await tx.update(invoices).set({ invoiceNumber: change.invoiceNumber, updatedAt })
          .where(eq(invoices.id, change.id));
      }
      return changes.length;
    });
  }

  async updateInvoice(id: string, invoiceUpdates: Partial<InsertInvoice>, items: InsertInvoiceItem[]): Promise<InvoiceWithItems | undefined> {
    // Get the current invoice to check if date changed
    const [currentInvoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!currentInvoice) return undefined;

    // Calculate new total amount: subtotal - deposit + shipping
    const subtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price.toString()) * item.quantity);
    }, 0);
    const deposit = parseFloat(invoiceUpdates.deposit?.toString() || currentInvoice.deposit?.toString() || "0");
    const shipping = parseFloat(invoiceUpdates.shipping?.toString() || currentInvoice.shipping?.toString() || "0");
    const totalAmount = subtotal - deposit + shipping;

    // Determine the invoice number to use
    let updatedInvoiceNumber = currentInvoice.invoiceNumber;
    if (invoiceUpdates.invoiceNumber && invoiceUpdates.invoiceNumber !== currentInvoice.invoiceNumber) {
      // User explicitly changed the invoice number — use it as-is
      updatedInvoiceNumber = invoiceUpdates.invoiceNumber;
    } else if (invoiceUpdates.invoiceDate && invoiceUpdates.invoiceDate !== currentInvoice.invoiceDate) {
      // Invoice date changed and no manual number provided — auto-update the month prefix
      const sequenceMatch = currentInvoice.invoiceNumber.match(/-(\d{5})$/);
      if (sequenceMatch) {
        const sequence = sequenceMatch[1];
        const newDate = new Date(invoiceUpdates.invoiceDate);
        const year = String(newDate.getFullYear()).slice(-2);
        const month = String(newDate.getMonth() + 1).padStart(2, '0');
        updatedInvoiceNumber = `KW${year}${month}-${sequence}`;
      }
    }

    // Update invoice
    const [updatedInvoice] = await db
      .update(invoices)
      .set({ 
        ...invoiceUpdates, 
        invoiceNumber: updatedInvoiceNumber,
        totalAmount: totalAmount.toString(),
        updatedAt: new Date().toISOString().split('T')[0]
      })
      .where(eq(invoices.id, id))
      .returning();

    if (!updatedInvoice) return undefined;

    // Delete existing invoice items
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));

    // Create new invoice items
    const createdItems: InvoiceItem[] = [];
    for (const itemData of items) {
      const [item] = await db
        .insert(invoiceItems)
        .values({
          invoiceId: id,
          category: itemData.category,
          brand: itemData.brand,
          pattern: itemData.pattern,
          size: itemData.size,
          specialMarkings: itemData.specialMarkings,
          model: itemData.model,
          pcd: itemData.pcd,
          color: itemData.color,
          productName: itemData.productName,
          quantity: itemData.quantity,
          price: itemData.price.toString(),
        })
        .returning();
      createdItems.push(item);
    }

    return { ...updatedInvoice, items: createdItems };
  }

  async updateInvoiceStatus(id: string, status: string): Promise<boolean> {
    const result = await db
      .update(invoices)
      .set({ status, updatedAt: new Date().toISOString().split('T')[0] })
      .where(eq(invoices.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    const result = await db.delete(invoices).where(eq(invoices.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async getInvoicesWithItems(): Promise<InvoiceWithItems[]> {
    const [allInvoices, allItems] = await Promise.all([
      this.getInvoices(),
      db.select().from(invoiceItems),
    ]);
    const itemsByInvoiceId = new Map<string, InvoiceItem[]>();
    for (const item of allItems) {
      const existing = itemsByInvoiceId.get(item.invoiceId) || [];
      existing.push(item);
      itemsByInvoiceId.set(item.invoiceId, existing);
    }
    return allInvoices.map(invoice => ({
      ...invoice,
      items: itemsByInvoiceId.get(invoice.id) || [],
    }));
  }

  async updateInvoiceProfit(id: string, cost: number | null): Promise<boolean> {
    // First get the invoice to calculate profit
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!invoice) return false;

    if (cost === null) {
      const result = await db
        .update(invoices)
        .set({
          cost: null,
          profit: null,
          updatedAt: new Date().toISOString().split('T')[0],
        })
        .where(eq(invoices.id, id));
      return (result.rowCount ?? 0) > 0;
    }

    const totalAmount = parseFloat(invoice.totalAmount);
    const profit = totalAmount - cost;

    const result = await db
      .update(invoices)
      .set({ 
        cost: cost.toString(),
        profit: profit.toString(),
        updatedAt: new Date().toISOString().split('T')[0]
      })
      .where(eq(invoices.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  // Follow-up methods
  async updateInvoiceFollowUp(id: string, followUpRequired: number, paymentReceivedDate?: string | null): Promise<boolean> {
    const todayString = new Date().toISOString().split('T')[0];
    const updateData: any = {
      followUpRequired,
      updatedAt: todayString
    };
    
    // Determine payment date based on follow-up status
    if (paymentReceivedDate !== undefined) {
      // Explicit payment date provided
      updateData.paymentReceivedDate = paymentReceivedDate;
    } else if (followUpRequired === 0) {
      // Marking as paid - record payment date
      updateData.paymentReceivedDate = todayString;
    } else {
      // Marking for follow-up - clear payment date
      updateData.paymentReceivedDate = null;
    }

    const result = await db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, id));

    return (result.rowCount ?? 0) > 0;
  }

  async batchUpdateInvoiceFollowUp(ids: string[], followUpRequired: number, paymentReceivedDate?: string | null): Promise<boolean> {
    const todayString = new Date().toISOString().split('T')[0];
    const updateData: any = {
      followUpRequired,
      updatedAt: todayString
    };
    
    // Determine payment date based on follow-up status
    if (paymentReceivedDate !== undefined) {
      // Explicit payment date provided
      updateData.paymentReceivedDate = paymentReceivedDate;
    } else if (followUpRequired === 0) {
      // Marking as paid - record payment date
      updateData.paymentReceivedDate = todayString;
    } else {
      // Marking for follow-up - clear payment date
      updateData.paymentReceivedDate = null;
    }

    // Update each invoice individually
    for (const id of ids) {
      await db
        .update(invoices)
        .set(updateData)
        .where(eq(invoices.id, id));
    }

    return true;
  }

  async getFollowUpInvoices(): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.followUpRequired, 1)).orderBy(desc(invoices.createdAt));
  }

  // User authentication methods
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserPassword(id: string, newPassword: string): Promise<boolean> {
    const result = await db
      .update(users)
      .set({ 
        password: newPassword, // In production, this should be hashed
        updatedAt: new Date()
      })
      .where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Supply methods
  async getSupplyItems(): Promise<SupplyItem[]> {
    return await db.select().from(supplyItems).orderBy(desc(supplyItems.createdAt));
  }

  async getSupplyItemsWithSuppliers(): Promise<SupplyItemWithSuppliers[]> {
    const items = await db.select().from(supplyItems).orderBy(desc(supplyItems.createdAt));
    const assocs = await db
      .select()
      .from(supplyItemSuppliers)
      .leftJoin(supplierDirectory, eq(supplyItemSuppliers.supplierDirectoryId, supplierDirectory.id));

    const suppliersByItemId = new Map<string, SupplierDirectory[]>();
    for (const row of assocs) {
      if (row.supplier_directory) {
        const list = suppliersByItemId.get(row.supply_item_suppliers.supplyItemId) || [];
        list.push(row.supplier_directory);
        suppliersByItemId.set(row.supply_item_suppliers.supplyItemId, list);
      }
    }
    return items.map(item => ({ ...item, suppliers: suppliersByItemId.get(item.id) || [] }));
  }

  async createSupplyItem(item: InsertSupplyItem): Promise<SupplyItem> {
    const [created] = await db.insert(supplyItems).values(item).returning();
    return created;
  }

  async updateSupplyItem(id: string, updates: Partial<InsertSupplyItem>): Promise<SupplyItem | undefined> {
    const [updated] = await db
      .update(supplyItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supplyItems.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSupplyItem(id: string): Promise<boolean> {
    const result = await db.delete(supplyItems).where(eq(supplyItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateSupplyItemSuppliers(supplyItemId: string, supplierIds: string[]): Promise<void> {
    await db.delete(supplyItemSuppliers).where(eq(supplyItemSuppliers.supplyItemId, supplyItemId));
    if (supplierIds.length > 0) {
      await db.insert(supplyItemSuppliers).values(
        supplierIds.map(sid => ({ supplyItemId, supplierDirectoryId: sid }))
      );
    }
  }

  // Supplier Directory methods
  async getSupplierDirectory(): Promise<SupplierDirectory[]> {
    return await db.select().from(supplierDirectory).orderBy(supplierDirectory.companyName);
  }

  async createSupplierEntry(entry: InsertSupplierDirectory): Promise<SupplierDirectory> {
    const [created] = await db.insert(supplierDirectory).values(entry).returning();
    return created;
  }

  async updateSupplierEntry(id: string, updates: Partial<InsertSupplierDirectory>): Promise<SupplierDirectory | undefined> {
    const [updated] = await db
      .update(supplierDirectory)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supplierDirectory.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSupplierEntry(id: string): Promise<boolean> {
    const result = await db.delete(supplierDirectory).where(eq(supplierDirectory.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getExpenses(): Promise<Expense[]> {
    return db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  }

  async createExpense(expense: InsertExpense): Promise<Expense> {
    const [created] = await db.insert(expenses).values({ ...expense, amount: expense.amount.toFixed(2) }).returning();
    return created;
  }

  async updateExpense(id: string, updates: Partial<InsertExpense>): Promise<Expense | undefined> {
    const [updated] = await db.update(expenses).set({
      ...updates,
      amount: updates.amount === undefined ? undefined : updates.amount.toFixed(2),
      updatedAt: new Date(),
    }).where(eq(expenses.id, id)).returning();
    return updated || undefined;
  }

  async deleteExpense(id: string): Promise<boolean> {
    const result = await db.delete(expenses).where(eq(expenses.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async confirmRecurringExpense(category: "rent" | "salary", month: string, expenseDate: string): Promise<{ expense: Expense; created: boolean }> {
    const settings = await this.getExpenseSettings();
    const recurringKey = `${category}:${month}`;
    const [created] = await db.insert(expenses).values({
      item: category === "rent" ? "Rent" : "Salary",
      amount: (category === "rent" ? settings.rentAmount : settings.salaryAmount),
      expenseDate,
      category,
      recurringKey,
    }).onConflictDoNothing({ target: expenses.recurringKey }).returning();
    if (created) return { expense: created, created: true };
    const [existing] = await db.select().from(expenses).where(eq(expenses.recurringKey, recurringKey));
    if (!existing) throw new Error("Could not confirm recurring expense");
    return { expense: existing, created: false };
  }

  async getExpenseSettings(): Promise<ExpenseSettings> {
    const [existing] = await db.select().from(expenseSettings).where(eq(expenseSettings.id, 1));
    if (existing) return existing;
    const [created] = await db.insert(expenseSettings).values({ id: 1 }).onConflictDoNothing().returning();
    if (created) return created;
    const [settings] = await db.select().from(expenseSettings).where(eq(expenseSettings.id, 1));
    return settings;
  }

  async updateExpenseSettings(updates: { rentAmount: number; salaryAmount: number }): Promise<ExpenseSettings> {
    const [settings] = await db.insert(expenseSettings).values({
      id: 1, rentAmount: updates.rentAmount.toFixed(2), salaryAmount: updates.salaryAmount.toFixed(2), updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: expenseSettings.id,
      set: { rentAmount: updates.rentAmount.toFixed(2), salaryAmount: updates.salaryAmount.toFixed(2), updatedAt: new Date() },
    }).returning();
    return settings;
  }
}

export const storage = new DatabaseStorage();
