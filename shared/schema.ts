import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const inventoryItems = pgTable("inventory_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(), // "tyres", "wheels", "others"
  
  // Common fields
  quantity: integer("quantity").notNull().default(0),
  remark: text("remark"),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }), // Optional cost price
  sellingPrice: decimal("selling_price", { precision: 10, scale: 2 }), // Optional selling price
  atWarehouse: boolean("at_warehouse").notNull().default(false), // Legacy product-level field; per-unit location is stored on DOT units
  
  // Tyres fields
  brand: text("brand"), // Used for tyres and wheels
  pattern: text("pattern"), // Used for tyres only
  size: text("size"), // Used for tyres and wheels
  specialMarkings: text("special_markings"), // Used for tyres only
  
  // Wheels fields
  model: text("model"), // Used for wheels only
  pcd: text("pcd"), // Used for wheels only
  color: text("color"), // Used for wheels only
  
  // Others fields
  productName: text("product_name"), // Used for others only
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  invoiceDate: text("invoice_date").notNull(), // Store as string YYYY-MM-DD
  carNo: text("car_no"), // Changed from customerName, now optional
  customerName: text("customer_name"), // Changed from customerEmail
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  status: text("status").notNull().default("pending"), // pending, paid, overdue
  remark: text("remark"), // General invoice comments
  internalNotes: text("internal_notes"), // For internal use only
  deposit: decimal("deposit", { precision: 10, scale: 2 }).default("0.00"), // Deposit amount (subtracted from total)
  shipping: decimal("shipping", { precision: 10, scale: 2 }).default("0.00"), // Shipping cost (added to total)
  cost: decimal("cost", { precision: 10, scale: 2 }), // Total cost for profit calculation
  profit: decimal("profit", { precision: 10, scale: 2 }), // Calculated profit (totalAmount - cost)
  followUpRequired: integer("follow_up_required").default(0), // 0 = no follow-up, 1 = needs follow-up
  paymentReceivedDate: text("payment_received_date"), // Date when payment was received (YYYY-MM-DD)
  createdAt: text("created_at").notNull(), // Store as string YYYY-MM-DD
  updatedAt: text("updated_at").notNull(), // Store as string YYYY-MM-DD
});

export const invoiceItems = pgTable("invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  inventoryItemId: varchar("inventory_item_id").references(() => inventoryItems.id, { onDelete: "set null" }),
  category: text("category").notNull(),
  
  // Tyres fields
  brand: text("brand"),
  pattern: text("pattern"),
  size: text("size"),
  specialMarkings: text("special_markings"),
  
  // Wheels fields
  model: text("model"),
  pcd: text("pcd"),
  color: text("color"),
  
  // Others fields
  productName: text("product_name"),
  
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
});

// Individual tyre units with a DOT code. These supplement aggregate product
// quantity so existing products without DOT tracking continue to work.
export const inventoryDotUnits = pgTable("inventory_dot_units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryItemId: varchar("inventory_item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  dotCode: text("dot_code").notNull(),
  atWarehouse: boolean("at_warehouse").notNull().default(false),
  status: text("status").notNull().default("available"), // available | sold
  invoiceItemId: varchar("invoice_item_id").references(() => invoiceItems.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  soldAt: timestamp("sold_at"),
});

export const supplyItems = pgTable("supply_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brand: text("brand").notNull(),
  pattern: text("pattern").notNull(),
  size: text("size").notNull(),
  evCompatibility: text("ev_compatibility").default("No"),
  supplierContactName: text("supplier_contact_name"),
  supplierContactPhone: text("supplier_contact_phone"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supplierDirectory = pgTable("supplier_directory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  contactPerson1: text("contact_person_1"),
  contactPerson2: text("contact_person_2"),
  contactPerson3: text("contact_person_3"),
  phoneNumber: text("phone_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supplyItemSuppliers = pgTable("supply_item_suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supplyItemId: varchar("supply_item_id").notNull().references(() => supplyItems.id, { onDelete: "cascade" }),
  supplierDirectoryId: varchar("supplier_directory_id").notNull().references(() => supplierDirectory.id, { onDelete: "cascade" }),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  item: text("item").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: text("expense_date").notNull(), // YYYY-MM-DD
  category: text("category").notNull().default("other"), // rent | salary | other
  // Only confirmed recurring suggestions receive a key; regular manual entries remain nullable.
  recurringKey: text("recurring_key").unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// A single persistent row contains the recurring monthly suggestions.
export const expenseSettings = pgTable("expense_settings", {
  id: integer("id").primaryKey(),
  rentAmount: decimal("rent_amount", { precision: 12, scale: 2 }).notNull().default("42000.00"),
  salaryAmount: decimal("salary_amount", { precision: 12, scale: 2 }).notNull().default("75500.00"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Base schema without validation
export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Category-specific validation schemas
export const insertTyreSchema = z.object({
  category: z.literal("tyres"),
  brand: z.string().min(1, "Brand is required"),
  pattern: z.string().min(1, "Pattern is required"),
  size: z.string().min(1, "Size is required"),
  specialMarkings: z.string().optional(),
  quantity: z.number().min(0, "Quantity must be 0 or greater").optional(),
  costPrice: z.number().min(0, "Cost price must be 0 or greater").optional(),
  sellingPrice: z.number().min(0, "Selling price must be 0 or greater").nullable().optional(),
  remark: z.string().optional(),
});

export const insertWheelSchema = z.object({
  category: z.literal("wheels"),
  brand: z.string().min(1, "Brand is required"),
  model: z.string().min(1, "Model is required"),
  size: z.string().min(1, "Size is required"),
  pcd: z.string().min(1, "PCD is required"),
  color: z.string().min(1, "Color is required"),
  quantity: z.number().min(0, "Quantity must be 0 or greater").optional(),
  costPrice: z.number().min(0, "Cost price must be 0 or greater").optional(),
  sellingPrice: z.number().min(0, "Selling price must be 0 or greater").nullable().optional(),
  remark: z.string().optional(),
});

export const insertOtherSchema = z.object({
  category: z.literal("others"),
  productName: z.string().min(1, "Product name is required"),
  quantity: z.number().min(0, "Quantity must be 0 or greater").optional(),
  costPrice: z.number().min(0, "Cost price must be 0 or greater").optional(),
  sellingPrice: z.number().min(0, "Selling price must be 0 or greater").nullable().optional(),
  remark: z.string().optional(),
});

export const insertInventoryItemValidatedSchema = z.discriminatedUnion("category", [
  insertTyreSchema,
  insertWheelSchema,
  insertOtherSchema,
]);

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({
  id: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

const expenseAmountSchema = z.coerce.number()
  .finite("Amount must be a finite number")
  .min(0.01, "Amount must be at least 0.01")
  .max(9999999999.99, "Amount exceeds the maximum allowed")
  .refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001, "Amount may have at most two decimal places");

const expenseDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }, "Date must be a real calendar date");

export const insertExpenseSchema = z.object({
  item: z.string().trim().min(1, "Expense item is required").max(200),
  amount: expenseAmountSchema,
  expenseDate: expenseDateSchema,
  category: z.enum(["rent", "salary", "other"]),
});

export const confirmRecurringExpenseSchema = z.object({
  category: z.enum(["rent", "salary"]),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM").refine((value) => {
    const month = Number(value.slice(5));
    return month >= 1 && month <= 12;
  }, "Month must be a real calendar month"),
  expenseDate: expenseDateSchema,
}).refine(({ month, expenseDate }) => expenseDate.startsWith(`${month}-`), {
  message: "Confirmation date must fall within the selected month",
  path: ["expenseDate"],
});

export const updateExpenseSettingsSchema = z.object({
  rentAmount: expenseAmountSchema,
  salaryAmount: expenseAmountSchema,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type InsertInventoryItem = z.infer<typeof insertInventoryItemValidatedSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryDotUnit = typeof inventoryDotUnits.$inferSelect;
export type InventoryItemWithDotUnits = InventoryItem & {
  dotUnits: InventoryDotUnit[];
};

export type InsertTyre = z.infer<typeof insertTyreSchema>;
export type InsertWheel = z.infer<typeof insertWheelSchema>;
export type InsertOther = z.infer<typeof insertOtherSchema>;

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;

export type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
};

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseSettings = typeof expenseSettings.$inferSelect;

export type LoginRequest = z.infer<typeof loginSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

export const insertSupplyItemSchema = createInsertSchema(supplyItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupplyItem = z.infer<typeof insertSupplyItemSchema>;
export type SupplyItem = typeof supplyItems.$inferSelect;

export const insertSupplierDirectorySchema = createInsertSchema(supplierDirectory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupplierDirectory = z.infer<typeof insertSupplierDirectorySchema>;
export type SupplierDirectory = typeof supplierDirectory.$inferSelect;

export type SupplyItemWithSuppliers = SupplyItem & {
  suppliers: SupplierDirectory[];
};

// Order store — single JSON blob row that holds all client tabs + orders
export const orderStore = pgTable("order_store", {
  id: integer("id").primaryKey(),
  data: text("data").notNull().default("[]"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
