import { useState, useEffect, useRef, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Plus, Trash2, Eye, EyeOff, PackagePlus, Camera, Upload, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { publishCreatedInvoice } from "@/lib/invoice-cache";
import { apiRequest } from "@/lib/queryClient";
import {
  insertInvoiceSchema,
  type InventoryItemWithDotUnits,
  type InvoiceWithItems,
  type InsertInventoryItem,
} from "@shared/schema";
import InvoicePreviewModal from "@/components/invoice-preview-modal";
import AddInventoryModal from "@/components/add-inventory-modal";

const invoiceItemSchema = z.object({
  productName: z.string().min(1, "Product name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1").optional(),
  price: z.number().optional(), // Allow negative prices for discounts/credits
});

const createInvoiceFormSchema = insertInvoiceSchema.extend({
  invoiceNumber: z.string().optional(), // Optional since backend generates it
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
  remark: z.string().optional(),
  internalNotes: z.string().optional(),
  deposit: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
});

type CreateInvoiceForm = z.infer<typeof createInvoiceFormSchema>;

interface MissingInventoryItem {
  rowId: string;
  index: number;
  productName: string;
  quantity?: number;
  price?: number;
}

export interface PrefilledInvoiceItem {
  productName: string;
  quantity: number;
  price: number;
}

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated?: (invoice: any) => void;
  initialItems?: PrefilledInvoiceItem[];
  initialCost?: number;
  initialCustomerName?: string;
}

// Helper function to generate invoice number using timestamp
const generateInvoiceNumber = () => {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = now.getTime().toString().slice(-5); // Last 5 digits of timestamp
  return `KW${year}${month}-${timestamp}`;
};

// Helper function to get today's date in YYYY-MM-DD format
const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeSearchText = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const getInventoryDisplayName = (item: InventoryItemWithDotUnits) => {
  if (item.category === "tyres") {
    return [
      `${item.brand || ""} ${item.pattern || ""}`.trim(),
      item.size,
      item.specialMarkings,
    ].filter(Boolean).join(" - ");
  }

  if (item.category === "wheels") {
    return [
      `${item.brand || ""} ${item.model || ""}`.trim(),
      item.size,
      item.pcd ? `PCD ${item.pcd}` : "",
      item.color,
    ].filter(Boolean).join(" - ");
  }

  return item.productName || "";
};

const getInventorySearchText = (item: InventoryItemWithDotUnits) =>
  [
    item.category,
    item.brand,
    item.pattern,
    item.size,
    item.specialMarkings,
    item.model,
    item.pcd,
    item.color,
    item.productName,
    getInventoryDisplayName(item),
  ].filter(Boolean).join(" ");

const extractProductSize = (value: string) => {
  const match = value.toUpperCase().match(/(\d{3})\s*\/\s*(\d{2})\s*R\s*(\d{2})/);
  return match ? `${match[1]}/${match[2]}R${match[3]}` : undefined;
};

const brandAppearsInQuery = (brand: string | null | undefined, query: string) => {
  if (!brand) return false;
  const normalizedBrand = normalizeSearchText(brand);
  const normalizedQuery = normalizeSearchText(query);
  return normalizedQuery === normalizedBrand || normalizedQuery.includes(` ${normalizedBrand} `) ||
    normalizedQuery.startsWith(`${normalizedBrand} `) ||
    normalizedQuery.endsWith(` ${normalizedBrand}`);
};

const getTyreInitialValues = (productName: string): Partial<InsertInventoryItem> => {
  const sizeMatch = productName.match(/(\d{3})\s*\/\s*(\d{2})\s*R\s*(\d{2})/i);
  if (!sizeMatch) return {};

  const size = `${sizeMatch[1]}/${sizeMatch[2]}R${sizeMatch[3]}`;
  const sizeStart = sizeMatch.index ?? productName.length;
  const beforeSize = productName.slice(0, sizeStart).replace(/[-|]\s*$/, "").trim();
  const specialMarkings = productName.slice(sizeStart + sizeMatch[0].length)
    .replace(/^[\s|-]+/, "")
    .trim();
  const [brand = "", ...patternParts] = beforeSize.split(/\s+/);

  return {
    brand,
    pattern: patternParts.join(" "),
    size,
    specialMarkings,
  };
};

const getRankedInventoryItems = (
  items: InventoryItemWithDotUnits[],
  query: string,
  requireExactTyreIdentity = true,
) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const queryTerms = normalizedQuery.split(" ").filter(Boolean);
  const requestedSize = extractProductSize(query);

  return items
    .map((item) => {
      if (requireExactTyreIdentity) {
        const inventorySize = extractProductSize(item.size || "");
        if (!requestedSize || inventorySize !== requestedSize || !brandAppearsInQuery(item.brand, query)) {
          return null;
        }
      }

      const displayName = normalizeSearchText(getInventoryDisplayName(item));
      const searchText = normalizeSearchText(getInventorySearchText(item));
      let score = 0;

      if (displayName === normalizedQuery) score += 1000;
      if (searchText.includes(normalizedQuery)) score += 450;

      for (const term of queryTerms) {
        if (searchText.split(" ").includes(term)) score += 120;
        else if (searchText.split(" ").some((word) => word.startsWith(term))) score += 75;
        else if (searchText.includes(term)) score += 40;
      }

      return { item, score };
    })
    .filter((match): match is { item: InventoryItemWithDotUnits; score: number } => !!match && match.score > 0)
    .sort((a, b) => b.score - a.score || b.item.quantity - a.item.quantity)
    .slice(0, 8)
    .map(({ item }) => item);
};

const findExactInventoryItem = (items: InventoryItemWithDotUnits[], productName: string) => {
  const normalizedName = normalizeSearchText(productName);
  if (!normalizedName) return undefined;

  return items.find((item) =>
    normalizeSearchText(getInventoryDisplayName(item)) === normalizedName
  );
};

export default function CreateInvoiceModal({ isOpen, onClose, onInvoiceCreated, initialItems, initialCost, initialCustomerName }: CreateInvoiceModalProps) {
  const { toast } = useToast();
  const [showDepositShipping, setShowDepositShipping] = useState(false);
  const [searchQueries, setSearchQueries] = useState<{ [key: number]: string }>({});
  const [showResults, setShowResults] = useState<{ [key: number]: boolean }>({});
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceWithItems | null>(null);
  const [stockRefillInfo, setStockRefillInfo] = useState<{
    inventoryItemId: string;
    productDescription: string;
    availableStock: number;
    requestedQuantity: number;
  } | null>(null);
  const [stockRefillAmount, setStockRefillAmount] = useState<number>(0);
  const [pendingFormData, setPendingFormData] = useState<CreateInvoiceForm | null>(null);
  const [isBlankInvoice, setIsBlankInvoice] = useState(false);
  const [scanImageUrl, setScanImageUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showProductSuggestions, setShowProductSuggestions] = useState<Record<string, boolean>>({});
  const [selectedInventoryIds, setSelectedInventoryIds] = useState<Record<string, string>>({});
  const [selectedDotUnitIds, setSelectedDotUnitIds] = useState<Record<string, string[]>>({});
  const [missingItemsToAdd, setMissingItemsToAdd] = useState<Record<string, boolean>>({});
  const [missingInventoryItems, setMissingInventoryItems] = useState<MissingInventoryItem[]>([]);
  const [pendingInvoiceData, setPendingInvoiceData] = useState<CreateInvoiceForm | null>(null);
  const [activeInventoryAdd, setActiveInventoryAdd] = useState<MissingInventoryItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefilledRef = useRef(false);
  const selectedInventoryRef = useRef<Record<string, InventoryItemWithDotUnits>>({});
  const skippedInventoryRowsRef = useRef<Set<string>>(new Set());
  const inventoryAddCompletedRef = useRef(false);

  const handleBlankInvoiceToggle = (checked: boolean) => {
    setIsBlankInvoice(checked);
    selectedInventoryRef.current = {};
    skippedInventoryRowsRef.current.clear();
    setSelectedInventoryIds({});
    setSelectedDotUnitIds({});
    setShowProductSuggestions({});
    if (checked) {
      form.setValue("carNo", "1");
      form.setValue("items.0.productName", "1");
      form.setValue("items.0.quantity", 1);
      form.setValue("items.0.price", 1);
    } else {
      form.setValue("carNo", "");
      form.setValue("items.0.productName", "");
      form.setValue("items.0.quantity", undefined);
      form.setValue("items.0.price", undefined);
    }
  };

  const { data: inventoryItems = [] } = useQuery<InventoryItemWithDotUnits[]>({
    queryKey: ["/api/inventory"],
  });


  const form = useForm<CreateInvoiceForm>({
    resolver: zodResolver(createInvoiceFormSchema),
    defaultValues: {
      invoiceNumber: "", // Let backend generate sequential number
      invoiceDate: getTodayDateString(),
      carNo: "",
      customerName: "",
      status: "pending",
      remark: "",
      internalNotes: "",
      items: [{ productName: "", quantity: undefined, price: undefined }],
      deposit: undefined,
      shipping: undefined,
      cost: undefined,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const clearInventorySelection = (rowId: string) => {
    delete selectedInventoryRef.current[rowId];
    setSelectedInventoryIds((current) => {
      const updated = { ...current };
      delete updated[rowId];
      return updated;
    });
    setSelectedDotUnitIds((current) => {
      const updated = { ...current };
      delete updated[rowId];
      return updated;
    });
  };

  const selectInventoryItem = (item: InventoryItemWithDotUnits, rowId: string, index: number) => {
    selectedInventoryRef.current[rowId] = item;
    setSelectedInventoryIds((current) => ({ ...current, [rowId]: item.id }));
    setSelectedDotUnitIds((current) => ({ ...current, [rowId]: [] }));
    form.setValue(`items.${index}.productName`, getInventoryDisplayName(item), {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (item.sellingPrice !== null && item.sellingPrice !== undefined) {
      form.setValue(`items.${index}.price`, Number(item.sellingPrice), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    setShowProductSuggestions((current) => ({ ...current, [rowId]: false }));
    setSearchQueries((current) => ({ ...current, [index]: "" }));
    setShowResults((current) => ({ ...current, [index]: false }));
  };

  const resolveInventoryItem = (rowId: string, productName: string) =>
    selectedInventoryRef.current[rowId] ||
    findExactInventoryItem(inventoryItems, productName);

  const toggleDotUnit = (rowId: string, dotUnitId: string, requestedQuantity: number) => {
    setSelectedDotUnitIds((current) => {
      const selected = current[rowId] ?? [];
      if (selected.includes(dotUnitId)) {
        return { ...current, [rowId]: selected.filter((id) => id !== dotUnitId) };
      }
      if (selected.length >= requestedQuantity) {
        toast({
          title: "DOT selection is full",
          description: `Select exactly ${requestedQuantity} DOT unit${requestedQuantity === 1 ? "" : "s"} for this invoice row.`,
          variant: "destructive",
        });
        return current;
      }
      return { ...current, [rowId]: [...selected, dotUnitId] };
    });
  };

  const isDotUnitSelectedInAnotherRow = (rowId: string, dotUnitId: string) =>
    Object.entries(selectedDotUnitIds).some(
      ([otherRowId, selected]) => otherRowId !== rowId && selected.includes(dotUnitId),
    );

  const addInventoryInitialValues = useMemo<Partial<InsertInventoryItem> | undefined>(() => {
    if (!activeInventoryAdd) return undefined;

    return {
      category: "tyres",
      productName: activeInventoryAdd.productName,
      sellingPrice: activeInventoryAdd.price,
      remark: "Added while creating an invoice",
      ...getTyreInitialValues(activeInventoryAdd.productName),
    };
  }, [activeInventoryAdd]);

  // Pre-fill form when opened from Order page with pre-selected items
  useEffect(() => {
    if (!isOpen) {
      prefilledRef.current = false;
      return;
    }
    if (prefilledRef.current) return;
    if (!initialItems || initialItems.length === 0) return;
    prefilledRef.current = true;
    selectedInventoryRef.current = {};
    setSelectedInventoryIds({});
    replace(initialItems.map((it) => ({
      productName: it.productName,
      quantity: it.quantity,
      price: it.price,
    })));
    if (initialCustomerName) form.setValue("customerName", initialCustomerName);
    if (initialCost !== undefined && initialCost > 0) form.setValue("cost", initialCost);
  }, [isOpen, initialItems, initialCost, initialCustomerName]);

  const watchedItems = form.watch("items");
  const watchedDeposit = form.watch("deposit") || 0;
  const watchedShipping = form.watch("shipping") || 0;
  const watchedCost = form.watch("cost");
  
  const subtotalAmount = watchedItems.reduce((sum, item) => {
    return sum + ((item.price || 0) * (item.quantity || 0));
  }, 0);
  
  const totalAmount = subtotalAmount - watchedDeposit + watchedShipping;

  const mutation = useMutation({
    mutationFn: async (data: CreateInvoiceForm) => {
      const { items, deposit = 0, shipping = 0, cost, invoiceDate, ...invoiceData } = data;
      
      // Calculate the final total: subtotal - deposit + shipping
      const subtotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
      const finalTotal = subtotal - deposit + shipping;
      const profit = cost !== undefined ? finalTotal - cost : undefined;
      
      const response = await apiRequest("POST", "/api/invoices", {
        invoice: {
          ...invoiceData,
          invoiceNumber: "", // Let backend generate sequential number
          invoiceDate: invoiceDate, // Send date string directly
          deposit: deposit.toString(),
          shipping: shipping.toString(),
          totalAmount: finalTotal.toString(),
          ...(cost !== undefined ? { cost: cost.toString(), profit: profit!.toString() } : {}),
        },
        items: items,
      });
      return response.json();
    },
    onSuccess: async (createdInvoice) => {
      await publishCreatedInvoice(queryClient, createdInvoice);
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
      onClose();
      form.reset();
      selectedInventoryRef.current = {};
      skippedInventoryRowsRef.current.clear();
      setSelectedInventoryIds({});
      setSelectedDotUnitIds({});
      setMissingInventoryItems([]);
      setMissingItemsToAdd({});
      setPendingInvoiceData(null);
      setActiveInventoryAdd(null);
      
      // Open invoice preview for printing/PDF export
      if (onInvoiceCreated) {
        onInvoiceCreated(createdInvoice);
      }
    },
    onError: async (error: any) => {
      try {
        const msg = error?.message || "";
        const jsonStr = msg.includes(": {") ? msg.substring(msg.indexOf(": {") + 2) : msg;
        const errorData = JSON.parse(jsonStr);
        
        if (errorData && errorData.type === "insufficient_stock") {
          const needed = errorData.requestedQuantity - errorData.availableStock;
          setStockRefillInfo({
            inventoryItemId: errorData.inventoryItemId,
            productDescription: errorData.productDescription,
            availableStock: errorData.availableStock,
            requestedQuantity: errorData.requestedQuantity,
          });
          setStockRefillAmount(needed);
          setPendingFormData(form.getValues());
          return;
        }
      } catch {}
      
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const stockRefillMutation = useMutation({
    mutationFn: async ({ itemId, newQuantity }: { itemId: string; newQuantity: number }) => {
      const response = await apiRequest("PUT", `/api/inventory/${itemId}`, { quantity: newQuantity });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({
        title: "Stock Updated",
        description: "Inventory stock has been updated. Retrying invoice creation...",
      });
      setStockRefillInfo(null);
      if (pendingFormData) {
        setTimeout(() => {
          onSubmit(pendingFormData);
          setPendingFormData(null);
        }, 500);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update stock",
        variant: "destructive",
      });
    },
  });

  const submitInvoice = (data: CreateInvoiceForm) => {
    const transformedItems = data.items.map((item, index) => {
      const rowId = fields[index]?.id;
      const inventoryItem = rowId ? resolveInventoryItem(rowId, item.productName) : undefined;

      if (inventoryItem) {
        const availableDotUnits = inventoryItem.dotUnits.filter((unit) => unit.status === "available");
        return {
          category: inventoryItem.category,
          brand: inventoryItem.brand || "",
          pattern: inventoryItem.pattern || "",
          size: inventoryItem.size || "",
          specialMarkings: inventoryItem.specialMarkings || "",
          model: inventoryItem.model || "",
          pcd: inventoryItem.pcd || "",
          color: inventoryItem.color || "",
          productName: inventoryItem.productName || getInventoryDisplayName(inventoryItem),
          quantity: item.quantity,
          price: item.price,
          inventoryItemId: inventoryItem.id,
            ...(availableDotUnits.length > 0 ? { dotUnitIds: selectedDotUnitIds[rowId ?? ""] ?? [] } : {}),
        };
      }

      return {
        category: "others",
        brand: "",
        pattern: "",
        size: "",
        specialMarkings: "",
        model: "",
        pcd: "",
        color: "",
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        skipInventory: true,
      };
    });

    mutation.mutate({ ...data, items: transformedItems } as CreateInvoiceForm);
  };

  const onSubmit = (data: CreateInvoiceForm) => {
    if (!isBlankInvoice) {
      const dotSelectionIssue = data.items.find((item, index) => {
        const rowId = fields[index]?.id;
        const inventoryItem = rowId ? resolveInventoryItem(rowId, item.productName) : undefined;
        const trackedDotUnits = inventoryItem?.dotUnits.filter((unit) => unit.status === "available") ?? [];
        return trackedDotUnits.length > 0 &&
          (selectedDotUnitIds[rowId ?? ""]?.length ?? 0) !== (item.quantity ?? 0);
      });
      if (dotSelectionIssue) {
        toast({
          title: "Select the exact DOT units",
          description: "Choose one available DOT unit for every tyre in each DOT-tracked invoice row.",
          variant: "destructive",
        });
        return;
      }
    }

    const missingItems = isBlankInvoice
      ? []
      : data.items.reduce<MissingInventoryItem[]>((missing, item, index) => {
          const rowId = fields[index]?.id;
          if (
            rowId &&
            !resolveInventoryItem(rowId, item.productName) &&
            !skippedInventoryRowsRef.current.has(rowId)
          ) {
            missing.push({
              rowId,
              index,
              productName: item.productName,
              quantity: item.quantity,
              price: item.price,
            });
          }
          return missing;
        }, []);

    if (missingItems.length > 0) {
      setPendingInvoiceData(data);
      setMissingInventoryItems(missingItems);
      setMissingItemsToAdd(Object.fromEntries(missingItems.map((item) => [item.rowId, false])));
      return;
    }

    submitInvoice(data);
  };

  const continueWithMissingChoices = () => {
    if (!pendingInvoiceData) return;
    const itemsToAdd = missingInventoryItems.filter((item) => missingItemsToAdd[item.rowId]);
    missingInventoryItems
      .filter((item) => !missingItemsToAdd[item.rowId])
      .forEach(({ rowId }) => skippedInventoryRowsRef.current.add(rowId));
    if (itemsToAdd.length > 0) {
      setMissingInventoryItems(itemsToAdd);
      setActiveInventoryAdd(itemsToAdd[0]);
      return;
    }
    const data = pendingInvoiceData;
    setMissingInventoryItems([]);
    setPendingInvoiceData(null);
    submitInvoice(data);
  };

  const handleInventoryCreated = (item: InventoryItemWithDotUnits) => {
    if (!activeInventoryAdd) return;

    inventoryAddCompletedRef.current = true;
    selectInventoryItem(item, activeInventoryAdd.rowId, activeInventoryAdd.index);
    const remaining = missingInventoryItems.filter(
      ({ rowId }) => rowId !== activeInventoryAdd.rowId
    );
    setMissingInventoryItems(remaining);

    if (remaining.length > 0) {
      setActiveInventoryAdd(remaining[0]);
      return;
    }

    setActiveInventoryAdd(null);
    const data = pendingInvoiceData;
    setPendingInvoiceData(null);
    if (data) {
      window.setTimeout(() => submitInvoice(data), 0);
    }
  };

  const handleStockRefill = () => {
    if (!stockRefillInfo) return;
    const newTotal = stockRefillInfo.availableStock + stockRefillAmount;
    stockRefillMutation.mutate({
      itemId: stockRefillInfo.inventoryItemId,
      newQuantity: newTotal,
    });
  };

  const handleClose = () => {
    onClose();
    form.reset();
    setStockRefillInfo(null);
    setPendingFormData(null);
    setPendingInvoiceData(null);
    setMissingInventoryItems([]);
    setMissingItemsToAdd({});
    setActiveInventoryAdd(null);
    selectedInventoryRef.current = {};
    skippedInventoryRowsRef.current.clear();
    setSelectedInventoryIds({});
    setSelectedDotUnitIds({});
    setIsBlankInvoice(false);
  };

  // Handle preview functionality
  const handlePreview = () => {
    const formData = form.getValues();
    
    // Validate required fields for preview
    const hasValidItems = formData.items && formData.items.length > 0 && 
      formData.items.some(item => item.productName && item.quantity && item.price);
    
    if (!hasValidItems) {
      toast({
        title: "Cannot Preview",
        description: "Please add at least one complete item with product name, quantity, and price",
        variant: "destructive",
      });
      return;
    }

    // Create a temporary invoice object for preview
    const tempInvoice: InvoiceWithItems = {
      id: "temp-preview",
      invoiceNumber: "PREVIEW-NUMBER",
      invoiceDate: formData.invoiceDate || getTodayDateString(),
      carNo: formData.carNo || null,
      customerName: formData.customerName || null,
      totalAmount: totalAmount.toString(),
      status: "pending",
      remark: formData.remark || null,
      internalNotes: formData.internalNotes || null,
      deposit: (formData.deposit || 0).toString(),
      shipping: (formData.shipping || 0).toString(),
      cost: formData.cost !== undefined ? formData.cost.toString() : null,
      profit: formData.cost !== undefined ? (totalAmount - formData.cost).toString() : null,
      followUpRequired: 0,
      paymentReceivedDate: null,
      createdAt: getTodayDateString(),
      updatedAt: getTodayDateString(),
      items: formData.items.map((item, index) => {
        const rowId = fields[index]?.id;
        const inventoryItem = rowId
          ? resolveInventoryItem(rowId, item.productName)
          : findExactInventoryItem(inventoryItems, item.productName);

        return {
          id: `temp-${Math.random()}`,
          invoiceId: "temp-preview",
          inventoryItemId: inventoryItem?.id ?? null,
          category: inventoryItem?.category || "others",
          brand: inventoryItem?.brand || null,
          pattern: inventoryItem?.pattern || null,
          size: inventoryItem?.size || null,
          specialMarkings: inventoryItem?.specialMarkings || null,
          model: inventoryItem?.model || null,
          pcd: inventoryItem?.pcd || null,
          color: inventoryItem?.color || null,
          productName: item.productName,
          quantity: item.quantity || 1,
          price: (item.price || 0).toString(),
        };
      })
    };

    setPreviewInvoice(tempInvoice);
    setIsPreviewModalOpen(true);
  };

  const addItem = () => {
    append({ productName: "", quantity: undefined, price: undefined });
  };

  const removeItem = (index: number) => {
    if (fields.length > 1) {
      const rowId = fields[index]?.id;
      if (rowId) clearInventorySelection(rowId);
      remove(index);
    }
  };

  // Filter products based on search query
  const filterProducts = (query: string) =>
    getRankedInventoryItems(inventoryItems, query, false);

  // Auto-fill product name when product is selected
  const handleProductSelect = (productId: string, index: number) => {
    const product = inventoryItems.find(item => item.id === productId);
    const rowId = fields[index]?.id;
    if (product && rowId) {
      selectInventoryItem(product, rowId, index);
    }
  };

  // Handle search input change
  const handleSearchChange = (query: string, index: number) => {
    setSearchQueries(prev => ({ ...prev, [index]: query }));
    setShowResults(prev => ({ ...prev, [index]: query.length > 0 }));
  };

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-search-container]')) {
        setShowResults({});
      }
      if (!target.closest('[data-product-suggestions-container]')) {
        setShowProductSuggestions({});
      }
    };

    if (
      Object.values(showResults).some(Boolean) ||
      Object.values(showProductSuggestions).some(Boolean)
    ) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showResults, showProductSuggestions]);

  // Paste screenshot to scan
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) processImageFile(file);
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isOpen]);

  // Resize image client-side before sending (keeps API call fast)
  const resizeImage = (dataUrl: string, maxPx = 1536): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.src = dataUrl;
    });

  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const resized = await resizeImage(dataUrl);
      setScanImageUrl(resized);
    };
    reader.readAsDataURL(file);
  };

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
    e.target.value = "";
  };

  const handleScan = async () => {
    if (!scanImageUrl) return;
    setIsScanning(true);
    try {
      const response = await apiRequest("POST", "/api/invoice-scan", { image: scanImageUrl });
      const data = await response.json();

      if (data.customerName) form.setValue("customerName", data.customerName);
      if (data.carNo) form.setValue("carNo", data.carNo);
      if (data.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(data.invoiceDate))
        form.setValue("invoiceDate", data.invoiceDate);
      if (data.remark) form.setValue("remark", data.remark);

      if (Array.isArray(data.items) && data.items.length > 0) {
        replace(data.items.map((it: any) => ({
          productName: String(it.productName ?? ""),
          quantity: Number(it.quantity) || 1,
          price: Number(it.price) || undefined,
        })));
      }

      toast({ title: "Scan complete", description: "Form filled in — please review and adjust if needed." });
      setScanImageUrl(null);
    } catch (err: any) {
      console.error("Invoice scan error:", err);
      const msg = err?.message ?? "Could not read the image. Please fill in manually.";
      toast({ title: "Scan failed", description: msg, variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6" data-testid="create-invoice-modal">
        <DialogHeader>
          <DialogTitle data-testid="modal-title">Create New Invoice</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="invoice-form">

            {/* ── Screenshot Scanner ── */}
            <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Camera className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-sm font-medium text-blue-800">Auto-fill from Screenshot</span>
              </div>
              {!scanImageUrl ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3 h-3 mr-1" />
                    Upload Image
                  </Button>
                  <span className="text-xs text-muted-foreground">or paste a screenshot with Ctrl+V / ⌘+V</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleScanFile}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <img
                    src={scanImageUrl}
                    alt="Screenshot to scan"
                    className="h-16 w-auto rounded border border-blue-200 object-contain bg-white"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleScan}
                      disabled={isScanning}
                    >
                      {isScanning ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Scanning…</>
                      ) : (
                        <>Scan & Fill Form</>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setScanImageUrl(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                  {isScanning && (
                    <span className="text-xs text-muted-foreground">Reading image with AI…</span>
                  )}
                </div>
              )}
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Number</FormLabel>
                    <FormControl>
                      <Input
                        value="Auto-generated on save"
                        placeholder="Auto-generated on save"
                        readOnly
                        className="bg-muted"
                        data-testid="input-invoice-number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoiceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        required
                        displayFormat="iso"
                        aria-label="Invoice date"
                        data-testid="input-invoice-date"
                        placeholder="Select any date"
                      />
                    </FormControl>
                    <FormMessage />
                    <div className="text-xs text-muted-foreground">
                      You can select any past or future date for this invoice
                    </div>
                  </FormItem>
                )}
              />
            </div>

            {/* Customer Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="carNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Car No. (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter car number"
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-car-no"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer's Name (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter customer's name"
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-customer-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Invoice Items */}
            <div className="border border-border rounded-lg p-3 sm:p-4">
              <div className="flex justify-between items-center mb-3 sm:mb-4">
                <div className="flex items-center gap-3">
                  <h5 className="font-medium text-foreground text-sm sm:text-base">Invoice Items</h5>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={isBlankInvoice}
                      onCheckedChange={(checked) => handleBlankInvoiceToggle(!!checked)}
                      data-testid="checkbox-blank-invoice"
                    />
                    <span className="text-xs text-muted-foreground">Blank Invoice</span>
                  </label>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={addItem}
                  data-testid="btn-add-item"
                >
                  <Plus className="w-4 h-4 mr-1 sm:mr-2" />
                  Add
                </Button>
              </div>
              
              <div className="space-y-3 sm:space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 gap-3 sm:gap-4 p-3 sm:p-4 bg-muted/50 rounded-lg" data-testid={`invoice-item-${index}`}>
                    {/* Item Header */}
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-foreground">Item {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        disabled={fields.length === 1}
                        data-testid={`btn-remove-item-${index}`}
                        className="h-7 w-7 p-0 sm:hidden"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {/* Product Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productName`}
                        render={({ field }) => (
                          <FormItem className="relative" data-product-suggestions-container>
                            <FormLabel>Product Name *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Type brand + exact size, e.g. Michelin 235/60R18"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(event) => {
                                  const query = event.target.value;
                                  field.onChange(query);
                                  clearInventorySelection(fields[index].id);
                                  setShowProductSuggestions((current) => ({
                                    ...current,
                                    [fields[index].id]: query.trim().length > 0,
                                  }));
                                }}
                                onFocus={() => {
                                  if (field.value) {
                                    setShowProductSuggestions((current) => ({
                                      ...current,
                                      [fields[index].id]: true,
                                    }));
                                  }
                                }}
                                title={field.value ?? ""}
                                data-testid={`input-product-name-${index}`}
                              />
                            </FormControl>
                            {selectedInventoryIds[fields[index].id] && (
                              <p className="text-xs text-emerald-700">
                                Linked to inventory · Stock: {selectedInventoryRef.current[fields[index].id]?.quantity ?? 0}
                              </p>
                            )}
                            {showProductSuggestions[fields[index].id] && field.value && (
                              <div
                                className="absolute left-0 top-full z-50 mt-1 max-h-80 w-[min(52rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
                                data-testid={`product-suggestions-${index}`}
                              >
                                {(() => {
                                  const matches = getRankedInventoryItems(inventoryItems, field.value);
                                  if (matches.length === 0) {
                                    return (
                                      <div className="px-3 py-2 text-sm text-muted-foreground">
                                        No inventory match with the same brand and size. Check the size or add this item when creating the invoice.
                                      </div>
                                    );
                                  }

                                  return matches.map((item) => (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => selectInventoryItem(item, fields[index].id, index)}
                                      data-testid={`product-suggestion-${item.id}-${index}`}
                                    >
                                      <div className="whitespace-normal break-words text-sm font-medium">{getInventoryDisplayName(item)}</div>
                                      <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                        <span className="capitalize">{item.category}</span>
                                        <span>Stock: {item.quantity}</span>
                                        {item.sellingPrice && <span>${Number(item.sellingPrice).toFixed(2)}</span>}
                                      </div>
                                    </button>
                                  ));
                                })()}
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="space-y-2 relative" data-search-container>
                        <label className="text-sm font-medium">Search Products</label>
                        <Input
                          placeholder="Search by category, brand, pattern, size..."
                          value={searchQueries[index] || ''}
                          onChange={(e) => handleSearchChange(e.target.value, index)}
                          onFocus={() => {
                            if (searchQueries[index]) {
                              setShowResults(prev => ({ ...prev, [index]: true }));
                            }
                          }}
                          data-testid={`search-product-${index}`}
                        />
                        
                        {/* Search Results */}
                        {showResults[index] && searchQueries[index] && (
                          <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-[min(52rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                            {(() => {
                              const filteredProducts = filterProducts(searchQueries[index]);
                              
                              if (filteredProducts.length === 0) {
                                return (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">
                                    No products found
                                  </div>
                                );
                              }
                              
                              return filteredProducts.map((item) => {
                                let displayText = "";
                                let categoryLabel = "";
                                
                                if (item.category === "tyres") {
                                  displayText = `${item.brand} ${item.pattern} - ${item.size}`;
                                  if (item.specialMarkings) displayText += ` | ${item.specialMarkings}`;
                                  categoryLabel = "Tyre";
                                } else if (item.category === "wheels") {
                                  displayText = `${item.brand} ${item.model} - ${item.size}`;
                                  if (item.pcd) displayText += ` | PCD: ${item.pcd}`;
                                  if (item.color) displayText += ` | ${item.color}`;
                                  categoryLabel = "Wheel";
                                } else {
                                  displayText = item.productName || "";
                                  categoryLabel = "Other";
                                }
                                
                                return (
                                  <div
                                    key={item.id}
                                    className="px-3 py-2 hover:bg-accent cursor-pointer border-b last:border-0"
                                    onClick={() => handleProductSelect(item.id, index)}
                                    data-testid={`search-result-${item.id}-${index}`}
                                  >
                                    <div className="whitespace-normal break-words text-sm font-medium">{displayText}</div>
                                    <div className="flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                      <span>{categoryLabel}</span>
                                      <span>Stock: {item.quantity}</span>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Quantity and Price Section */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Qty *</FormLabel>
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {[1, 2, 3, 4].map((num) => (
                                    <Button
                                      key={num}
                                      type="button"
                                      variant={field.value === num ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => field.onChange(num)}
                                      data-testid={`btn-quantity-${num}-${index}`}
                                      className="h-8 w-8 p-0"
                                    >
                                      {num}
                                    </Button>
                                  ))}
                                </div>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="Qty"
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </FormControl>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div>
                        <FormField
                          control={form.control}
                          name={`items.${index}.price`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Price *</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  {...field}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                  data-testid={`input-price-${index}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {(() => {
                      const rowId = fields[index].id;
                      const selectedInventoryItem = selectedInventoryRef.current[rowId];
                      const availableDotUnits = selectedInventoryItem?.dotUnits
                        .filter((unit) => unit.status === "available") ?? [];
                      const requestedQuantity = watchedItems[index]?.quantity ?? 0;
                      const selectedUnits = selectedDotUnitIds[rowId] ?? [];
                      if (availableDotUnits.length === 0) return null;

                      return (
                        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-1">
                            <p className="text-sm font-medium text-amber-950">Select exact DOT units</p>
                            <span className="text-xs text-amber-800">
                              {selectedUnits.length} of {requestedQuantity || 0} selected
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-amber-800">
                            These are the physical tyres being sold. Select one for each requested tyre.
                          </p>
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {availableDotUnits.map((unit) => {
                              const selectedElsewhere = isDotUnitSelectedInAnotherRow(rowId, unit.id);
                              return (
                                <label
                                  key={unit.id}
                                  className="flex items-center gap-2 rounded border border-amber-200 bg-background px-2 py-1.5 text-sm"
                                >
                                  <Checkbox
                                    checked={selectedUnits.includes(unit.id)}
                                    disabled={selectedElsewhere || requestedQuantity < 1}
                                    onCheckedChange={() => toggleDotUnit(rowId, unit.id, requestedQuantity)}
                                    data-testid={`checkbox-dot-${unit.id}`}
                                  />
                                  <span className="font-mono">{unit.dotCode}</span>
                                  {selectedElsewhere && (
                                    <span className="ml-auto text-xs text-muted-foreground">Used above</span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    
                    <div className="hidden sm:flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(index)}
                        disabled={fields.length === 1}
                        data-testid={`btn-remove-item-desktop-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Duplicate Add Item button after the last item */}
              <div className="pt-3 text-center">
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={addItem}
                  data-testid="btn-add-item-bottom"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>

            {/* Invoice Level Comments */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="remark"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comments (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter any comments for this invoice..."
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-remark"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="internalNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Internal notes - not shown to customer..."
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                        data-testid="input-internal-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Deposit and Shipping Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Additional Charges</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDepositShipping(!showDepositShipping)}
                  data-testid="btn-toggle-deposit-shipping"
                >
                  {showDepositShipping ? (
                    <>
                      <EyeOff className="w-4 h-4 mr-2" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Show
                    </>
                  )}
                </Button>
              </div>
              
              {showDepositShipping && (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 bg-muted/30 rounded-lg">
                  <FormField
                    control={form.control}
                    name="deposit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deposit</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-deposit"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="shipping"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shipping</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-shipping"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Total and Actions */}
            <div className="pt-4 border-t border-border space-y-3">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${subtotalAmount.toFixed(2)}</span>
                </div>
                <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {watchedItems.map((item, index) => {
                    const quantity = item.quantity || 0;
                    const unitPrice = item.price || 0;
                    const lineTotal = quantity * unitPrice;
                    return (
                      <div
                        key={`subtotal-item-${index}`}
                        className="flex items-start justify-between gap-3 text-xs text-muted-foreground"
                        data-testid={`subtotal-breakdown-${index}`}
                      >
                        <span className="min-w-0 break-words">
                          <span className="font-medium text-foreground">
                            {item.productName || `Item ${index + 1}`}
                          </span>
                          <span className="ml-1">
                            × {quantity} @ ${unitPrice.toFixed(2)}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium text-foreground">
                          ${lineTotal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {watchedDeposit > 0 && (
                  <div className="flex justify-between">
                    <span>Deposit:</span>
                    <span>-${watchedDeposit.toFixed(2)}</span>
                  </div>
                )}
                {watchedShipping > 0 && (
                  <div className="flex justify-between">
                    <span>Shipping:</span>
                    <span>+${watchedShipping.toFixed(2)}</span>
                  </div>
                )}
                {watchedCost !== undefined && watchedCost > 0 && (
                  <div className="flex justify-between text-orange-700">
                    <span>Cost (profit calc):</span>
                    <span>${watchedCost.toFixed(2)}</span>
                  </div>
                )}
                {watchedCost !== undefined && watchedCost > 0 && (
                  <div className={`flex justify-between font-medium ${totalAmount - watchedCost >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    <span>Gross Profit:</span>
                    <span>
                      ${(totalAmount - watchedCost).toFixed(2)}
                      {totalAmount !== 0 && (
                        <span className="font-normal text-xs ml-1 opacity-75">
                          ({(((totalAmount - watchedCost) / totalAmount) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-end gap-4">
                <div className="text-lg font-semibold text-foreground" data-testid="invoice-total">
                  Total: ${totalAmount.toFixed(2)}
                </div>
                <FormField
                  control={form.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem className="flex-1 max-w-[180px]">
                      <FormLabel className="text-xs text-muted-foreground">Cost (for profit tracking)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleClose}
                  data-testid="btn-cancel"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={handlePreview}
                  data-testid="btn-preview-invoice"
                  className="w-full sm:w-auto"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview
                </Button>
                <Button 
                  type="submit" 
                  disabled={mutation.isPending}
                  data-testid="btn-create-invoice"
                  className="w-full sm:w-auto"
                >
                  {mutation.isPending ? "Creating..." : "Create Invoice"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>

      {/* Stock Refill Dialog */}
      {stockRefillInfo && (
        <Dialog open={!!stockRefillInfo} onOpenChange={() => { setStockRefillInfo(null); setPendingFormData(null); setStockRefillAmount(0); }}>
          <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-orange-500" />
                Insufficient Stock
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                <p className="font-medium text-orange-800">{stockRefillInfo.productDescription}</p>
                <div className="mt-2 flex justify-between text-orange-700">
                  <span>Available: {stockRefillInfo.availableStock}</span>
                  <span>Requested: {stockRefillInfo.requestedQuantity}</span>
                </div>
                <p className="mt-1 text-orange-600">
                  Need {stockRefillInfo.requestedQuantity - stockRefillInfo.availableStock} more to complete this invoice
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Add Stock Quantity</label>
                <Input
                  type="number"
                  min={1}
                  value={stockRefillAmount}
                  onChange={(e) => setStockRefillAmount(parseInt(e.target.value) || 0)}
                  placeholder="Enter quantity to add"
                  data-testid="input-stock-refill"
                />
                <p className="text-xs text-muted-foreground">
                  New total stock will be: {stockRefillInfo.availableStock + stockRefillAmount}
                </p>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => { setStockRefillInfo(null); setPendingFormData(null); setStockRefillAmount(0); }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleStockRefill}
                  disabled={stockRefillAmount < 1 || stockRefillMutation.isPending}
                  data-testid="btn-confirm-stock-refill"
                >
                  {stockRefillMutation.isPending ? "Updating..." : `Add ${stockRefillAmount} to Stock & Retry`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Missing inventory confirmation */}
      {pendingInvoiceData && missingInventoryItems.length > 0 && !activeInventoryAdd && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPendingInvoiceData(null);
              setMissingInventoryItems([]);
            }
          }}
        >
          <DialogContent className="sm:max-w-lg" onClick={(event) => event.stopPropagation()}>
            <DialogHeader>
              <DialogTitle>Items not found in inventory</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                These item descriptions do not match an inventory record. Would you like to add them before creating the invoice?
              </p>
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3">
                {missingInventoryItems.map((item) => (
                  <label key={item.rowId} className="flex cursor-pointer items-start gap-3 rounded p-1 text-sm hover:bg-muted">
                    <Checkbox
                      checked={!!missingItemsToAdd[item.rowId]}
                      onCheckedChange={(checked) => setMissingItemsToAdd((current) => ({
                        ...current,
                        [item.rowId]: !!checked,
                      }))}
                      data-testid={`checkbox-add-missing-${item.index}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{item.productName}</span>
                      <span className="block text-xs text-muted-foreground">Add this row to inventory first</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      Qty: {item.quantity || 0}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                If you add an item, enter its real current stock quantity. The normal stock check will still protect this invoice.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPendingInvoiceData(null);
                    setMissingInventoryItems([]);
                      setMissingItemsToAdd({});
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={continueWithMissingChoices}>
                  Continue invoice
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <AddInventoryModal
        isOpen={!!activeInventoryAdd}
        initialValues={addInventoryInitialValues}
        onInventoryCreated={handleInventoryCreated}
        onClose={() => {
          if (!inventoryAddCompletedRef.current) {
            setActiveInventoryAdd(null);
          }
          inventoryAddCompletedRef.current = false;
        }}
      />

      {/* Preview Modal */}
      <InvoicePreviewModal
        invoice={previewInvoice}
        isOpen={isPreviewModalOpen}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setPreviewInvoice(null);
        }}
        printMode={false}
        isCreationPreview={true}
      />
    </Dialog>
  );
}
