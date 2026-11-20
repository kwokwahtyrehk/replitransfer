import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2, Download, Upload, Filter, ChevronUp, ChevronDown, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { InventoryItemWithDotUnits } from "@shared/schema";
import AddInventoryModal from "@/components/add-inventory-modal";

const normalizeSearchText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const getSearchAlias = (value: string) =>
  (value.toLowerCase().match(/[a-z]+|\d+/g) ?? []).map((part) => part[0]).join("");

export default function Inventory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemWithDotUnits | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState({
    category: false,
    productDetails: true,
    size: true,
    quantity: true,
    costPrice: true,
    sellingPrice: true,
    remark: true,
    actions: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: inventoryItems = [], isLoading } = useQuery<InventoryItemWithDotUnits[]>({
    queryKey: ["/api/inventory"],
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inventory/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Inventory item deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete inventory item",
        variant: "destructive",
      });
    },
  });

  const quickStockMutation = useMutation({
    mutationFn: async ({ id, addQuantity }: { id: string; addQuantity: number }) => {
      const item = inventoryItems.find(i => i.id === id);
      if (!item) throw new Error("Item not found");
      const newQuantity = (item.quantity || 0) + addQuantity;
      await apiRequest("PUT", `/api/inventory/${id}`, { quantity: newQuantity });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Stock Updated",
        description: `Added ${variables.addQuantity} to stock`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update stock quantity",
        variant: "destructive",
      });
    },
  });

  const filteredAndSortedItems = (() => {
    // First filter items
    let filtered = inventoryItems.filter(item => {
      const term = searchTerm.toLowerCase().trim();
      const normalizedTerm = normalizeSearchText(term);
      const fields = [
        item.brand,
        item.pattern,
        item.size,
        item.specialMarkings,
        item.model,
        item.pcd,
        item.color,
        item.productName,
      ].filter((field): field is string => Boolean(field));
      const productText = fields.join(" ").toLowerCase();
      const productCodeAliases = fields.map(getSearchAlias).join(" ");

      const matchesSearch = (
        productText.includes(term) ||
        normalizeSearchText(productText).includes(normalizedTerm) ||
        productCodeAliases.includes(normalizedTerm)
      );

      return matchesSearch && (!inStockOnly || item.quantity >= 1);
    });

    // Then sort items
    if (sortConfig) {
      filtered.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
          case 'category':
            aValue = a.category;
            bValue = b.category;
            break;
          case 'productDetails':
            if (a.category === "tyres") {
              aValue = `${a.brand} ${a.pattern}`;
            } else if (a.category === "wheels") {
              aValue = `${a.brand} ${a.model}`;
            } else {
              aValue = a.productName || "";
            }
            if (b.category === "tyres") {
              bValue = `${b.brand} ${b.pattern}`;
            } else if (b.category === "wheels") {
              bValue = `${b.brand} ${b.model}`;
            } else {
              bValue = b.productName || "";
            }
            break;
          case 'size':
            aValue = a.size || "";
            bValue = b.size || "";
            break;
          case 'quantity':
            aValue = a.quantity;
            bValue = b.quantity;
            break;
          case 'costPrice':
            aValue = a.costPrice ? Number(a.costPrice) : 0;
            bValue = b.costPrice ? Number(b.costPrice) : 0;
            break;
          case 'sellingPrice':
            aValue = a.sellingPrice ? Number(a.sellingPrice) : 0;
            bValue = b.sellingPrice ? Number(b.sellingPrice) : 0;
            break;
          case 'remark':
            aValue = a.remark || "";
            bValue = b.remark || "";
            break;
          default:
            return 0;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  })();

  const bulkUpdateMutation = useMutation({
    mutationFn: async (items: any[]) => {
      await apiRequest("POST", "/api/inventory/bulk-update", { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Inventory updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Error",
        description: error?.message || "Failed to update inventory",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
      deleteItemMutation.mutate(id);
    }
  };

  const handleExport = () => {
    if (inventoryItems.length === 0) {
      toast({
        title: "No Data",
        description: "No inventory items to export",
        variant: "destructive",
      });
      return;
    }

    // Create CSV content
    const headers = [
      "Category",
      "Brand",
      "Pattern",
      "Model", 
      "Size",
      "PCD",
      "Color",
      "Special Markings",
      "Product Name",
      "Quantity",
      "Cost Price",
      "Selling Price",
      "Remark"
    ];

    const csvData = inventoryItems.map(item => [
      item.category,
      item.brand || "",
      item.pattern || "",
      item.model || "",
      item.size || "",
      item.pcd || "",
      item.color || "",
      item.specialMarkings || "",
      item.productName || "",
      item.quantity,
      item.costPrice ? Number(item.costPrice).toFixed(2) : "",
      item.sellingPrice ? Number(item.sellingPrice).toFixed(2) : "",
      item.remark || ""
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(","))
      .join("\n");

    // Download CSV file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `inventory-export-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    toast({
      title: "Success",
      description: "Inventory exported successfully",
    });
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Handle escaped quotes ""
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Don't forget the last field
    result.push(current.trim());
    return result;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      toast({
        title: "Invalid File",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        let csv = e.target?.result as string;
        
        // Remove BOM if present
        if (csv.charCodeAt(0) === 0xFEFF) {
          csv = csv.slice(1);
        }
        
        // Handle different line endings
        const lines = csv.split(/\r?\n/).filter(line => line.trim());
        
        if (lines.length < 2) {
          throw new Error("CSV file must contain headers and at least one data row");
        }

        const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, "").trim());
        
        const expectedHeaders = [
          "category",
          "brand", 
          "pattern",
          "model",
          "size",
          "pcd", 
          "color",
          "special markings",
          "product name",
          "quantity",
          "cost price",
          "selling price",
          "remark"
        ];

        // Create header mapping (case-insensitive)
        const headerMap = new Map<string, string>();
        headers.forEach((header) => {
          const normalizedHeader = header.toLowerCase().trim();
          const expectedHeader = expectedHeaders.find(expected => 
            expected === normalizedHeader || 
            expected.replace(/\s+/g, '') === normalizedHeader.replace(/\s+/g, '')
          );
          if (expectedHeader) {
            headerMap.set(header, expectedHeader);
          }
        });

        // Check if we have essential headers
        const requiredMappings = ['category'];
        const missingRequired = requiredMappings.filter(req => 
          !Array.from(headerMap.values()).some(mapped => mapped === req)
        );
        
        if (missingRequired.length > 0) {
          throw new Error(`Missing required headers: ${missingRequired.join(', ')}`);
        }

        const items = lines.slice(1).map((line, index) => {
          try {
            const values = parseCSVLine(line);
            const item: any = {};

            headers.forEach((header, i) => {
              const mappedHeader = headerMap.get(header);
              const value = values[i]?.replace(/"/g, "").trim() || "";
              
              if (!mappedHeader) return;

              switch (mappedHeader) {
                case "category":
                  item.category = value.toLowerCase();
                  break;
                case "brand":
                  if (value) item.brand = value;
                  break;
                case "pattern":
                  if (value) item.pattern = value;
                  break;
                case "model":
                  if (value) item.model = value;
                  break;
                case "size":
                  if (value) item.size = value;
                  break;
                case "pcd":
                  if (value) item.pcd = value;
                  break;
                case "color":
                  if (value) item.color = value;
                  break;
                case "special markings":
                  if (value) item.specialMarkings = value;
                  break;
                case "product name":
                  if (value) item.productName = value;
                  break;
                case "quantity":
                  const qty = parseInt(value);
                  item.quantity = isNaN(qty) ? 0 : qty;
                  break;
                case "cost price":
                  const cost = parseFloat(value);
                  if (!isNaN(cost) && value !== "") item.costPrice = cost;
                  break;
                case "selling price":
                  const selling = parseFloat(value);
                  if (!isNaN(selling) && value !== "") item.sellingPrice = selling;
                  break;
                case "remark":
                  if (value) item.remark = value;
                  break;
              }
            });


            // Validate required fields based on category
            if (!["tyres", "wheels", "others"].includes(item.category)) {
              throw new Error(`Invalid category "${item.category}". Must be tyres, wheels, or others`);
            }

            if (item.category === "tyres" && (!item.brand || !item.pattern || !item.size)) {
              throw new Error(`Tyres require Brand, Pattern, and Size`);
            }

            if (item.category === "wheels" && (!item.brand || !item.model || !item.size || !item.pcd || !item.color)) {
              throw new Error(`Wheels require Brand, Model, Size, PCD, and Color`);
            }

            if (item.category === "others" && !item.productName) {
              throw new Error(`Others require Product Name`);
            }

            return item;
          } catch (itemError) {
            throw new Error(`Row ${index + 2}: ${itemError instanceof Error ? itemError.message : 'Invalid data'}`);
          }
        });

        bulkUpdateMutation.mutate(items);
      } catch (error) {
        console.error("Import error:", error);
        toast({
          title: "Import Error",
          description: error instanceof Error ? error.message : "Failed to parse CSV file",
          variant: "destructive",
        });
      } finally {
        setIsImporting(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  const handleSort = (columnKey: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === columnKey && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: columnKey, direction });
  };

  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return null;
    }
    return sortConfig.direction === 'asc' ? 
      <ChevronUp className="w-4 h-4 ml-1" /> : 
      <ChevronDown className="w-4 h-4 ml-1" />;
  };

  const toggleColumnVisibility = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6" data-testid="inventory-loading">
        <div className="animate-pulse space-y-6">
          <div className="flex justify-between items-center">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-10 w-32 bg-muted rounded" />
          </div>
          <div className="h-16 bg-muted rounded-lg" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6" data-testid="inventory-content">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-foreground">Inventory Management</h3>
          <p className="text-sm text-muted-foreground hidden sm:block">Manage your tyre stock and inventory levels</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={handleExport}
            variant="outline"
            data-testid="btn-export-inventory"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button 
            onClick={handleImport}
            variant="outline"
            disabled={isImporting}
            data-testid="btn-import-inventory"
          >
            <Upload className="w-4 h-4 mr-2" />
            {isImporting ? "Importing..." : "Import CSV"}
          </Button>
          <Button 
            onClick={() => setIsAddModalOpen(true)}
            data-testid="btn-add-inventory"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Product
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-inventory"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                variant={inStockOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setInStockOnly((current) => !current)}
                aria-pressed={inStockOnly}
                data-testid="btn-in-stock-filter"
              >
                <Filter className="w-4 h-4 mr-2" />
                In Stock
              </Button>
              {/* Column Visibility Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="btn-column-filter">
                    <Settings className="w-4 h-4 mr-2" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48" align="end">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Show Columns</h4>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-category"
                          checked={visibleColumns.category}
                          onCheckedChange={() => toggleColumnVisibility('category')}
                          data-testid="checkbox-category"
                        />
                        <label htmlFor="col-category" className="text-sm">Category</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-product"
                          checked={visibleColumns.productDetails}
                          onCheckedChange={() => toggleColumnVisibility('productDetails')}
                          data-testid="checkbox-product-details"
                        />
                        <label htmlFor="col-product" className="text-sm">Product Details</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-size"
                          checked={visibleColumns.size}
                          onCheckedChange={() => toggleColumnVisibility('size')}
                          data-testid="checkbox-size"
                        />
                        <label htmlFor="col-size" className="text-sm">Size</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-quantity"
                          checked={visibleColumns.quantity}
                          onCheckedChange={() => toggleColumnVisibility('quantity')}
                          data-testid="checkbox-quantity"
                        />
                        <label htmlFor="col-quantity" className="text-sm">Quantity</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-cost-price"
                          checked={visibleColumns.costPrice}
                          onCheckedChange={() => toggleColumnVisibility('costPrice')}
                          data-testid="checkbox-cost-price"
                        />
                        <label htmlFor="col-cost-price" className="text-sm">Cost Price</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-selling-price"
                          checked={visibleColumns.sellingPrice}
                          onCheckedChange={() => toggleColumnVisibility('sellingPrice')}
                          data-testid="checkbox-selling-price"
                        />
                        <label htmlFor="col-selling-price" className="text-sm">Selling Price</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-remark"
                          checked={visibleColumns.remark}
                          onCheckedChange={() => toggleColumnVisibility('remark')}
                          data-testid="checkbox-remark"
                        />
                        <label htmlFor="col-remark" className="text-sm">Remark</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="col-actions"
                          checked={visibleColumns.actions}
                          onCheckedChange={() => toggleColumnVisibility('actions')}
                          data-testid="checkbox-actions"
                        />
                        <label htmlFor="col-actions" className="text-sm">Actions</label>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="inventory-table">
            <thead className="bg-muted">
              <tr>
                {visibleColumns.productDetails && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort('productDetails')}
                    data-testid="header-product-details"
                  >
                    <div className="flex items-center">
                      Product Details
                      {getSortIcon('productDetails')}
                    </div>
                  </th>
                )}
                {visibleColumns.size && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort('size')}
                    data-testid="header-size"
                  >
                    <div className="flex items-center">
                      Size
                      {getSortIcon('size')}
                    </div>
                  </th>
                )}
                {visibleColumns.remark && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort('remark')}
                    data-testid="header-remark"
                  >
                    <div className="flex items-center">
                      Remark
                      {getSortIcon('remark')}
                    </div>
                  </th>
                )}
                {visibleColumns.quantity && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort('quantity')}
                    data-testid="header-quantity"
                  >
                    <div className="flex items-center">
                      Quantity
                      {getSortIcon('quantity')}
                    </div>
                  </th>
                )}
                {visibleColumns.category && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort('category')}
                    data-testid="header-category"
                  >
                    <div className="flex items-center">
                      Category
                      {getSortIcon('category')}
                    </div>
                  </th>
                )}
                {visibleColumns.costPrice && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort('costPrice')}
                    data-testid="header-cost-price"
                  >
                    <div className="flex items-center">
                      Cost Price
                      {getSortIcon('costPrice')}
                    </div>
                  </th>
                )}
                {visibleColumns.sellingPrice && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => handleSort('sellingPrice')}
                    data-testid="header-selling-price"
                  >
                    <div className="flex items-center">
                      Selling Price
                      {getSortIcon('sellingPrice')}
                    </div>
                  </th>
                )}
                {visibleColumns.actions && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filteredAndSortedItems.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-6 py-8 text-center text-muted-foreground" data-testid="inventory-empty">
                    {searchTerm ? "No items match your search." : "No inventory items found. Add your first product to get started."}
                  </td>
                </tr>
              ) : (
                filteredAndSortedItems.map((item) => {
                  const getCategoryIcon = (category: string) => {
                    switch (category) {
                      case "tyres": return "🛞";
                      case "wheels": return "⚙️";
                      case "others": return "📦";
                      default: return "📦";
                    }
                  };

                  const getProductDetails = (item: any) => {
                    if (item.category === "tyres") {
                      return (
                        <div className="text-sm font-medium text-foreground">
                          {item.brand} {item.pattern}
                        </div>
                      );
                    } else if (item.category === "wheels") {
                      return (
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {item.brand} {item.model}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            PCD: {item.pcd} | Color: {item.color}
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-sm font-medium text-foreground">
                          {item.productName}
                        </div>
                      );
                    }
                  };

                  const getSizeWithSpecialMarkings = (item: any) => {
                    if (item.category === "tyres") {
                      return (
                        <div>
                          <div className="text-sm text-foreground">
                            {item.size || "-"}
                          </div>
                          {item.specialMarkings && (
                            <div className="text-xs text-muted-foreground">
                              {item.specialMarkings}
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-sm text-foreground">
                          {item.size || "-"}
                        </div>
                      );
                    }
                  };

                  const availableDotCodeCounts = Array.from(
                    item.dotUnits
                      .filter((unit) => unit.status === "available")
                      .reduce((counts, unit) => {
                        counts.set(unit.dotCode, (counts.get(unit.dotCode) ?? 0) + 1);
                        return counts;
                      }, new Map<string, number>())
                      .entries(),
                  ).map(([dotCode, quantity]) => ({ dotCode, quantity }));

                  return (
                    <tr key={item.id} className="hover:bg-muted/50 transition-colors" data-testid={`inventory-row-${item.id}`}>
                      {visibleColumns.productDetails && (
                        <td className="px-6 py-4 whitespace-nowrap" data-testid={`product-details-${item.id}`}>
                          {getProductDetails(item)}
                        </td>
                      )}
                      {visibleColumns.size && (
                        <td className="px-6 py-4 whitespace-nowrap" data-testid={`product-size-${item.id}`}>
                          {getSizeWithSpecialMarkings(item)}
                        </td>
                      )}
                      {visibleColumns.remark && (
                        <td className="px-6 py-4 text-sm text-muted-foreground" data-testid={`product-remark-${item.id}`}>
                          {item.remark || "-"}
                        </td>
                      )}
                      {visibleColumns.quantity && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground" data-testid={`product-quantity-${item.id}`}>
                          <div className="flex items-center space-x-2">
                            <span>{item.quantity}</span>
                            {item.category === "tyres" && availableDotCodeCounts.length > 0 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    title={`Available DOT units: ${availableDotCodeCounts.map(({ dotCode, quantity }) => `${dotCode}${quantity > 1 ? ` × ${quantity}` : ""}`).join(", ")}`}
                                    data-testid={`btn-view-dot-${item.id}`}
                                  >
                                    DOT · {item.dotUnits.filter((unit) => unit.status === "available").length}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64" align="start">
                                  <p className="text-sm font-medium">Available DOT units</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Hover the DOT label on desktop or tap it on mobile.
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {availableDotCodeCounts.map(({ dotCode, quantity }) => (
                                      <Badge key={dotCode} variant="secondary" className="font-mono">
                                        {dotCode}{quantity > 1 ? ` × ${quantity}` : ""}
                                      </Badge>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                            {item.dotUnits.some((unit) => unit.status === "available" && unit.atWarehouse) && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100"
                                data-testid={`badge-at-warehouse-${item.id}`}
                              >
                                貨倉
                              </Badge>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.category && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="text-xl mr-3" data-testid={`category-icon-${item.id}`}>
                              {getCategoryIcon(item.category)}
                            </div>
                            <Badge variant="outline" className="capitalize">
                              {item.category}
                            </Badge>
                          </div>
                        </td>
                      )}
                      {visibleColumns.costPrice && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground" data-testid={`product-cost-price-${item.id}`}>
                          {item.costPrice ? `$${Number(item.costPrice).toFixed(2)}` : "-"}
                        </td>
                      )}
                      {visibleColumns.sellingPrice && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground" data-testid={`product-selling-price-${item.id}`}>
                          {item.sellingPrice ? `$${Number(item.sellingPrice).toFixed(2)}` : "-"}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-1">
                            <div className="flex gap-0.5 mr-2">
                              {[1, 2, 3, 4].map((qty) => (
                                <Button
                                  key={qty}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-xs font-medium"
                                  onClick={() => quickStockMutation.mutate({ id: item.id, addQuantity: qty })}
                                  disabled={quickStockMutation.isPending}
                                  data-testid={`btn-add-${qty}-${item.id}`}
                                  title={`Add ${qty} to stock`}
                                >
                                  +{qty}
                                </Button>
                              ))}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingItem(item)}
                              data-testid={`btn-edit-${item.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(item.id)}
                              disabled={deleteItemMutation.isPending}
                              data-testid={`btn-delete-${item.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AddInventoryModal
        isOpen={isAddModalOpen || !!editingItem}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingItem(null);
        }}
        editingItem={editingItem}
      />

      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        style={{ display: "none" }}
        onChange={handleFileUpload}
        data-testid="file-input-import"
      />
    </div>
  );
}
