import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Edit, Plus, Settings, Trash2, WalletCards } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import type { Expense, ExpenseSettings } from "@shared/schema";

type ExpenseForm = { item: string; amount: string; expenseDate: string; category: "rent" | "salary" | "other" };
const today = () => format(new Date(), "yyyy-MM-dd");
const money = (amount: string | number) => `$${Number(amount).toFixed(2)}`;
const blankForm = (): ExpenseForm => ({ item: "", amount: "", expenseDate: today(), category: "other" });

export default function Expenses() {
  const { toast } = useToast();
  const [month, setMonth] = useState(new Date());
  const [form, setForm] = useState<ExpenseForm>(blankForm);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState<ExpenseForm>(blankForm);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ rentAmount: "", salaryAmount: "" });
  const { data: expenses = [], isLoading } = useQuery<Expense[]>({ queryKey: ["/api/expenses"] });
  const { data: settings } = useQuery<ExpenseSettings>({ queryKey: ["/api/expense-settings"] });
  const monthKey = format(month, "yyyy-MM");
  const monthExpenses = useMemo(() => expenses.filter((expense) => expense.expenseDate.startsWith(monthKey)), [expenses, monthKey]);
  const total = useMemo(() => monthExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [monthExpenses]);
  const recurringSuggestions = useMemo(() => ([
    { category: "rent" as const, item: "Rent", amount: settings?.rentAmount ?? "42000.00" },
    { category: "salary" as const, item: "Salary", amount: settings?.salaryAmount ?? "75500.00" },
  ]).filter((suggestion) => !monthExpenses.some((expense) => expense.recurringKey === `${suggestion.category}:${monthKey}`)), [settings, monthExpenses, monthKey]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/expense-settings"] });
  };
  const createMutation = useMutation({
    mutationFn: (data: ExpenseForm) => apiRequest("POST", "/api/expenses", { ...data, amount: Number(data.amount) }),
    onSuccess: () => { invalidate(); setForm(blankForm()); toast({ title: "Expense recorded", description: "The expense has been added to your history." }); },
    onError: (error: Error) => toast({ title: "Could not record expense", description: error.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ExpenseForm }) => apiRequest("PUT", `/api/expenses/${id}`, { ...data, amount: Number(data.amount) }),
    onSuccess: () => { invalidate(); setEditing(null); toast({ title: "Expense updated" }); },
    onError: (error: Error) => toast({ title: "Could not update expense", description: error.message, variant: "destructive" }),
  });
  const confirmRecurringMutation = useMutation({
    mutationFn: ({ category, expenseDate }: { category: "rent" | "salary"; expenseDate: string }) =>
      apiRequest("POST", "/api/expenses/confirm-recurring", { category, month: monthKey, expenseDate }),
    onSuccess: async (response) => {
      const result = await response.json() as { created: boolean };
      invalidate();
      toast({ title: result.created ? "Recurring expense recorded" : "Already confirmed", description: result.created ? "The monthly expense has been added." : "This recurring expense was already recorded for this month." });
    },
    onError: (error: Error) => toast({ title: "Could not confirm recurring expense", description: error.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => { invalidate(); toast({ title: "Expense deleted" }); },
    onError: () => toast({ title: "Could not delete expense", variant: "destructive" }),
  });
  const settingsMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/expense-settings", { rentAmount: Number(settingsForm.rentAmount), salaryAmount: Number(settingsForm.salaryAmount) }),
    onSuccess: () => { invalidate(); setSettingsOpen(false); toast({ title: "Recurring defaults saved" }); },
    onError: (error: Error) => toast({ title: "Could not save defaults", description: error.message, variant: "destructive" }),
  });
  const updateForm = (setter: (value: any) => void, key: keyof ExpenseForm, value: string) => setter((current: ExpenseForm) => ({ ...current, [key]: value }));
  const suggestionDate = format(month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth() ? new Date() : new Date(month.getFullYear(), month.getMonth(), 1), "yyyy-MM-dd");

  return <div className="p-3 sm:p-6 space-y-6" data-testid="expenses-content">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><h3 className="text-xl font-semibold">Expenses</h3><p className="text-sm text-muted-foreground">Record business costs and manage monthly recurring expenses.</p></div>
      <Button variant="outline" onClick={() => { setSettingsForm({ rentAmount: settings?.rentAmount ?? "42000", salaryAmount: settings?.salaryAmount ?? "75500" }); setSettingsOpen(true); }} data-testid="btn-expense-settings"><Settings className="w-4 h-4 mr-2" />Recurring defaults</Button>
    </div>
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} data-testid="btn-expense-prev-month"><ChevronLeft className="w-5 h-5" /></Button>
      <span className="font-semibold" data-testid="expense-selected-month">{format(month, "MMMM yyyy")}</span>
      <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} data-testid="btn-expense-next-month"><ChevronRight className="w-5 h-5" /></Button>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardContent className="p-5 flex items-center gap-4"><div className="p-3 rounded-full bg-red-100"><WalletCards className="text-red-600" /></div><div><p className="text-sm text-muted-foreground">Expenses this month</p><p className="text-2xl font-bold" data-testid="expense-month-total">{money(total)}</p><p className="text-xs text-muted-foreground">{monthExpenses.length} recorded entries</p></div></CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Quick entry</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}>
        <Input value={form.item} onChange={(e) => updateForm(setForm, "item", e.target.value)} placeholder="Expense item" required data-testid="input-expense-item" />
        <Input value={form.amount} onChange={(e) => updateForm(setForm, "amount", e.target.value)} type="number" min="0.01" step="0.01" placeholder="Amount" required data-testid="input-expense-amount" />
        <DatePicker value={form.expenseDate} onChange={(value) => updateForm(setForm, "expenseDate", value)} required aria-label="Expense date" data-testid="input-expense-date" />
        <div className="flex gap-2"><Select value={form.category} onValueChange={(v: ExpenseForm["category"]) => updateForm(setForm, "category", v)}><SelectTrigger data-testid="select-expense-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="other">Other</SelectItem><SelectItem value="rent">Rent</SelectItem><SelectItem value="salary">Salary</SelectItem></SelectContent></Select><Button type="submit" disabled={createMutation.isPending} data-testid="btn-add-expense"><Plus className="w-4 h-4" /></Button></div>
      </form></CardContent></Card>
    </div>
    {recurringSuggestions.length > 0 && <Card><CardHeader><CardTitle className="text-base">Monthly suggestions</CardTitle><p className="text-sm text-muted-foreground">These are not recorded until you confirm them.</p></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{recurringSuggestions.map((suggestion) => <div key={suggestion.category} className="border rounded-lg p-4 flex items-center justify-between gap-3"><div><p className="font-medium">{suggestion.item}</p><p className="text-sm text-muted-foreground">{money(suggestion.amount)} · {suggestionDate}</p></div><Button onClick={() => confirmRecurringMutation.mutate({ category: suggestion.category, expenseDate: suggestionDate })} disabled={confirmRecurringMutation.isPending} data-testid={`btn-confirm-${suggestion.category}`}>Confirm</Button></div>)}</CardContent></Card>}
    <Card><CardHeader><CardTitle>Expense history · {format(month, "MMMM yyyy")}</CardTitle></CardHeader><CardContent>{isLoading ? <p className="text-muted-foreground">Loading expenses…</p> : monthExpenses.length === 0 ? <p className="text-muted-foreground py-6 text-center">No expenses recorded for this month.</p> : <div className="space-y-2">{monthExpenses.map((expense) => <div key={expense.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"><div><p className="font-medium">{expense.item}</p><p className="text-sm text-muted-foreground capitalize">{expense.category} · {expense.expenseDate}</p></div><div className="flex items-center gap-2"><span className="font-semibold">{money(expense.amount)}</span><Button variant="ghost" size="icon" onClick={() => { setEditing(expense); setEditForm({ item: expense.item, amount: expense.amount, expenseDate: expense.expenseDate, category: expense.category as ExpenseForm["category"] }); }} data-testid={`btn-edit-expense-${expense.id}`}><Edit className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => { if (window.confirm(`Delete "${expense.item}"?`)) deleteMutation.mutate(expense.id); }} data-testid={`btn-delete-expense-${expense.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button></div></div>)}</div>}</CardContent></Card>
    <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Edit expense</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (editing) updateMutation.mutate({ id: editing.id, data: editForm }); }}><div><Label>Item</Label><Input value={editForm.item} onChange={(e) => updateForm(setEditForm, "item", e.target.value)} required data-testid="input-edit-expense-item" /></div><div><Label>Amount</Label><Input value={editForm.amount} onChange={(e) => updateForm(setEditForm, "amount", e.target.value)} type="number" min="0.01" step="0.01" required data-testid="input-edit-expense-amount" /></div><div><Label>Date</Label><DatePicker value={editForm.expenseDate} onChange={(value) => updateForm(setEditForm, "expenseDate", value)} required aria-label="Expense date" data-testid="input-edit-expense-date" /></div><Select value={editForm.category} onValueChange={(v: ExpenseForm["category"]) => updateForm(setEditForm, "category", v)}><SelectTrigger data-testid="select-edit-expense-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="other">Other</SelectItem><SelectItem value="rent">Rent</SelectItem><SelectItem value="salary">Salary</SelectItem></SelectContent></Select><DialogFooter><Button type="submit" disabled={updateMutation.isPending} data-testid="btn-save-expense">Save changes</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent><DialogHeader><DialogTitle>Recurring monthly defaults</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Rent amount</Label><Input type="number" min="0.01" step="0.01" value={settingsForm.rentAmount} onChange={(e) => setSettingsForm({ ...settingsForm, rentAmount: e.target.value })} data-testid="input-recurring-rent" /></div><div><Label>Salary amount</Label><Input type="number" min="0.01" step="0.01" value={settingsForm.salaryAmount} onChange={(e) => setSettingsForm({ ...settingsForm, salaryAmount: e.target.value })} data-testid="input-recurring-salary" /></div></div><DialogFooter><Button onClick={() => settingsMutation.mutate()} disabled={settingsMutation.isPending} data-testid="btn-save-recurring-defaults">Save defaults</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}