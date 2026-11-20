import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Pencil, Trash2, Search, Phone, User, Truck,
  Building2, Check, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type SupplyItemWithSuppliers, type SupplierDirectory } from "@shared/schema";

// ─── Supply Item form ────────────────────────────────────────────────────────
const supplyFormSchema = z.object({
  brand: z.string().min(1, "Brand is required"),
  pattern: z.string().min(1, "Pattern is required"),
  size: z.string().min(1, "Size is required"),
  evCompatibility: z.string().default("No"),
  supplierIds: z.array(z.string()).default([]),
});
type SupplyForm = z.infer<typeof supplyFormSchema>;

// ─── Supplier Directory form ─────────────────────────────────────────────────
const dirFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  contactPerson1: z.string().optional(),
  contactPerson2: z.string().optional(),
  contactPerson3: z.string().optional(),
  phoneNumber: z.string().optional(),
});
type DirForm = z.infer<typeof dirFormSchema>;

// ─── Inline Multi-select Supplier Picker ─────────────────────────────────────
function SupplierPicker({
  suppliers,
  value,
  onChange,
}: {
  suppliers: SupplierDirectory[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  if (suppliers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-1">
        No suppliers in directory yet. Add one in the "Supplier Directory" tab first.
      </p>
    );
  }

  return (
    <div className="border border-border rounded-md divide-y divide-border max-h-48 overflow-y-auto">
      {suppliers.map(s => {
        const checked = value.includes(s.id);
        return (
          <label
            key={s.id}
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
          >
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary cursor-pointer"
              checked={checked}
              onChange={() => toggle(s.id)}
            />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-sm">{s.companyName}</span>
              {s.phoneNumber && (
                <span className="text-xs text-muted-foreground ml-2">· {s.phoneNumber}</span>
              )}
            </div>
            {checked && <Check className="w-4 h-4 text-primary shrink-0" />}
          </label>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Supply() {
  const { toast } = useToast();

  // Supply Items state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSupplyModalOpen, setIsSupplyModalOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState<SupplyItemWithSuppliers | null>(null);
  const [deletingSupplyId, setDeletingSupplyId] = useState<string | null>(null);

  // Supplier Directory state
  const [isDirModalOpen, setIsDirModalOpen] = useState(false);
  const [editingDir, setEditingDir] = useState<SupplierDirectory | null>(null);
  const [deletingDirId, setDeletingDirId] = useState<string | null>(null);

  // ── Data ──
  const { data: supplyItems = [], isLoading: loadingItems } = useQuery<SupplyItemWithSuppliers[]>({
    queryKey: ["/api/supply"],
  });
  const { data: dirSuppliers = [], isLoading: loadingDir } = useQuery<SupplierDirectory[]>({
    queryKey: ["/api/supplier-directory"],
  });

  // ── Supply Item form ──
  const supplyForm = useForm<SupplyForm>({
    resolver: zodResolver(supplyFormSchema),
    defaultValues: { brand: "", pattern: "", size: "", evCompatibility: "No", supplierIds: [] },
  });

  const createSupplyMutation = useMutation({
    mutationFn: async (data: SupplyForm) => (await apiRequest("POST", "/api/supply", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supply"] });
      toast({ title: "Success", description: "Supply item added" });
      closeSupplyModal();
    },
    onError: () => toast({ title: "Error", description: "Failed to add supply item", variant: "destructive" }),
  });

  const updateSupplyMutation = useMutation({
    mutationFn: async (data: SupplyForm) =>
      (await apiRequest("PUT", `/api/supply/${editingSupply!.id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supply"] });
      toast({ title: "Success", description: "Supply item updated" });
      closeSupplyModal();
    },
    onError: () => toast({ title: "Error", description: "Failed to update supply item", variant: "destructive" }),
  });

  const deleteSupplyMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/supply/${id}`, undefined)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supply"] });
      toast({ title: "Deleted", description: "Supply item removed" });
      setDeletingSupplyId(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  });

  const openSupplyCreate = () => {
    setEditingSupply(null);
    supplyForm.reset({ brand: "", pattern: "", size: "", evCompatibility: "No", supplierIds: [] });
    setIsSupplyModalOpen(true);
  };

  const openSupplyEdit = (item: SupplyItemWithSuppliers) => {
    setEditingSupply(item);
    supplyForm.reset({
      brand: item.brand,
      pattern: item.pattern,
      size: item.size,
      evCompatibility: item.evCompatibility || "No",
      supplierIds: item.suppliers.map(s => s.id),
    });
    setIsSupplyModalOpen(true);
  };

  const closeSupplyModal = () => {
    setIsSupplyModalOpen(false);
    setEditingSupply(null);
    supplyForm.reset();
  };

  const onSupplySubmit = (data: SupplyForm) => {
    if (editingSupply) updateSupplyMutation.mutate(data);
    else createSupplyMutation.mutate(data);
  };

  // ── Supplier Directory form ──
  const dirForm = useForm<DirForm>({
    resolver: zodResolver(dirFormSchema),
    defaultValues: { companyName: "", contactPerson1: "", contactPerson2: "", contactPerson3: "", phoneNumber: "" },
  });

  const createDirMutation = useMutation({
    mutationFn: async (data: DirForm) => (await apiRequest("POST", "/api/supplier-directory", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-directory"] });
      toast({ title: "Success", description: "Supplier added to directory" });
      closeDirModal();
    },
    onError: () => toast({ title: "Error", description: "Failed to add supplier", variant: "destructive" }),
  });

  const updateDirMutation = useMutation({
    mutationFn: async (data: DirForm) =>
      (await apiRequest("PUT", `/api/supplier-directory/${editingDir!.id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-directory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supply"] });
      toast({ title: "Success", description: "Supplier updated" });
      closeDirModal();
    },
    onError: () => toast({ title: "Error", description: "Failed to update supplier", variant: "destructive" }),
  });

  const deleteDirMutation = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/supplier-directory/${id}`, undefined)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-directory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supply"] });
      toast({ title: "Deleted", description: "Supplier removed from directory" });
      setDeletingDirId(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete supplier", variant: "destructive" }),
  });

  const openDirCreate = () => {
    setEditingDir(null);
    dirForm.reset({ companyName: "", contactPerson1: "", contactPerson2: "", contactPerson3: "", phoneNumber: "" });
    setIsDirModalOpen(true);
  };

  const openDirEdit = (entry: SupplierDirectory) => {
    setEditingDir(entry);
    dirForm.reset({
      companyName: entry.companyName,
      contactPerson1: entry.contactPerson1 || "",
      contactPerson2: entry.contactPerson2 || "",
      contactPerson3: entry.contactPerson3 || "",
      phoneNumber: entry.phoneNumber || "",
    });
    setIsDirModalOpen(true);
  };

  const closeDirModal = () => {
    setIsDirModalOpen(false);
    setEditingDir(null);
    dirForm.reset();
  };

  const onDirSubmit = (data: DirForm) => {
    if (editingDir) updateDirMutation.mutate(data);
    else createDirMutation.mutate(data);
  };

  // ── Filtered supply items ──
  const filteredItems = supplyItems.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.size.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.pattern.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6">
      <Tabs defaultValue="items">
        <TabsList className="mb-6">
          <TabsTrigger value="items" className="flex items-center gap-2">
            <Truck className="w-4 h-4" /> Supply Items
          </TabsTrigger>
          <TabsTrigger value="directory" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Supplier Directory
          </TabsTrigger>
        </TabsList>

        {/* ══ SUPPLY ITEMS TAB ══ */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by tyre size, brand, or pattern…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openSupplyCreate} className="shrink-0">
              <Plus className="w-4 h-4 mr-2" /> Add Supply Item
            </Button>
          </div>

          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""} for "{searchQuery}"
            </p>
          )}

          {loadingItems ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : filteredItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Truck className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No supply items match your search." : "No supply items yet. Add one to get started."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Brand</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pattern</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Size</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">EV Compatible</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Suppliers</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{item.brand}</td>
                      <td className="px-4 py-3">{item.pattern}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-secondary text-secondary-foreground px-2 py-0.5 rounded text-xs font-mono">
                          {item.size}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          item.evCompatibility === "Yes"
                            ? "bg-green-100 text-green-700"
                            : item.evCompatibility === "Partial"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {item.evCompatibility || "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {item.suppliers && item.suppliers.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {item.suppliers.map(s => (
                              <span key={s.id} className="flex items-center gap-1 text-xs">
                                <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="font-medium">{s.companyName}</span>
                                {s.phoneNumber && (
                                  <span className="text-muted-foreground">· {s.phoneNumber}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openSupplyEdit(item)} className="h-8 w-8 p-0">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setDeletingSupplyId(item.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ══ SUPPLIER DIRECTORY TAB ══ */}
        <TabsContent value="directory" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openDirCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add Supplier
            </Button>
          </div>

          {loadingDir ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : dirSuppliers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No suppliers yet. Add one to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact 1</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact 2</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact 3</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Phone</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dirSuppliers.map(entry => (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          {entry.companyName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.contactPerson1 ? (
                          <span className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground" />{entry.contactPerson1}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {entry.contactPerson2 ? (
                          <span className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground" />{entry.contactPerson2}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {entry.contactPerson3 ? (
                          <span className="flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground" />{entry.contactPerson3}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {entry.phoneNumber ? (
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-muted-foreground" />{entry.phoneNumber}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openDirEdit(entry)} className="h-8 w-8 p-0">
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => setDeletingDirId(entry.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ══ SUPPLY ITEM MODAL ══ */}
      <Dialog open={isSupplyModalOpen} onOpenChange={closeSupplyModal}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSupply ? "Edit Supply Item" : "Add Supply Item"}</DialogTitle>
          </DialogHeader>
          <Form {...supplyForm}>
            <form onSubmit={supplyForm.handleSubmit(onSupplySubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={supplyForm.control} name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand *</FormLabel>
                      <FormControl><Input placeholder="e.g. Michelin" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplyForm.control} name="pattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pattern *</FormLabel>
                      <FormControl><Input placeholder="e.g. Pilot Sport 4" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={supplyForm.control} name="size"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Size *</FormLabel>
                      <FormControl><Input placeholder="e.g. 225/45R17" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplyForm.control} name="evCompatibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>EV Compatibility</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                          <SelectItem value="Partial">Partial</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={supplyForm.control} name="supplierIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Suppliers (from Directory)</FormLabel>
                    <FormControl>
                      <SupplierPicker
                        suppliers={dirSuppliers}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeSupplyModal}>Cancel</Button>
                <Button type="submit" disabled={createSupplyMutation.isPending || updateSupplyMutation.isPending}>
                  {createSupplyMutation.isPending || updateSupplyMutation.isPending
                    ? "Saving…"
                    : editingSupply ? "Save Changes" : "Add Item"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ══ SUPPLIER DIRECTORY MODAL ══ */}
      <Dialog open={isDirModalOpen} onOpenChange={closeDirModal}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDir ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <Form {...dirForm}>
            <form onSubmit={dirForm.handleSubmit(onDirSubmit)} className="space-y-4">
              <FormField
                control={dirForm.control} name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl><Input placeholder="e.g. ABC Tyre Co." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField
                  control={dirForm.control} name="contactPerson1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person 1</FormLabel>
                      <FormControl><Input placeholder="Name" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={dirForm.control} name="contactPerson2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person 2</FormLabel>
                      <FormControl><Input placeholder="Name" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={dirForm.control} name="contactPerson3"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person 3</FormLabel>
                      <FormControl><Input placeholder="Name" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={dirForm.control} name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl><Input placeholder="e.g. +852 1234 5678" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeDirModal}>Cancel</Button>
                <Button type="submit" disabled={createDirMutation.isPending || updateDirMutation.isPending}>
                  {createDirMutation.isPending || updateDirMutation.isPending
                    ? "Saving…"
                    : editingDir ? "Save Changes" : "Add Supplier"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ══ DELETE CONFIRMATIONS ══ */}
      <AlertDialog open={!!deletingSupplyId} onOpenChange={() => setDeletingSupplyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supply Item</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this supply item.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingSupplyId && deleteSupplyMutation.mutate(deletingSupplyId)}
              disabled={deleteSupplyMutation.isPending}
            >
              {deleteSupplyMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingDirId} onOpenChange={() => setDeletingDirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this supplier from the directory. Any supply items linked to this supplier will lose the association.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingDirId && deleteDirMutation.mutate(deletingDirId)}
              disabled={deleteDirMutation.isPending}
            >
              {deleteDirMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
