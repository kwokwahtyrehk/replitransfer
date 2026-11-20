import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Eye, Download, Edit, Trash2, Filter, Settings, ChevronUp, ChevronDown, ChevronsUpDown, Calculator, Database, Bell, BellOff, DollarSign, Upload, Mail, Info, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { InvoiceWithItems } from "@shared/schema";
import CreateInvoiceModal from "@/components/create-invoice-modal";
import EditInvoiceModal from "@/components/edit-invoice-modal";
import InvoicePreviewModal from "@/components/invoice-preview-modal";
import InvoiceTemplateSettings from "@/components/invoice-template-settings";
import InvoiceNumberRepairModal from "@/components/invoice-number-repair-modal";
import { CalculateProfitModal } from "@/components/calculate-profit-modal";
import { format } from "date-fns";
import { useDataExport } from "@/hooks/use-data-export";

export default function Invoices() {
  const { isExporting, downloadFullExport } = useDataExport();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithItems | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewShowNotes, setPreviewShowNotes] = useState(false);
  const [isPrintPreview, setIsPrintPreview] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCalculateModalOpen, setIsCalculateModalOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [isTemplateSettingsOpen, setIsTemplateSettingsOpen] = useState(false);
  const [isNumberRepairOpen, setIsNumberRepairOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState({
    select: false,
    invoiceNumber: true,
    customer: true,
    date: false,
    amount: true,
    profit: false,
    actions: true,
  });
  const [sortConfig, setSortConfig] = useState<{
    key: 'invoiceNumber' | 'customerName' | 'createdAt' | 'totalAmount' | null;
    direction: 'asc' | 'desc';
  }>({ key: 'invoiceNumber', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const { toast } = useToast();

  const { data: invoices = [], isLoading } = useQuery<InvoiceWithItems[]>({
    queryKey: ["/api/invoices"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PUT", `/api/invoices/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Invoice status updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update invoice status",
        variant: "destructive",
      });
    },
  });

  const toggleFollowUpMutation = useMutation({
    mutationFn: async ({ id, followUpRequired }: { id: string; followUpRequired: number }) => {
      await apiRequest("PUT", `/api/invoices/${id}/follow-up`, { 
        followUpRequired,
        paymentReceivedDate: followUpRequired === 0 ? new Date().toISOString().split('T')[0] : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/follow-up"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Invoice follow-up status updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update follow-up status",
        variant: "destructive",
      });
    },
  });

  const batchFollowUpMutation = useMutation({
    mutationFn: async ({ ids, followUpRequired }: { ids: string[]; followUpRequired: number }) => {
      await apiRequest("PUT", `/api/invoices/batch/follow-up`, { 
        ids,
        followUpRequired,
        paymentReceivedDate: followUpRequired === 0 ? new Date().toISOString().split('T')[0] : null
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/follow-up"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setSelectedInvoices(new Set());
      toast({
        title: "Success",
        description: `${variables.ids.length} invoice(s) updated successfully`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update invoices",
        variant: "destructive",
      });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Invoice deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete invoice",
        variant: "destructive",
      });
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/invoices/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setSelectedInvoices(new Set());
      toast({
        title: "Success", 
        description: `${selectedInvoices.size} invoices deleted successfully`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete selected invoices",
        variant: "destructive",
      });
    },
  });

  // Function to handle column sorting
  const handleSort = (key: 'invoiceNumber' | 'customerName' | 'createdAt' | 'totalAmount') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get sort icon for column headers
  const getSortIcon = (columnKey: 'invoiceNumber' | 'customerName' | 'createdAt' | 'totalAmount') => {
    if (sortConfig.key !== columnKey) {
      return <ChevronsUpDown className="w-4 h-4 ml-1 text-muted-foreground" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ChevronUp className="w-4 h-4 ml-1" /> : 
      <ChevronDown className="w-4 h-4 ml-1" />;
  };

  const filteredInvoices = invoices.filter(invoice => {
    const search = searchTerm.toLowerCase();
    
    // Search in basic invoice fields
    const matchesBasic = 
      invoice.invoiceNumber.toLowerCase().includes(search) ||
      (invoice.customerName || "").toLowerCase().includes(search) ||
      (invoice.carNo || "").toLowerCase().includes(search) ||
      (invoice.invoiceDate || "").toLowerCase().includes(search);
    
    // Search in invoice items (product names, sizes, etc.)
    const matchesItems = invoice.items?.some(item => {
      const productName = item.productName || "";
      const brand = item.brand || "";
      const pattern = item.pattern || "";
      const size = item.size || "";
      const model = item.model || "";
      
      return productName.toLowerCase().includes(search) ||
             brand.toLowerCase().includes(search) ||
             pattern.toLowerCase().includes(search) ||
             size.toLowerCase().includes(search) ||
             model.toLowerCase().includes(search);
    }) || false;
    
    // Apply filters
    const matchesSearch = matchesBasic || matchesItems;
    
    const matchesDate = !dateFilter || 
      (invoice.invoiceDate || "").includes(dateFilter);
    
    const matchesCustomer = !customerFilter || 
      (invoice.customerName || "").toLowerCase().includes(customerFilter.toLowerCase());
    
    const matchesAmount = !amountFilter || 
      parseFloat(invoice.totalAmount).toString().includes(amountFilter);
    
    return matchesSearch && matchesDate && matchesCustomer && matchesAmount;
  });

  // Sort the filtered invoices
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aValue: any, bValue: any;
    
    switch (sortConfig.key) {
      case 'invoiceNumber':
        aValue = a.invoiceNumber;
        bValue = b.invoiceNumber;
        break;
      case 'customerName':
        aValue = (a.customerName || '').toLowerCase();
        bValue = (b.customerName || '').toLowerCase();
        break;
      case 'createdAt':
        aValue = a.invoiceDate || "";
        bValue = b.invoiceDate || "";
        break;
      case 'totalAmount':
        aValue = parseFloat(a.totalAmount);
        bValue = parseFloat(b.totalAmount);
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

  const totalPages = Math.ceil(sortedInvoices.length / pageSize);
  const paginatedInvoices = sortedInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleColumnVisibility = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  const clearFilters = () => {
    setDateFilter("");
    setCustomerFilter("");
    setAmountFilter("");
    setSearchTerm("");
    setCurrentPage(1);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this invoice?")) {
      deleteInvoiceMutation.mutate(id);
    }
  };

  const handleBatchDelete = () => {
    if (selectedInvoices.size === 0) return;
    
    const firstConfirm = window.confirm(`Are you sure you want to delete ${selectedInvoices.size} selected invoice(s)?`);
    if (!firstConfirm) return;
    
    const secondConfirm = window.confirm("This action cannot be undone. Are you absolutely sure?");
    if (secondConfirm) {
      batchDeleteMutation.mutate(Array.from(selectedInvoices));
    }
  };


  const handleSelectInvoice = (invoiceId: string, checked: boolean) => {
    const newSelected = new Set(selectedInvoices);
    if (checked) {
      newSelected.add(invoiceId);
    } else {
      newSelected.delete(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedInvoices(new Set(paginatedInvoices.map(invoice => invoice.id)));
    } else {
      setSelectedInvoices(new Set());
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      if (!backupData.invoices || !Array.isArray(backupData.invoices)) {
        throw new Error("Invalid backup file format");
      }

      const confirm = window.confirm(
        `This will restore ${backupData.invoices.length} invoices from the backup. This action cannot be undone. Continue?`
      );

      if (!confirm) {
        event.target.value = ''; // Reset file input
        return;
      }

      const response = await apiRequest("POST", "/api/invoices/restore", backupData);
      
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      
      toast({
        title: "Restore Complete",
        description: `Successfully restored ${backupData.invoices.length} invoices`,
      });
      
      event.target.value = ''; // Reset file input
    } catch (error) {
      console.error('Restore error:', error);
      toast({
        title: "Restore Failed",
        description: error instanceof Error ? error.message : "Failed to restore backup",
        variant: "destructive",
      });
      event.target.value = ''; // Reset file input
    }
  };

  const testBackupEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invoices/test-backup-email", {});
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Test Email Sent",
        description: `Backup email with ${data.invoiceCount} invoices sent to ${data.recipient}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Email Failed",
        description: error?.message || "Failed to send test email. Please check SendGrid API key.",
        variant: "destructive",
      });
    },
  });

  const handleBackupJSON = () => {
    if (!invoices || invoices.length === 0) {
      toast({
        title: "No Data",
        description: "No invoices to backup",
        variant: "destructive",
      });
      return;
    }

    // Create JSON backup with all invoice data
    const backupData = {
      exportDate: new Date().toISOString(),
      invoices: invoices
    };

    const jsonContent = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + 
                   String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(now.getDate()).padStart(2, '0');
    link.setAttribute('download', `invoices-backup-${dateStr}.json`);
    
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    
    toast({
      title: "Backup Complete",
      description: `Successfully backed up ${invoices.length} invoices to JSON`,
    });
  };

  const handleBackup = () => {
    if (!invoices || invoices.length === 0) {
      toast({
        title: "No Data",
        description: "No invoices to backup",
        variant: "destructive",
      });
      return;
    }

    // Prepare CSV data
    const csvData = [];
    
    // CSV headers
    csvData.push(['Invoice Number', 'Customer', 'Date', 'Products', 'Details', 'Quantity', 'Unit Price', 'Total Amount']);
    
    let totalItems = 0;
    
    // Add invoice item data
    invoices.forEach(invoice => {
      if (invoice.items && invoice.items.length > 0) {
        invoice.items.forEach(item => {
          // Build product name based on category
          let productName = '';
          let details = '';
          
          if (item.category === 'tyres') {
            productName = `${item.brand || ''} ${item.pattern || ''}`.trim();
            details = [
              item.size,
              item.specialMarkings
            ].filter(Boolean).join(' | ');
          } else if (item.category === 'wheels') {
            productName = `${item.brand || ''} ${item.model || ''}`.trim();
            details = [
              item.size,
              `PCD: ${item.pcd}`,
              item.color
            ].filter(Boolean).join(' | ');
          } else if (item.category === 'others') {
            productName = item.productName || '';
            details = '';
          }
          
          const quantity = item.quantity || 0;
          const unitPrice = parseFloat(item.price || '0');
          const totalAmount = quantity * unitPrice;
          
          const row = [
            invoice.invoiceNumber || '',
            invoice.customerName || '',
            invoice.invoiceDate || '',
            productName,
            details,
            quantity.toString(),
            unitPrice.toFixed(2),
            totalAmount.toFixed(2)
          ];
          
          csvData.push(row);
          totalItems++;
        });
      } else {
        // If no items, add a row with invoice info and empty product fields
        const row = [
          invoice.invoiceNumber || '',
          invoice.customerName || '',
          invoice.invoiceDate || '',
          '',
          '',
          '',
          '',
          parseFloat(invoice.totalAmount || '0').toFixed(2)
        ];
        csvData.push(row);
        totalItems++;
      }
    });
    
    // Convert to CSV string
    const csvContent = csvData.map(row => 
      row.map(field => {
        // Escape quotes and wrap fields containing commas, quotes, or newlines
        const stringField = String(field);
        if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
      }).join(',')
    ).join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename with current date
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + 
                   String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(now.getDate()).padStart(2, '0');
    link.setAttribute('download', `invoices-backup-${dateStr}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Success",
      description: `Backup completed! ${totalItems} items from ${invoices.length} invoices exported to CSV`,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6" data-testid="invoices-loading">
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
    <div className="p-3 sm:p-6" data-testid="invoices-content">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-foreground">Invoice Management</h3>
          <p className="text-sm text-muted-foreground hidden sm:block">Create and manage customer invoices</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedInvoices.size > 0 && (
            <>
              <Button 
                onClick={() => {
                  const ids = Array.from(selectedInvoices);
                  batchFollowUpMutation.mutate({ ids, followUpRequired: 1 });
                }}
                variant="outline"
                size="sm"
                disabled={batchFollowUpMutation.isPending}
                data-testid="btn-batch-follow-up"
              >
                <Bell className="w-4 h-4 mr-2" />
                Mark for Follow-up ({selectedInvoices.size})
              </Button>
              <Button 
                onClick={() => {
                  const ids = Array.from(selectedInvoices);
                  batchFollowUpMutation.mutate({ ids, followUpRequired: 0 });
                }}
                variant="outline"
                size="sm"
                disabled={batchFollowUpMutation.isPending}
                data-testid="btn-batch-mark-paid"
              >
                <BellOff className="w-4 h-4 mr-2" />
                Mark as Paid ({selectedInvoices.size})
              </Button>
              <Button 
                onClick={handleBatchDelete}
                variant="destructive"
                size="sm"
                data-testid="btn-batch-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete {selectedInvoices.size}
              </Button>
            </>
          )}
          <DropdownMenu open={isSettingsMenuOpen} onOpenChange={setIsSettingsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Invoice settings" data-testid="btn-invoice-settings">
                <Settings className="mr-2 h-4 w-4" />
                Setting
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Invoice tools</DropdownMenuLabel>
              <DropdownMenuItem disabled={isExporting} onSelect={() => void downloadFullExport()} data-testid="btn-export-all-data">
                <Download className="mr-2 h-4 w-4" />
                {isExporting ? "Exporting all data..." : "Export All Data (JSON)"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleBackupJSON} data-testid="btn-backup-json">
                <Database className="mr-2 h-4 w-4" />
                Backup (JSON)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => document.getElementById('restore-file-input')?.click()} data-testid="btn-restore-invoices">
                <Upload className="mr-2 h-4 w-4" />
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => testBackupEmailMutation.mutate()}
                disabled={testBackupEmailMutation.isPending}
                data-testid="btn-test-backup-email"
              >
                <Mail className="mr-2 h-4 w-4" />
                {testBackupEmailMutation.isPending ? "Sending..." : "Test Email"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setIsNumberRepairOpen(true)}
                data-testid="btn-open-invoice-number-repair"
              >
                <FileText className="mr-2 h-4 w-4" />
                Invoice # Repair
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setIsTemplateSettingsOpen(true)}
                data-testid="btn-open-template-settings"
              >
                <Settings className="mr-2 h-4 w-4" />
                Template Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            id="restore-file-input"
            type="file"
            accept=".json"
            onChange={handleRestore}
            className="hidden"
          />
          <Button 
            onClick={() => setIsCreateModalOpen(true)}
            data-testid="btn-create-invoice"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Main Search */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    type="text"
                    placeholder="Search by invoice #, customer name, car no., date, or product..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="pl-10"
                    data-testid="input-search-invoices"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="btn-column-settings">
                      <Settings className="w-4 h-4 mr-2" />
                      Columns
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" data-testid="column-settings-popover">
                    <div className="space-y-4">
                      <h4 className="font-medium">Show/Hide Columns</h4>
                      <div className="space-y-2">
                        {Object.entries(visibleColumns).map(([key, visible]) => (
                          <div key={key} className="flex items-center space-x-2">
                            <Checkbox
                              id={key}
                              checked={visible}
                              onCheckedChange={() => toggleColumnVisibility(key as keyof typeof visibleColumns)}
                              data-testid={`checkbox-column-${key}`}
                            />
                            <label
                              htmlFor={key}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize"
                            >
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Advanced Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Date Filter</label>
                <Input
                  type="text"
                  placeholder="Filter by date..."
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
                  data-testid="input-date-filter"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Customer Filter</label>
                <Input
                  type="text"
                  placeholder="Filter by customer..."
                  value={customerFilter}
                  onChange={(e) => { setCustomerFilter(e.target.value); setCurrentPage(1); }}
                  data-testid="input-customer-filter"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Amount Filter</label>
                <Input
                  type="text"
                  placeholder="Filter by amount..."
                  value={amountFilter}
                  onChange={(e) => { setAmountFilter(e.target.value); setCurrentPage(1); }}
                  data-testid="input-amount-filter"
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="w-full"
                  data-testid="btn-clear-filters"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Table */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <TooltipProvider>
            <table className="w-full" data-testid="invoices-table">
            <thead className="bg-muted">
              <tr>
                {visibleColumns.select && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-16">
                    <Checkbox
                      checked={selectedInvoices.size === paginatedInvoices.length && paginatedInvoices.length > 0}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                )}
                {visibleColumns.invoiceNumber && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider resize-x overflow-hidden">
                    <button 
                      className="flex items-center hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => handleSort('invoiceNumber')}
                      data-testid="sort-invoice-number"
                    >
                      Invoice #
                      {getSortIcon('invoiceNumber')}
                    </button>
                  </th>
                )}
                {visibleColumns.customer && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider resize-x overflow-hidden">
                    <button 
                      className="flex items-center hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => handleSort('customerName')}
                      data-testid="sort-customer"
                    >
                      Customer
                      {getSortIcon('customerName')}
                    </button>
                  </th>
                )}
                {visibleColumns.date && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider resize-x overflow-hidden">
                    <button 
                      className="flex items-center hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => handleSort('createdAt')}
                      data-testid="sort-date"
                    >
                      Date
                      {getSortIcon('createdAt')}
                    </button>
                  </th>
                )}
                {visibleColumns.amount && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider resize-x overflow-hidden">
                    <button 
                      className="flex items-center hover:text-foreground transition-colors cursor-pointer"
                      onClick={() => handleSort('totalAmount')}
                      data-testid="sort-amount"
                    >
                      Amount
                      {getSortIcon('totalAmount')}
                    </button>
                  </th>
                )}
                {visibleColumns.profit && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider resize-x overflow-hidden">
                    P
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
              {paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-6 py-8 text-center text-muted-foreground" data-testid="invoices-empty">
                    {searchTerm || dateFilter || customerFilter || amountFilter ? "No invoices match your filters." : "No invoices found. Create your first invoice to get started."}
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-muted/50 transition-colors" data-testid={`invoice-row-${invoice.id}`}>
                    {visibleColumns.select && (
                      <td className="px-6 py-4 whitespace-nowrap w-16">
                        <Checkbox
                          checked={selectedInvoices.has(invoice.id)}
                          onCheckedChange={(checked) => handleSelectInvoice(invoice.id, checked as boolean)}
                          data-testid={`checkbox-select-${invoice.id}`}
                        />
                      </td>
                    )}
                    {visibleColumns.invoiceNumber && (
                      <td className="px-6 py-4 whitespace-nowrap resize-x overflow-hidden">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setPreviewShowNotes(false);
                              setIsPreviewModalOpen(true);
                            }}
                            className="text-sm font-medium text-primary hover:text-primary/80 underline cursor-pointer text-left"
                            data-testid={`invoice-number-${invoice.id}`}
                          >
                            {invoice.invoiceNumber}
                          </button>
                          {Number(invoice.followUpRequired) === 0 && invoice.paymentReceivedDate && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <DollarSign 
                                  className="w-4 h-4 text-green-600 dark:text-green-500" 
                                  data-testid={`icon-paid-${invoice.id}`}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Paid on {format(new Date(invoice.paymentReceivedDate), 'MMM d, yyyy')}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {Number(invoice.followUpRequired) === 1 && (
                            <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800" data-testid={`badge-follow-up-${invoice.id}`}>
                              <Bell className="w-3 h-3 mr-1" />
                              Follow-up
                            </Badge>
                          )}
                          {(invoice.remark || invoice.internalNotes) && (
                            <button
                              onClick={() => {
                                setSelectedInvoice(invoice);
                                setPreviewShowNotes(true);
                                setIsPreviewModalOpen(true);
                              }}
                              data-testid={`icon-notes-${invoice.id}`}
                              className="p-0 border-none bg-transparent cursor-pointer"
                            >
                              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            </button>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {invoice.invoiceDate}
                        </div>
                      </td>
                    )}
                    {visibleColumns.customer && (
                      <td className="px-6 py-4 whitespace-nowrap resize-x overflow-hidden">
                        <div className="text-sm font-medium text-foreground" data-testid={`customer-name-${invoice.id}`}>
                          {invoice.customerName || "No customer name"}
                        </div>
                        {invoice.carNo && (
                          <div className="text-sm text-muted-foreground" data-testid={`car-no-${invoice.id}`}>
                            Car: {invoice.carNo}
                          </div>
                        )}
                      </td>
                    )}
                    {visibleColumns.date && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground resize-x overflow-hidden" data-testid={`invoice-date-${invoice.id}`}>
                        {invoice.invoiceDate}
                      </td>
                    )}
                    {visibleColumns.amount && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-foreground resize-x overflow-hidden" data-testid={`invoice-amount-${invoice.id}`}>
                        <div>${parseFloat(invoice.totalAmount).toFixed(2)}</div>
                        {parseFloat(invoice.shipping || "0") > 0 && (
                          <div className="text-xs text-muted-foreground font-normal">
                            incl. shipping ${parseFloat(invoice.shipping || "0").toFixed(2)}
                          </div>
                        )}
                        {parseFloat(invoice.deposit || "0") > 0 && (
                          <div className="text-xs text-muted-foreground font-normal">
                            deposit -${parseFloat(invoice.deposit || "0").toFixed(2)}
                          </div>
                        )}
                      </td>
                    )}
                    {visibleColumns.profit && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground resize-x overflow-hidden" data-testid={`invoice-profit-${invoice.id}`}>
                        {invoice.profit ? (
                          <span className={`font-semibold ${parseFloat(invoice.profit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${parseFloat(invoice.profit).toFixed(2)}
                            {invoice.totalAmount && parseFloat(invoice.totalAmount) !== 0 && (
                              <span className="font-normal text-xs ml-1 opacity-75">
                                ({((parseFloat(invoice.profit) / parseFloat(invoice.totalAmount)) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.actions && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="View"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setIsPrintPreview(false);
                              setIsPreviewModalOpen(true);
                            }}
                            data-testid={`btn-view-${invoice.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setIsEditModalOpen(true);
                            }}
                            data-testid={`btn-edit-${invoice.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Calculate Profit"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setIsCalculateModalOpen(true);
                            }}
                            data-testid={`btn-calculate-${invoice.id}`}
                          >
                            <Calculator className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Download PDF"
                            data-testid={`btn-download-${invoice.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title={Number(invoice.followUpRequired) === 1 ? "Mark as Paid" : "Mark for Follow-up"}
                            onClick={() => {
                              const newStatus = Number(invoice.followUpRequired) === 1 ? 0 : 1;
                              toggleFollowUpMutation.mutate({ id: invoice.id, followUpRequired: newStatus });
                            }}
                            disabled={toggleFollowUpMutation.isPending}
                            data-testid={`btn-toggle-follow-up-${invoice.id}`}
                          >
                            {Number(invoice.followUpRequired) === 1 ? (
                              <BellOff className="w-4 h-4 text-green-600" />
                            ) : (
                              <Bell className="w-4 h-4 text-orange-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(invoice.id)}
                            disabled={deleteInvoiceMutation.isPending}
                            data-testid={`btn-delete-invoice-${invoice.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </TooltipProvider>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, sortedInvoices.length)} of {sortedInvoices.length} invoices
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </Button>
              <span className="text-sm font-medium px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </Button>
            </div>
          </div>
        )}
      </Card>

      <CreateInvoiceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onInvoiceCreated={(invoice) => {
          setSelectedInvoice(invoice);
          setIsPrintPreview(true);
          setIsPreviewModalOpen(true);
        }}
      />

      <InvoicePreviewModal
        invoice={selectedInvoice}
        isOpen={isPreviewModalOpen}
        printMode={isPrintPreview}
        forceShowNotes={previewShowNotes}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setSelectedInvoice(null);
          setIsPrintPreview(false);
          setPreviewShowNotes(false);
        }}
      />

      <EditInvoiceModal
        invoice={selectedInvoice}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedInvoice(null);
        }}
      />

      <CalculateProfitModal
        invoice={selectedInvoice}
        isOpen={isCalculateModalOpen}
        onClose={() => {
          setIsCalculateModalOpen(false);
          setSelectedInvoice(null);
        }}
      />
      <InvoiceNumberRepairModal
        invoices={invoices}
        open={isNumberRepairOpen}
        onOpenChange={setIsNumberRepairOpen}
      />
      <InvoiceTemplateSettings
        open={isTemplateSettingsOpen}
        onOpenChange={setIsTemplateSettingsOpen}
        hideTrigger
      />
    </div>
  );
}
