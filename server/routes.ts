import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getDashboardStats } from "./dashboard-stats";
import { invoiceNumberRepairSchema, InvoiceNumberRepairError } from "@shared/invoice-number-repair";
import { insertInventoryItemValidatedSchema, insertInventoryItemSchema, insertInvoiceSchema, insertInvoiceItemSchema, insertExpenseSchema, confirmRecurringExpenseSchema, updateExpenseSettingsSchema, loginSchema, changePasswordSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";
import session from "express-session";
import { pool } from "./db";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// Extend Express session interface
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
  }
}

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ message: "Authentication required" });
  }
};

const parseDotCodes = (value: unknown) => {
  const dotCodes = z.array(z.string().trim().min(1, "DOT code cannot be blank").max(60)).parse(value);
  return dotCodes.map((code) => code.toUpperCase());
};

const parseDotUnits = (value: unknown) =>
  z.array(z.object({
    id: z.string().optional(),
    dotCode: z.string().trim().min(1, "DOT code cannot be blank").max(60),
    atWarehouse: z.boolean().optional().default(false),
  })).parse(value).map((unit) => ({ ...unit, dotCode: unit.dotCode.toUpperCase() }));

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'kwokwahtyre-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(validatedData.username);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid username" });
      }

      // Set session
      req.session.userId = user.id;
      req.session.username = user.username;

      // Set longer cookie expiry if remember me is checked
      if (validatedData.rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      }

      res.json({ 
        user: { 
          id: user.id, 
          username: user.username, 
          displayName: user.displayName 
        } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  // Ping to keep session alive / check if still authenticated
  app.post("/api/auth/ping", requireAuth, (req, res) => {
    // Touching the session extends its maxAge
    req.session.touch();
    res.json({ authenticated: true });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.session.userId) {
      res.json({ 
        authenticated: true,
        userId: req.session.userId,
        username: req.session.username
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const validatedData = changePasswordSchema.parse(req.body);
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get current user to verify current password
      const user = await storage.getUserByUsername(req.session.username!);
      if (!user || !await bcrypt.compare(validatedData.currentPassword, user.password)) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash the new password before updating
      const hashedNewPassword = await bcrypt.hash(validatedData.newPassword, 10);
      const success = await storage.updateUserPassword(userId, hashedNewPassword);
      if (!success) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      // Send confirmation email using SendGrid
      try {
        const sgMail = await import('@sendgrid/mail');
        sgMail.default.setApiKey(process.env.SENDGRID_API_KEY!);

        const msg = {
          to: 'kwokwahtyre@biznetvigator.com', // Send to company email
          from: 'kwokwahtyre@biznetvigator.com', // Verified sender identity
          subject: 'Password Changed - Kwok Wah Tyre System',
          text: `Your password has been successfully changed for user: ${req.session.username}. If you did not make this change, please contact the administrator immediately.`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Password Changed</h2>
              <p>Your password has been successfully changed for the Kwok Wah Tyre management system.</p>
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>User:</strong> ${req.session.username}</p>
                <p><strong>Changed at:</strong> ${new Date().toLocaleString()}</p>
              </div>
              <p>If you did not make this change, please contact the administrator immediately.</p>
              <hr style="margin: 30px 0;">
              <p style="color: #666; font-size: 12px;">國華膠輪汽車用品 - Kwok Wah Tyre & Motoring Accessories Co.</p>
            </div>
          `,
        };

        await sgMail.default.send(msg);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the password change if email fails
      }
      
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Password change failed" });
    }
  });

  // Protected routes - Apply authentication middleware to existing routes
  // Inventory routes
  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const items = await storage.getInventoryItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch inventory items" });
    }
  });

  app.get("/api/inventory/:id", requireAuth, async (req, res) => {
    try {
      const item = await storage.getInventoryItem(req.params.id);
      if (!item) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch inventory item" });
    }
  });

  app.post("/api/inventory", requireAuth, async (req, res) => {
    try {
      const validatedData = insertInventoryItemValidatedSchema.parse(req.body);
      const dotUnits = req.body.dotUnits === undefined
        ? (req.body.dotCodes === undefined ? [] : parseDotCodes(req.body.dotCodes).map((dotCode) => ({ dotCode, atWarehouse: false })))
        : parseDotUnits(req.body.dotUnits);
      if (dotUnits.length > 0 && validatedData.category !== "tyres") {
        return res.status(400).json({ message: "DOT units can only be added to tyre inventory" });
      }
      const item = await storage.createInventoryItem(validatedData, dotUnits);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create inventory item" });
    }
  });

  app.put("/api/inventory/:id", async (req, res) => {
    try {
      // Use a more flexible validation for updates
      const validatedData = z.object({
        category: z.string().optional(),
        brand: z.string().nullable().optional(),
        pattern: z.string().nullable().optional(),
        size: z.string().nullable().optional(),
        specialMarkings: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        pcd: z.string().nullable().optional(),
        color: z.string().nullable().optional(),
        productName: z.string().nullable().optional(),
        quantity: z.number().optional(),
        costPrice: z.number().min(0).optional(),
         sellingPrice: z.number().min(0).nullable().optional(),
        remark: z.string().nullable().optional(),
      }).parse(req.body);
      
      const dotUnits = req.body.dotUnits === undefined
        ? (req.body.dotCodes === undefined ? undefined : parseDotCodes(req.body.dotCodes).map((dotCode) => ({ dotCode, atWarehouse: false })))
        : parseDotUnits(req.body.dotUnits);
      const item = await storage.updateInventoryItem(req.params.id, validatedData as any, dotUnits);
      if (!item) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update inventory item" });
    }
  });

  app.delete("/api/inventory/:id", async (req, res) => {
    try {
      const success = await storage.deleteInventoryItem(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      res.json({ message: "Inventory item deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete inventory item" });
    }
  });

  app.post("/api/inventory/bulk-update", async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: "Items must be an array" });
      }

      // Validate each item
      const validatedItems = items.map((item, index) => {
        try {
          return insertInventoryItemValidatedSchema.parse(item);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new Error(`Item ${index + 1}: ${error.errors.map(e => e.message).join(", ")}`);
          }
          throw error;
        }
      });

      const success = await storage.bulkUpdateInventory(validatedItems);
      if (!success) {
        return res.status(500).json({ message: "Failed to update inventory" });
      }

      res.json({ message: "Inventory updated successfully", count: validatedItems.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update inventory"
      });
    }
  });

  // Invoice routes
  app.get("/api/invoices", requireAuth, async (req, res) => {
    try {
      const invoicesWithItems = await storage.getInvoicesWithItems();
      res.json(invoicesWithItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Follow-up endpoints - must come before :id routes to avoid conflict
  app.get("/api/invoices/follow-up", requireAuth, async (req, res) => {
    try {
      const allInvoicesWithItems = await storage.getInvoicesWithItems();
      const followUpWithItems = allInvoicesWithItems.filter(inv => inv.followUpRequired === 1);
      res.json(followUpWithItems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch follow-up invoices" });
    }
  });

  app.put("/api/invoices/batch/repair-numbers", requireAuth, async (req, res) => {
    try {
      const { changes } = invoiceNumberRepairSchema.parse(req.body);
      const updatedCount = await storage.repairInvoiceNumbers(changes);
      res.json({ updatedCount });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0]?.message || "Invalid invoice numbers" });
      }
      if (error instanceof InvoiceNumberRepairError) {
        return res.status(error.status).json({ message: error.message });
      }
      const databaseError = error as { code?: string; cause?: { code?: string } };
      if (databaseError.code === "23505" || databaseError.cause?.code === "23505") {
        return res.status(409).json({ message: "An invoice number already exists. No invoice numbers were changed." });
      }
      console.error("Invoice number repair failed:", error);
      res.status(500).json({ message: "Could not repair invoice numbers. No invoice numbers were changed." });
    }
  });

  app.put("/api/invoices/batch/follow-up", requireAuth, async (req, res) => {
    try {
      const { ids, followUpRequired, paymentReceivedDate } = z.object({ 
        ids: z.array(z.string()).min(1, "At least one invoice ID is required"),
        followUpRequired: z.number().min(0).max(1),
        paymentReceivedDate: z.string().optional().nullable()
      }).parse(req.body);
      
      const success = await storage.batchUpdateInvoiceFollowUp(ids, followUpRequired, paymentReceivedDate);
      if (!success) {
        return res.status(500).json({ message: "Failed to update invoices" });
      }
      res.json({ message: `${ids.length} invoice(s) updated successfully` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to batch update follow-up status" });
    }
  });

  app.get("/api/invoices/:id", requireAuth, async (req, res) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  const createInvoiceSchema = z.object({
    invoice: z.object({
      invoiceNumber: z.string().optional(), // Make optional since backend generates it
      invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"), // Keep as string
      carNo: z.string().nullable().optional(),
      customerName: z.string().nullable().optional(),
      totalAmount: z.string().or(z.number()).transform((val) => val.toString()),
      status: z.string().default("pending"),
      remark: z.string().nullable().optional(),
      internalNotes: z.string().nullable().optional(),
      deposit: z.string().or(z.number()).transform((val) => val.toString()).default("0.00"),
      shipping: z.string().or(z.number()).transform((val) => val.toString()).default("0.00"),
      cost: z.string().or(z.number()).transform((val) => val.toString()).optional(),
      profit: z.string().or(z.number()).transform((val) => val.toString()).optional(),
    }),
    items: z.array(z.object({
      category: z.string(),
      brand: z.string().nullable().optional(),
      pattern: z.string().nullable().optional(),
      size: z.string().nullable().optional(),
      specialMarkings: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      pcd: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      productName: z.string().nullable().optional(),
      quantity: z.number(),
      price: z.number(),
      inventoryItemId: z.string().uuid().optional(),
      dotUnitIds: z.array(z.string().uuid()).optional(),
      skipInventory: z.boolean().optional(),
    }))
  });

  app.post("/api/invoices", requireAuth, async (req, res) => {
    try {
      const { invoice: invoiceData, items } = createInvoiceSchema.parse(req.body);
      
      if (items.length === 0) {
        return res.status(400).json({ message: "Invoice must have at least one item" });
      }

      // Check inventory availability. Explicit selections always use their exact inventory ID.
      const inventoryItems = await storage.getInventoryItems();
      const requestedByInventoryId = new Map<string, { item: typeof items[number]; quantity: number }>();
      const selectedDotUnitIds = new Set<string>();

      for (const item of items) {
        if (item.skipInventory) continue;

        let inventoryItem = item.inventoryItemId
          ? inventoryItems.find(inv => inv.id === item.inventoryItemId)
          : undefined;

        if (item.inventoryItemId && !inventoryItem) {
          return res.status(400).json({
            message: "The selected inventory item no longer exists. Please choose a product again.",
          });
        }

        // Preserve legacy matching for invoices created outside the new invoice form.
        if (!inventoryItem) {
          if (item.category === "tyres") {
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
        }

        if (item.dotUnitIds !== undefined) {
          if (!item.inventoryItemId || item.skipInventory || item.dotUnitIds.length !== item.quantity) {
            return res.status(400).json({
              message: "Select one DOT unit for each item from the chosen inventory product.",
            });
          }
          if (new Set(item.dotUnitIds).size !== item.dotUnitIds.length ||
              item.dotUnitIds.some((dotUnitId) => selectedDotUnitIds.has(dotUnitId))) {
            return res.status(400).json({ message: "A DOT unit may only be selected once per invoice." });
          }
          const availableDotUnits = inventoryItem?.dotUnits.filter((unit) => unit.status === "available") ?? [];
          const availableDotUnitIds = new Set(availableDotUnits.map((unit) => unit.id));
          if (item.dotUnitIds.some((dotUnitId) => !availableDotUnitIds.has(dotUnitId))) {
            return res.status(400).json({
              message: "One or more selected DOT units are unavailable. Refresh and choose again.",
            });
          }
          item.dotUnitIds.forEach((dotUnitId) => selectedDotUnitIds.add(dotUnitId));
        } else if (inventoryItem?.dotUnits.some((unit) => unit.status === "available")) {
          return res.status(400).json({
            message: "Select the exact DOT unit(s) for this inventory product before creating the invoice.",
          });
        }
        
        if (inventoryItem) {
          const requested = requestedByInventoryId.get(inventoryItem.id);
          requestedByInventoryId.set(inventoryItem.id, {
            item,
            quantity: (requested?.quantity || 0) + item.quantity,
          });
        }
      }

      for (const [inventoryItemId, request] of Array.from(requestedByInventoryId.entries())) {
        const inventoryItem = inventoryItems.find(inv => inv.id === inventoryItemId);
        if (inventoryItem && inventoryItem.quantity < request.quantity) {
          const item = request.item;
          let productDescription = "";
          if (item.category === "tyres") {
            productDescription = `${item.brand} ${item.pattern} (${item.size})`;
          } else if (item.category === "wheels") {
            productDescription = `${item.brand} ${item.model} (${item.size})`;
          } else {
            productDescription = item.productName || "Unknown product";
          }
          return res.status(400).json({ 
            message: `Insufficient stock for ${productDescription}. Available: ${inventoryItem.quantity}, Requested: ${request.quantity}`,
            type: "insufficient_stock",
            inventoryItemId: inventoryItem.id,
            productDescription,
            availableStock: inventoryItem.quantity,
            requestedQuantity: request.quantity
          });
        }
      }

      const itemsWithInvoiceId = items.map(item => ({ ...item, invoiceId: "temp" }));
      const invoice = await storage.createInvoice(invoiceData, itemsWithInvoiceId);
      res.status(201).json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create invoice" });
    }
  });

  app.put("/api/invoices/:id", async (req, res) => {
    try {
      const { invoice: invoiceData, items } = createInvoiceSchema.parse(req.body);
      
      if (items.length === 0) {
        return res.status(400).json({ message: "Invoice must have at least one item" });
      }

      const itemsWithInvoiceId = items.map(item => ({ ...item, invoiceId: req.params.id }));
      const updatedInvoice = await storage.updateInvoice(req.params.id, invoiceData, itemsWithInvoiceId);
      
      if (!updatedInvoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      res.json(updatedInvoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update invoice" });
    }
  });

  app.put("/api/invoices/:id/status", async (req, res) => {
    try {
      const { status } = z.object({ status: z.string() }).parse(req.body);
      const success = await storage.updateInvoiceStatus(req.params.id, status);
      if (!success) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json({ message: "Invoice status updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update invoice status" });
    }
  });

  app.delete("/api/invoices/:id", async (req, res) => {
    try {
      const success = await storage.deleteInvoice(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete invoice" });
    }
  });

  app.patch("/api/invoices/:id/profit", async (req, res) => {
    try {
      const { cost } = z.object({ cost: z.number().min(0).nullable() }).parse(req.body);
      const success = await storage.updateInvoiceProfit(req.params.id, cost);
      if (!success) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json({ message: "Profit calculated and saved successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to calculate profit" });
    }
  });

  // Individual invoice follow-up endpoint
  app.put("/api/invoices/:id/follow-up", requireAuth, async (req, res) => {
    try {
      const { followUpRequired, paymentReceivedDate } = z.object({ 
        followUpRequired: z.number().min(0).max(1),
        paymentReceivedDate: z.string().optional().nullable()
      }).parse(req.body);
      
      const success = await storage.updateInvoiceFollowUp(req.params.id, followUpRequired, paymentReceivedDate);
      if (!success) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      res.json({ message: "Invoice follow-up status updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update follow-up status" });
    }
  });

  // Restore invoices from backup
  app.post("/api/invoices/restore", requireAuth, async (req, res) => {
    try {
      const { invoices: backupInvoices } = req.body;
      
      if (!Array.isArray(backupInvoices)) {
        return res.status(400).json({ message: "Invalid backup format" });
      }

      // Restore each invoice with its items
      let restoredCount = 0;
      for (const invoiceData of backupInvoices) {
        const { items, ...invoiceFields } = invoiceData;
        
        // Check if invoice already exists
        const existing = await storage.getInvoice(invoiceData.id);
        
        if (!existing) {
          // Create invoice with proper field mapping
          const invoice = await storage.createInvoice({
            ...invoiceFields,
            invoiceNumber: invoiceFields.invoiceNumber || '',
            totalAmount: String(invoiceFields.totalAmount || '0'),
            status: invoiceFields.status || 'pending',
            deposit: String(invoiceFields.deposit || '0'),
            shipping: String(invoiceFields.shipping || '0')
          });
          
          // Create invoice items if they exist
          if (items && Array.isArray(items)) {
            for (const item of items) {
              await storage.createInvoiceItem({ 
                ...item, 
                invoiceId: invoice.id,
                price: String(item.price || '0')
              });
            }
          }
          
          restoredCount++;
        }
      }

      res.json({ 
        message: `Successfully restored ${restoredCount} invoices`,
        restoredCount 
      });
    } catch (error) {
      console.error('Restore error:', error);
      res.status(500).json({ message: "Failed to restore backup" });
    }
  });

  // Test backup email endpoint (manual trigger)
  app.post("/api/invoices/test-backup-email", requireAuth, async (req, res) => {
    try {
      const sgMail = await import('@sendgrid/mail');
      const apiKey = process.env.SENDGRID_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ message: "SendGrid API key not configured" });
      }

      sgMail.default.setApiKey(apiKey);

      // Get all invoices with items
      const invoicesWithItems = await storage.getInvoicesWithItems();

      // Create backup data
      const backupData = {
        exportDate: new Date().toISOString(),
        invoices: invoicesWithItems
      };

      const jsonContent = JSON.stringify(backupData, null, 2);
      const base64Content = Buffer.from(jsonContent).toString('base64');

      // Generate filename with current date
      const now = new Date();
      const dateStr = now.getFullYear() + '-' + 
                     String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(now.getDate()).padStart(2, '0');
      const filename = `invoices-backup-test-${dateStr}.json`;

      // Send email with attachment
      const msg = {
        to: 'hbcheung8z@yahoo.com',
        from: 'kwokwahtyre@biznetvigator.com',
        subject: `TyrePro Test Backup - ${dateStr}`,
        text: `This is a TEST of the automated weekly backup system.\n\nBackup Date: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}\nTotal Invoices: ${invoicesWithItems.length}\n\nThis backup file contains all invoice data and can be restored using the Restore function in the Invoice Management page.`,
        html: `
          <h2>TyrePro Test Backup</h2>
          <p><strong>⚠️ This is a TEST email</strong></p>
          <p><strong>Backup Date:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}</p>
          <p><strong>Total Invoices:</strong> ${invoicesWithItems.length}</p>
          <p>This backup file contains all invoice data and can be restored using the <strong>Restore</strong> function in the Invoice Management page.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">The automated backup will run every Saturday at 11:59 PM Hong Kong time.</p>
        `,
        attachments: [
          {
            content: base64Content,
            filename: filename,
            type: 'application/json',
            disposition: 'attachment'
          }
        ]
      };

      await sgMail.default.send(msg);
      console.log(`Test backup email sent successfully to hbcheung8z@yahoo.com`);
      
      res.json({ 
        message: "Test backup email sent successfully",
        invoiceCount: invoicesWithItems.length,
        recipient: "hbcheung8z@yahoo.com"
      });
    } catch (error: any) {
      console.error('Failed to send test backup email:', error);
      res.status(500).json({ 
        message: "Failed to send test backup email",
        error: error?.message || "Unknown error"
      });
    }
  });

  // Expense routes
  app.get("/api/expenses", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getExpenses());
    } catch {
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", requireAuth, async (req, res) => {
    try {
      const expense = await storage.createExpense(insertExpenseSchema.parse(req.body));
      res.status(201).json(expense);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid expense data", errors: error.errors });
      res.status(500).json({ message: "Failed to create expense" });
    }
  });

  app.post("/api/expenses/confirm-recurring", requireAuth, async (req, res) => {
    try {
      const { category, month, expenseDate } = confirmRecurringExpenseSchema.parse(req.body);
      const result = await storage.confirmRecurringExpense(category, month, expenseDate);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid recurring confirmation", errors: error.errors });
      res.status(500).json({ message: "Failed to confirm recurring expense" });
    }
  });

  app.put("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      const updates = insertExpenseSchema.partial().parse(req.body);
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No expense updates provided" });
      const expense = await storage.updateExpense(req.params.id, updates);
      if (!expense) return res.status(404).json({ message: "Expense not found" });
      res.json(expense);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid expense data", errors: error.errors });
      res.status(500).json({ message: "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    try {
      if (!await storage.deleteExpense(req.params.id)) return res.status(404).json({ message: "Expense not found" });
      res.json({ message: "Expense deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });

  app.get("/api/expense-settings", requireAuth, async (_req, res) => {
    try {
      res.json(await storage.getExpenseSettings());
    } catch {
      res.status(500).json({ message: "Failed to fetch expense settings" });
    }
  });

  app.put("/api/expense-settings", requireAuth, async (req, res) => {
    try {
      res.json(await storage.updateExpenseSettings(updateExpenseSettingsSchema.parse(req.body)));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
      res.status(500).json({ message: "Failed to update expense settings" });
    }
  });

  // Stats endpoint for dashboard
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      res.json(await getDashboardStats());
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Invoice search by product keyword / tyre size
  app.get("/api/statistics/invoice-search", requireAuth, async (req, res) => {
    try {
      const q = ((req.query.q as string) || "").trim().toLowerCase();
      if (!q) return res.json([]);

      const invoicesWithItems = await storage.getInvoicesWithItems();

      const results: {
        invoiceId: string;
        invoiceNumber: string;
        invoiceDate: string | null;
        customerName: string | null;
        carNo: string | null;
        totalAmount: string;
        matchedItems: { label: string; quantity: number; price: string }[];
      }[] = [];

      for (const invoice of invoicesWithItems) {
        if (!invoice.items) continue;
        const matched = invoice.items.filter((item) => {
          const fields = [
            item.brand,
            item.pattern,
            item.size,
            item.model,
            item.productName,
            item.specialMarkings,
            item.color,
            item.pcd,
            item.category,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return fields.includes(q);
        });
        if (matched.length === 0) continue;

        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate ?? null,
          customerName: invoice.customerName ?? null,
          carNo: invoice.carNo ?? null,
          totalAmount: invoice.totalAmount,
          matchedItems: matched.map((item) => ({
            label: [item.brand, item.pattern, item.size, item.model, item.productName]
              .filter(Boolean)
              .join(" ")
              .trim() || item.category,
            quantity: item.quantity,
            price: item.price,
          })),
        });
      }

      // Sort newest first
      results.sort((a, b) => {
        const da = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
        const db = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
        return db - da;
      });

      res.json(results);
    } catch (error) {
      console.error("Invoice search error:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // Statistics endpoint for detailed analytics
  app.get("/api/statistics", requireAuth, async (req, res) => {
    try {
      const timeRange = req.query.timeRange as string || "all";
      const now = new Date();
      
      const invoicesWithItems = await storage.getInvoicesWithItems();
      
      // Filter invoices by time range
      let filteredInvoices = invoicesWithItems;
      
      if (timeRange === "month") {
        filteredInvoices = invoicesWithItems.filter(inv => {
          const date = new Date(inv.invoiceDate || inv.createdAt!);
          return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
        });
      } else if (timeRange === "quarter") {
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        filteredInvoices = invoicesWithItems.filter(inv => {
          const date = new Date(inv.invoiceDate || inv.createdAt!);
          return date >= quarterStart;
        });
      } else if (timeRange === "year") {
        filteredInvoices = invoicesWithItems.filter(inv => {
          const date = new Date(inv.invoiceDate || inv.createdAt!);
          return date.getFullYear() === now.getFullYear();
        });
      }

      // Aggregate product sales from all invoice items
      const productSalesMap = new Map<string, {
        productName: string;
        brand: string;
        category: string;
        size: string;
        totalQuantitySold: number;
        totalRevenue: number;
        invoiceCount: number;
      }>();

      for (const invoice of filteredInvoices) {
        if (invoice.items) {
          for (const item of invoice.items) {
            const productKey = `${item.category}-${item.brand || ''}-${item.pattern || ''}-${item.model || ''}-${item.size || ''}-${item.productName || ''}`;
            const existing = productSalesMap.get(productKey);
            const itemTotal = (item.quantity || 0) * parseFloat(item.price || "0");
            
            if (existing) {
              existing.totalQuantitySold += item.quantity || 0;
              existing.totalRevenue += itemTotal;
              existing.invoiceCount += 1;
            } else {
              productSalesMap.set(productKey, {
                productName: item.productName || (item.brand ? `${item.brand} ${item.pattern || item.model || ''} ${item.size || ''}`.trim() : 'Unknown'),
                brand: item.brand || '',
                category: item.category || 'others',
                size: item.size || '',
                totalQuantitySold: item.quantity || 0,
                totalRevenue: itemTotal,
                invoiceCount: 1
              });
            }
          }
        }
      }

      // Hidden / excluded product names (case-insensitive partial match)
      const HIDDEN_PRODUCTS = ["valvel", "戥呔鉛", "z42611nutsj78"];

      const productSales = Array.from(productSalesMap.values())
        .filter(p => {
          // Only include tyre items that have a size specified
          if (p.category !== 'tyres' || !p.size || p.size.trim() === '') return false;
          // Exclude explicitly blocked item names
          const nameLower = p.productName.toLowerCase();
          if (HIDDEN_PRODUCTS.some(blocked => nameLower.includes(blocked.toLowerCase()))) return false;
          return true;
        })
        .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold);

      // Aggregate customer data
      const customerMap = new Map<string, {
        customerName: string;
        totalSpent: number;
        invoiceCount: number;
      }>();

      for (const invoice of filteredInvoices) {
        const customerName = invoice.customerName || "Walk-in";
        const existing = customerMap.get(customerName);
        const amount = parseFloat(invoice.totalAmount || "0");
        
        if (existing) {
          existing.totalSpent += amount;
          existing.invoiceCount += 1;
        } else {
          customerMap.set(customerName, {
            customerName,
            totalSpent: amount,
            invoiceCount: 1
          });
        }
      }

      const topCustomers = Array.from(customerMap.values())
        .map(c => ({
          ...c,
          averageOrderValue: Math.round(c.totalSpent / c.invoiceCount)
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent);

      // Category breakdown
      const categoryMap = new Map<string, {
        category: string;
        totalQuantity: number;
        totalRevenue: number;
        itemCount: number;
      }>();

      for (const invoice of filteredInvoices) {
        if (invoice.items) {
          for (const item of invoice.items) {
            const category = item.category || 'others';
            const existing = categoryMap.get(category);
            const itemTotal = (item.quantity || 0) * parseFloat(item.price || "0");
            
            if (existing) {
              existing.totalQuantity += item.quantity || 0;
              existing.totalRevenue += itemTotal;
              existing.itemCount += 1;
            } else {
              categoryMap.set(category, {
                category,
                totalQuantity: item.quantity || 0,
                totalRevenue: itemTotal,
                itemCount: 1
              });
            }
          }
        }
      }

      const categoryBreakdown = Array.from(categoryMap.values())
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      // Monthly sales trend (last 12 months)
      const monthlyMap = new Map<string, { revenue: number; invoiceCount: number }>();
      
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap.set(monthKey, { revenue: 0, invoiceCount: 0 });
      }

      for (const invoice of invoicesWithItems) {
        const date = new Date(invoice.invoiceDate || invoice.createdAt!);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const existing = monthlyMap.get(monthKey);
        if (existing) {
          existing.revenue += parseFloat(invoice.totalAmount || "0");
          existing.invoiceCount += 1;
        }
      }

      const monthlySales = Array.from(monthlyMap.entries()).map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: Math.round(data.revenue),
        invoiceCount: data.invoiceCount
      }));

      // Summary stats
      const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || "0"), 0);
      const uniqueCustomers = new Set(filteredInvoices.map(inv => inv.customerName || "Walk-in")).size;

      res.json({
        productSales,
        topCustomers,
        categoryBreakdown,
        monthlySales,
        summary: {
          totalProducts: productSales.reduce((sum, p) => sum + p.totalQuantitySold, 0),
          totalCustomers: uniqueCustomers,
          totalRevenue: Math.round(totalRevenue),
          averageOrderValue: filteredInvoices.length > 0 ? Math.round(totalRevenue / filteredInvoices.length) : 0
        }
      });
    } catch (error) {
      console.error("Statistics error:", error);
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });

  // Supply routes
  app.get("/api/supply", requireAuth, async (req, res) => {
    try {
      const items = await storage.getSupplyItemsWithSuppliers();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supply items" });
    }
  });

  app.post("/api/supply", requireAuth, async (req, res) => {
    try {
      const { supplierIds = [], ...itemData } = req.body;
      const item = await storage.createSupplyItem(itemData);
      await storage.updateSupplyItemSuppliers(item.id, supplierIds);
      const [withSuppliers] = (await storage.getSupplyItemsWithSuppliers()).filter(i => i.id === item.id);
      res.status(201).json(withSuppliers || item);
    } catch (error) {
      res.status(500).json({ message: "Failed to create supply item" });
    }
  });

  app.put("/api/supply/:id", requireAuth, async (req, res) => {
    try {
      const { supplierIds = [], ...itemData } = req.body;
      const updated = await storage.updateSupplyItem(req.params.id, itemData);
      if (!updated) return res.status(404).json({ message: "Supply item not found" });
      await storage.updateSupplyItemSuppliers(req.params.id, supplierIds);
      const [withSuppliers] = (await storage.getSupplyItemsWithSuppliers()).filter(i => i.id === req.params.id);
      res.json(withSuppliers || updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update supply item" });
    }
  });

  app.delete("/api/supply/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteSupplyItem(req.params.id);
      if (!success) return res.status(404).json({ message: "Supply item not found" });
      res.json({ message: "Supply item deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete supply item" });
    }
  });

  // Supplier Directory routes
  app.get("/api/supplier-directory", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getSupplierDirectory());
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch supplier directory" });
    }
  });

  app.post("/api/supplier-directory", requireAuth, async (req, res) => {
    try {
      const entry = await storage.createSupplierEntry(req.body);
      res.status(201).json(entry);
    } catch (error) {
      res.status(500).json({ message: "Failed to create supplier entry" });
    }
  });

  app.put("/api/supplier-directory/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateSupplierEntry(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Supplier not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update supplier entry" });
    }
  });

  app.delete("/api/supplier-directory/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteSupplierEntry(req.params.id);
      if (!success) return res.status(404).json({ message: "Supplier not found" });
      res.json({ message: "Supplier deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete supplier entry" });
    }
  });

  // ── Order store (single-row JSON blob, syncs across devices) ──────────────
  // Create table on first boot if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_store (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  app.get("/api/order-store", requireAuth, async (req, res) => {
    try {
      const result = await pool.query("SELECT data FROM order_store WHERE id = 1");
      if (result.rows.length === 0) return res.json({ data: null });
      res.json({ data: JSON.parse(result.rows[0].data) });
    } catch (error) {
      res.status(500).json({ message: "Failed to load order data" });
    }
  });

  app.put("/api/order-store", requireAuth, async (req, res) => {
    try {
      const jsonStr = JSON.stringify(req.body.data ?? []);
      await pool.query(
        `INSERT INTO order_store (id, data, updated_at)
         VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
        [jsonStr]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to save order data" });
    }
  });

  // ── Invoice Screenshot Scanner ──
  app.post("/api/invoice-scan", requireAuth, async (req, res) => {
    try {
      const { image } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ message: "Image (base64 data URL) required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract invoice/quotation information from this image and return ONLY a JSON object with these exact fields:
{
  "customerName": "customer or buyer name, or null",
  "carNo": "vehicle plate / car number / 客戶名稱/車牌 field value, or null",
  "invoiceDate": "date in YYYY-MM-DD format, or null",
  "remark": "any remarks, notes, or comments, or null",
  "items": [
    {
      "productName": "full product description including brand, model, size, specifications",
      "quantity": <integer number>,
      "price": <unit price as decimal number, not the line total>
    }
  ]
}

Field label mappings (the image may use these Chinese labels):
- "日期" or "Date" → invoiceDate (convert to YYYY-MM-DD)
- "客戶名稱/車牌" or "車牌" or "Car No." or "車號" → carNo (extract the full value of this field)
- "客戶名稱" or "Customer" or "Name" → customerName
- "備註" or "Remark" or "Notes" → remark

Line-item column label mappings:
- "輪胎/鈴/其他" or "輪胎" or "貨品" or "Item" or "Description" or "Product" → productName (the product/item description column)
- "數量" or "Qty" or "Quantity" → quantity (integer)
- "價錢" or "單價" or "Price" or "Unit Price" → price (unit price per item as a decimal number)

Rules:
- Each line item in the image = one entry in items[]
- "price" is the UNIT price per item. If you see a line total with quantity > 1, divide total by quantity to get unit price.
- Include brand, tyre size (e.g. 225/45R17), rim size, or any specs in productName
- Text may be Chinese, English, or mixed — extract all
- Return null for any field not found in the image
- Always return at least one item in the items array`
            },
            {
              type: "image_url",
              image_url: { url: image, detail: "high" }
            }
          ]
        }],
        response_format: { type: "json_object" },
        max_tokens: 1500,
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch {}

      // Sanitise types
      const items = Array.isArray(parsed.items) ? parsed.items.map((it: any) => ({
        productName: String(it.productName ?? ""),
        quantity: isNaN(Number(it.quantity)) ? 1 : Number(it.quantity),
        price: isNaN(Number(it.price)) ? 0 : Number(it.price),
      })) : [];

      res.json({
        customerName: parsed.customerName ?? null,
        carNo: parsed.carNo ?? null,
        invoiceDate: parsed.invoiceDate ?? null,
        remark: parsed.remark ?? null,
        items: items.length > 0 ? items : [{ productName: "", quantity: 1, price: 0 }],
      });
    } catch (error: any) {
      console.error("Invoice scan error:", error);
      res.status(500).json({ message: "Failed to scan image" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
