import { useState, useMemo } from "react";
import InvoicePreviewModal from "@/components/invoice-preview-modal";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { 
  Calendar as CalendarIcon, 
  Calculator, 
  FileDown,
  Printer,
  TrendingUp,
  DollarSign,
  Receipt,
  Calendar as CalendarIconAlt,
  User,
  Building,
  Info,
  WalletCards
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Expense, InvoiceWithItems } from "@shared/schema";

interface DailySummary {
  date: string;
  invoices: InvoiceWithItems[];
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  invoiceCount: number;
}

interface MonthlySummary {
  month: string;
  year: number;
  totalAmount: number;
  totalProfit: number;
  invoiceCount: number;
  dailySummaries: DailySummary[];
}

interface YearlySummary {
  year: number;
  totalAmount: number;
  totalProfit: number;
  invoiceCount: number;
  monthlySummaries: MonthlySummary[];
}

type ReportType = "specific-date" | "whole-month" | "date-range";

export default function Reports() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [reportType, setReportType] = useState<ReportType>("whole-month");
  const [showDetailedReport, setShowDetailedReport] = useState(false);
  
  // Analytics filter state - defaults to current month
  const [analyticsFilter, setAnalyticsFilter] = useState<"total" | "monthly" | "yearly">("monthly");
  const [analyticsMonth, setAnalyticsMonth] = useState<Date | undefined>(new Date());
  const [analyticsYear, setAnalyticsYear] = useState<Date | undefined>(new Date());
  const [showExpenseStats, setShowExpenseStats] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceWithItems | null>(null);
  const [previewShowNotes, setPreviewShowNotes] = useState(false);

  // Customer Statement state
  const [showStatementInterface, setShowStatementInterface] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [statementMonth, setStatementMonth] = useState<Date | undefined>(undefined);
  const [showStatement, setShowStatement] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({
    name: "國華膠輪汽車用品",
    line1: "Kwok Wah Tyre & Motoring Accessories Co.",
    line2: "",
    address: "G/F, 290 Sai Yeung Choi Street North, Kowloon",
    phone: "23804092",
    email: "kwokwahtyre@biznetvigator.com"
  });
  const [manualIssueDate, setManualIssueDate] = useState("");
  const [manualStatementDate, setManualStatementDate] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  
  const { toast } = useToast();

  const { data: invoices = [], isLoading } = useQuery<InvoiceWithItems[]>({
    queryKey: ["/api/invoices"],
  });
  const { data: expenses = [] } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
  });

  // Calculate filtered statistics based on analytics filter
  // IMPORTANT: All hooks must be called before any early returns
  const filteredInvoices = useMemo(() => {
    if (analyticsFilter === "total") {
      return invoices;
    } else if (analyticsFilter === "monthly" && analyticsMonth) {
      const year = analyticsMonth.getFullYear();
      const month = String(analyticsMonth.getMonth() + 1).padStart(2, '0');
      return invoices.filter(invoice => invoice.invoiceDate.startsWith(`${year}-${month}`));
    } else if (analyticsFilter === "yearly" && analyticsYear) {
      const year = analyticsYear.getFullYear();
      return invoices.filter(invoice => invoice.invoiceDate.startsWith(`${year}`));
    }
    return invoices;
  }, [invoices, analyticsFilter, analyticsMonth, analyticsYear]);

  // Exclude invoices with deposits (not final invoices) from revenue calculation
  const finalInvoices = useMemo(() => 
    filteredInvoices.filter(invoice => 
      parseFloat(invoice.deposit || "0") === 0
    ), [filteredInvoices]
  );
  
  const totalRevenue = useMemo(() => 
    finalInvoices.reduce((sum, invoice) => sum + parseFloat(invoice.totalAmount), 0),
    [finalInvoices]
  );
  
  const totalProfit = useMemo(() => 
    finalInvoices
      .filter(invoice => invoice.profit !== null)
      .reduce((sum, invoice) => sum + parseFloat(invoice.profit || "0"), 0),
    [finalInvoices]
  );
  
  const invoicesWithProfit = useMemo(() => 
    finalInvoices.filter(invoice => invoice.profit !== null && invoice.profit !== undefined),
    [finalInvoices]
  );
  const filteredExpenses = useMemo(() => {
    if (analyticsFilter === "total") return expenses;
    if (analyticsFilter === "monthly" && analyticsMonth) {
      return expenses.filter((expense) => expense.expenseDate.startsWith(format(analyticsMonth, "yyyy-MM")));
    }
    if (analyticsFilter === "yearly" && analyticsYear) {
      return expenses.filter((expense) => expense.expenseDate.startsWith(format(analyticsYear, "yyyy")));
    }
    return expenses;
  }, [expenses, analyticsFilter, analyticsMonth, analyticsYear]);
  const totalExpenses = useMemo(() => filteredExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0), [filteredExpenses]);
  const netProfit = totalProfit - totalExpenses;

  const calculateProfit = () => {
    // Validate inputs based on report type
    if (reportType === "date-range") {
      if (!startDate || !endDate) {
        toast({
          title: "Select Date Range",
          description: "Please select both start and end dates to calculate profit totals.",
          variant: "destructive",
        });
        return;
      }
      if (startDate > endDate) {
        toast({
          title: "Invalid Date Range",
          description: "Start date must be before or equal to end date.",
          variant: "destructive",
        });
        return;
      }
    } else if (!selectedDate) {
      toast({
        title: "Select Date",
        description: `Please select a ${reportType === "whole-month" ? "month" : "date"} to calculate profit totals.`,
        variant: "destructive",
      });
      return;
    }

    let filteredInvoices: InvoiceWithItems[];
    let displayTitle: string;

    if (reportType === "whole-month") {
      const year = selectedDate!.getFullYear();
      const month = String(selectedDate!.getMonth() + 1).padStart(2, '0');
      filteredInvoices = invoices.filter(invoice => {
        return invoice.invoiceDate.startsWith(`${year}-${month}`);
      });
      displayTitle = format(selectedDate!, "MMMM yyyy");
    } else if (reportType === "specific-date") {
      const targetDate = format(selectedDate!, "yyyy-MM-dd");
      filteredInvoices = invoices.filter(invoice => {
        return invoice.invoiceDate === targetDate;
      });
      displayTitle = format(selectedDate!, "MMMM d, yyyy");
    } else { // date-range
      const startDateStr = format(startDate!, "yyyy-MM-dd");
      const endDateStr = format(endDate!, "yyyy-MM-dd");
      filteredInvoices = invoices.filter(invoice => {
        return invoice.invoiceDate >= startDateStr && invoice.invoiceDate <= endDateStr;
      });
      displayTitle = `${format(startDate!, "MMM d, yyyy")} - ${format(endDate!, "MMM d, yyyy")}`;
    }

    // Use the same final-invoice policy as the analytics cards.
    const finalPeriodInvoices = filteredInvoices.filter(invoice => parseFloat(invoice.deposit || "0") === 0);
    const invoicesWithProfit = finalPeriodInvoices.filter(invoice => invoice.profit !== null && invoice.profit !== undefined);
    const periodExpenses = expenses.filter((expense) => {
      if (reportType === "whole-month") return expense.expenseDate.startsWith(format(selectedDate!, "yyyy-MM"));
      if (reportType === "specific-date") return expense.expenseDate === format(selectedDate!, "yyyy-MM-dd");
      return expense.expenseDate >= format(startDate!, "yyyy-MM-dd") && expense.expenseDate <= format(endDate!, "yyyy-MM-dd");
    }).reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    if (invoicesWithProfit.length === 0 && periodExpenses === 0) {
      const totalInvoices = finalPeriodInvoices.length;
      toast({
        title: "No Profit Data",
        description: `Found ${totalInvoices} final invoices for ${displayTitle} but none have calculated profit yet. Calculate profit for invoices first.`,
        variant: "destructive",
      });
      return;
    }

    const totalProfit = invoicesWithProfit.reduce((sum, invoice) => {
      return sum + parseFloat(invoice.profit || "0");
    }, 0);

    const totalRevenue = invoicesWithProfit.reduce((sum, invoice) => {
      return sum + parseFloat(invoice.totalAmount);
    }, 0);
    const reportTypeTitle = reportType === "whole-month" ? "Monthly" : reportType === "specific-date" ? "Daily" : "Period";
    const reportTypeLabel = reportType === "whole-month" ? "Month" : reportType === "specific-date" ? "Date" : "Period";
    
    toast({
      title: `${reportTypeTitle} Profit Summary`,
      description: `${reportTypeLabel}: ${displayTitle}\nInvoices with saved profit: ${invoicesWithProfit.length}\nTotal Revenue: $${totalRevenue.toFixed(2)}\nInvoice Profit: $${totalProfit.toFixed(2)}\nExpenses: $${periodExpenses.toFixed(2)}\nNet Profit: $${(totalProfit - periodExpenses).toFixed(2)}`,
    });
  };

  const generateDetailedReport = () => {
    if (reportType === "date-range") {
      if (!startDate || !endDate) {
        toast({
          title: "Select Date Range",
          description: "Please select both start and end dates to generate detailed report.",
          variant: "destructive",
        });
        return;
      }
      if (startDate > endDate) {
        toast({
          title: "Invalid Date Range",
          description: "Start date must be before or equal to end date.",
          variant: "destructive",
        });
        return;
      }
    } else if (!selectedDate) {
      toast({
        title: "Select Date",
        description: `Please select a ${reportType === "whole-month" ? "month" : "date"} to generate detailed report.`,
        variant: "destructive",
      });
      return;
    }
    setShowDetailedReport(true);
  };

  const reportData = useMemo(() => {
    // Validate required dates based on report type
    if (reportType === "date-range") {
      if (!startDate || !endDate || !showDetailedReport) return null;
      // Prevent invalid date ranges from generating empty reports
      if (startDate > endDate) return null;
    } else {
      if (!selectedDate || !showDetailedReport) return null;
    }

    let filteredInvoices: InvoiceWithItems[];
    let displayTitle: string;

    if (reportType === "whole-month") {
      const year = selectedDate!.getFullYear();
      const month = String(selectedDate!.getMonth() + 1).padStart(2, '0');
      filteredInvoices = invoices.filter(invoice => 
        invoice.invoiceDate.startsWith(`${year}-${month}`)
      );
      displayTitle = format(selectedDate!, "MMMM yyyy");
    } else if (reportType === "specific-date") {
      const targetDate = format(selectedDate!, "yyyy-MM-dd");
      filteredInvoices = invoices.filter(invoice => 
        invoice.invoiceDate === targetDate
      );
      displayTitle = format(selectedDate!, "MMMM d, yyyy");
    } else { // date-range
      const startDateStr = format(startDate!, "yyyy-MM-dd");
      const endDateStr = format(endDate!, "yyyy-MM-dd");
      filteredInvoices = invoices.filter(invoice => 
        invoice.invoiceDate >= startDateStr && invoice.invoiceDate <= endDateStr
      );
      displayTitle = `${format(startDate!, "MMM d, yyyy")} - ${format(endDate!, "MMM d, yyyy")}`;
    }

    // Group by date — show ALL invoices (including deposit ones)
    const dailyGroups: { [date: string]: InvoiceWithItems[] } = {};
    filteredInvoices.forEach(invoice => {
      const date = invoice.invoiceDate;
      if (!dailyGroups[date]) {
        dailyGroups[date] = [];
      }
      dailyGroups[date].push(invoice);
    });

    // Create daily summaries with properly sorted invoices
    const dailySummaries: DailySummary[] = Object.entries(dailyGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dateInvoices]) => {
        // Sort invoices by invoice number within each day
        const sortedInvoices = dateInvoices.sort((a, b) => {
          const aMatch = a.invoiceNumber.match(/\d+$/)?.[0];
          const bMatch = b.invoiceNumber.match(/\d+$/)?.[0];
          const aNum = aMatch ? Number(aMatch) : Infinity;
          const bNum = bMatch ? Number(bMatch) : Infinity;
          if (aNum !== Infinity && bNum !== Infinity) {
            return aNum - bNum;
          }
          return a.invoiceNumber.localeCompare(b.invoiceNumber);
        });

        // Revenue totals exclude deposit invoices (not final)
        const revenueInvoices = sortedInvoices.filter(inv => parseFloat(inv.deposit || "0") === 0);
        const totalAmount = revenueInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
        const totalCost = revenueInvoices
          .filter(inv => inv.cost !== null && inv.cost !== undefined)
          .reduce((sum, inv) => sum + parseFloat(inv.cost || "0"), 0);
        const totalProfit = revenueInvoices
          .filter(inv => inv.profit !== null && inv.profit !== undefined)
          .reduce((sum, inv) => sum + parseFloat(inv.profit || "0"), 0);
        
        return {
          date,
          invoices: sortedInvoices,
          totalAmount,
          totalCost,
          totalProfit,
          invoiceCount: sortedInvoices.length
        };
      });

    // Calculate totals (revenue only, deposit invoices excluded)
    const periodExpenses = expenses.filter((expense) => {
      if (reportType === "whole-month") return expense.expenseDate.startsWith(format(selectedDate!, "yyyy-MM"));
      if (reportType === "specific-date") return expense.expenseDate === format(selectedDate!, "yyyy-MM-dd");
      return expense.expenseDate >= format(startDate!, "yyyy-MM-dd") && expense.expenseDate <= format(endDate!, "yyyy-MM-dd");
    }).reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    const totals = {
      totalAmount: dailySummaries.reduce((sum, day) => sum + day.totalAmount, 0),
      totalProfit: dailySummaries.reduce((sum, day) => sum + day.totalProfit, 0),
      totalExpenses: periodExpenses,
      netProfit: dailySummaries.reduce((sum, day) => sum + day.totalProfit, 0) - periodExpenses,
      invoiceCount: dailySummaries.reduce((sum, day) => sum + day.invoiceCount, 0)
    };

    return {
      title: displayTitle,
      reportType,
      dailySummaries,
      totals
    };
  }, [selectedDate, startDate, endDate, showDetailedReport, invoices, expenses, reportType]);

  // Get unique customers from invoices
  const uniqueCustomers = useMemo(() => {
    const customers = invoices
      .map(invoice => invoice.customerName)
      .filter((name): name is string => name !== null && name !== undefined && name.trim() !== '')
      .filter((name, index, arr) => arr.indexOf(name) === index)
      .sort();
    return customers;
  }, [invoices]);

  // Generate customer statement data
  const statementData = useMemo(() => {
    if (!selectedCustomer || !statementMonth || !showStatement) return null;

    const year = statementMonth.getFullYear();
    const month = String(statementMonth.getMonth() + 1).padStart(2, '0');
    
    // Filter invoices for selected customer and month
    const customerInvoices = invoices.filter(invoice => 
      invoice.customerName === selectedCustomer &&
      invoice.invoiceDate.startsWith(`${year}-${month}`)
    );

    // Sort by invoice date and then by invoice number
    const sortedInvoices = customerInvoices.sort((a, b) => {
      const dateCompare = a.invoiceDate.localeCompare(b.invoiceDate);
      if (dateCompare !== 0) return dateCompare;
      
      // If same date, sort by invoice number
      const aMatch = a.invoiceNumber.match(/\d+$/)?.[0];
      const bMatch = b.invoiceNumber.match(/\d+$/)?.[0];
      const aNum = aMatch ? Number(aMatch) : Infinity;
      const bNum = bMatch ? Number(bMatch) : Infinity;
      
      if (aNum !== Infinity && bNum !== Infinity) {
        return aNum - bNum;
      }
      return a.invoiceNumber.localeCompare(b.invoiceNumber);
    });

    // Calculate total
    const totalAmount = sortedInvoices.reduce((sum, invoice) => {
      return sum + parseFloat(invoice.totalAmount);
    }, 0);

    return {
      customer: selectedCustomer,
      month: format(statementMonth, "MMMM yyyy"),
      invoices: sortedInvoices,
      totalAmount,
      issueDate: format(new Date(), "MMMM d, yyyy"),
      statementDate: format(statementMonth, "MMMM d, yyyy")
    };
  }, [selectedCustomer, statementMonth, showStatement, invoices]);

  const generateStatement = () => {
    if (!selectedCustomer) {
      toast({
        title: "Select Customer",
        description: "Please select a customer to generate statement.",
        variant: "destructive",
      });
      return;
    }

    if (!statementMonth) {
      toast({
        title: "Select Month",
        description: "Please select a month for the statement.",
        variant: "destructive",
      });
      return;
    }

    setShowStatement(true);
  };

  const exportToPDF = () => {
    if (!reportData) return;
    
    // For now, just trigger print which can be saved as PDF
    window.print();
  };

  const printReport = () => {
    if (!reportData) return;
    window.print();
  };

  const exportStatementToPDF = async () => {
    if (!statementData) return;
    
    try {
      // Find the statement content element
      const statementElement = document.querySelector('.print-section .statement-content');
      if (!statementElement) {
        // Fallback to the entire print section
        const printSection = document.querySelector('.print-section');
        if (!printSection) {
          toast({
            title: "Export Error",
            description: "Could not find statement content to export.",
            variant: "destructive",
          });
          return;
        }
        
        // Use the print section as the target
        await generatePDFFromElement(printSection as HTMLElement, `statement-${statementData.customer}-${statementData.month.replace(' ', '-')}.pdf`);
      } else {
        await generatePDFFromElement(statementElement as HTMLElement, `statement-${statementData.customer}-${statementData.month.replace(' ', '-')}.pdf`);
      }
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Export Failed",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const generatePDFFromElement = async (element: HTMLElement, filename: string) => {
    // Show loading state
    toast({
      title: "Generating PDF",
      description: "Please wait while we generate your PDF...",
    });

    // Add PDF export mode class to hide buttons
    document.body.classList.add('pdf-export-mode');

    try {
      // Create canvas from the element
      const canvas = await html2canvas(element, {
        scale: 2, // Higher quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      // Calculate PDF dimensions
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Calculate scaling to fit A4
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      const ratio = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
      const scaledWidth = canvasWidth * ratio;
      const scaledHeight = canvasHeight * ratio;
      
      // Center the content
      const x = (pdfWidth - scaledWidth) / 2;
      const y = (pdfHeight - scaledHeight) / 2;

      // Add image to PDF
      pdf.addImage(imgData, 'PNG', x, y, scaledWidth, scaledHeight);
      
      // Save the PDF
      pdf.save(filename);
      
      // Show success message
      toast({
        title: "PDF Generated",
        description: `Statement exported as ${filename}`,
      });
    } finally {
      // Always remove PDF export mode class
      document.body.classList.remove('pdf-export-mode');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6" data-testid="reports-loading">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6" data-testid="reports-content">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-foreground">Reports & Analytics</h3>
        <p className="text-muted-foreground hidden sm:block">View business insights and generate detailed profit reports</p>
      </div>

      {/* Analytics Filter */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Filter:</label>
              <Select value={analyticsFilter} onValueChange={(value: "total" | "monthly" | "yearly") => {
                setAnalyticsFilter(value);
                if (value === "total") {
                  setAnalyticsMonth(undefined);
                  setAnalyticsYear(undefined);
                } else if (value === "monthly") {
                  setAnalyticsYear(undefined);
                } else if (value === "yearly") {
                  setAnalyticsMonth(undefined);
                }
              }}>
                <SelectTrigger className="w-32" data-testid="select-analytics-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {analyticsFilter === "monthly" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-48 pl-3 text-left font-normal"
                    data-testid="btn-analytics-month-selector"
                  >
                    {analyticsMonth ? (
                      format(analyticsMonth, "MMMM yyyy")
                    ) : (
                      <span className="text-muted-foreground">Select month</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={analyticsMonth}
                    onSelect={setAnalyticsMonth}
                    defaultMonth={analyticsMonth || new Date()}
                    data-testid="calendar-analytics-month-selector"
                  />
                </PopoverContent>
              </Popover>
            )}

            {analyticsFilter === "yearly" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-32 pl-3 text-left font-normal"
                    data-testid="btn-analytics-year-selector"
                  >
                    {analyticsYear ? (
                      format(analyticsYear, "yyyy")
                    ) : (
                      <span className="text-muted-foreground">Select year</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={analyticsYear}
                    onSelect={setAnalyticsYear}
                    defaultMonth={analyticsYear || new Date()}
                    data-testid="calendar-analytics-year-selector"
                  />
                </PopoverContent>
              </Popover>
            )}

            <Button
              type="button"
              variant={showExpenseStats ? "secondary" : "outline"}
              size="sm"
              className="ml-auto"
              onClick={() => setShowExpenseStats((current) => !current)}
              aria-pressed={showExpenseStats}
              data-testid="btn-toggle-expense-stats"
            >
              <WalletCards className="mr-2 h-4 w-4" />
              {showExpenseStats ? "Hide Expenses" : "Expenses & Net Profit"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className={`grid grid-cols-1 gap-4 mb-8 sm:grid-cols-2 ${showExpenseStats ? "xl:grid-cols-5" : "xl:grid-cols-3"}`} data-testid="report-stats">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600" data-testid="total-revenue-stat">
                  ${totalRevenue.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        {showExpenseStats && <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <Receipt className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600" data-testid="total-expenses-stat">
                  ${totalExpenses.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>}
        {showExpenseStats && <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-amber-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-amber-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
                <p className="text-2xl font-bold text-amber-600" data-testid="net-profit-stat">
                  ${netProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>}

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Total Profit</p>
                <p className="text-2xl font-bold text-blue-600" data-testid="total-profit-stat">
                  ${totalProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Receipt className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Invoices with Profit</p>
                <p className="text-2xl font-bold text-purple-600" data-testid="invoices-with-profit-stat">
                  {invoicesWithProfit.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Generation Tools */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Report Generation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {/* Report Type Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Report Type:</label>
              <Select value={reportType} onValueChange={(value: ReportType) => {
                setReportType(value);
                // Reset irrelevant date fields when switching report types
                if (value === "date-range") {
                  setSelectedDate(undefined);
                } else {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }
                // Hide detailed report when switching types
                setShowDetailedReport(false);
              }}>
                <SelectTrigger className="w-40" data-testid="select-report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whole-month">Whole Month</SelectItem>
                  <SelectItem value="specific-date">Specific Date</SelectItem>
                  <SelectItem value="date-range">Date Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Date Selector - Show different controls based on report type */}
            {reportType === "date-range" ? (
              <div className="flex items-center gap-2">
                {/* Start Date Picker */}
                <div className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">From:</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-40 pl-3 text-left font-normal"
                        data-testid="btn-start-date-selector"
                      >
                        {startDate ? (
                          format(startDate, "MMM d, yyyy")
                        ) : (
                          <span className="text-muted-foreground">Start date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        defaultMonth={startDate || new Date()}
                        data-testid="calendar-start-date-selector"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                {/* End Date Picker */}
                <div className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">To:</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-40 pl-3 text-left font-normal"
                        data-testid="btn-end-date-selector"
                      >
                        {endDate ? (
                          format(endDate, "MMM d, yyyy")
                        ) : (
                          <span className="text-muted-foreground">End date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        defaultMonth={endDate || new Date()}
                        data-testid="calendar-end-date-selector"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : (
              /* Single Date Picker for whole-month and specific-date */
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-64 pl-3 text-left font-normal"
                    data-testid="btn-date-selector"
                  >
                    {selectedDate ? (
                      reportType === "whole-month" 
                        ? format(selectedDate, "MMMM yyyy")
                        : format(selectedDate, "MMMM d, yyyy")
                    ) : (
                      <span>Select {reportType === "whole-month" ? "month" : "date"}...</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    defaultMonth={selectedDate || new Date()}
                    data-testid="calendar-date-selector"
                  />
                </PopoverContent>
              </Popover>
            )}
            
            <Button 
              onClick={calculateProfit}
              variant="outline"
              data-testid="btn-calculate-profit"
            >
              <Calculator className="w-4 h-4 mr-2" />
              Calculate Profit
            </Button>

            <Button 
              onClick={generateDetailedReport}
              variant="default"
              data-testid="btn-generate-report"
            >
              <CalendarIconAlt className="w-4 h-4 mr-2" />
              Generate Report
            </Button>

            <Button 
              onClick={() => setShowStatementInterface(!showStatementInterface)}
              variant="outline"
              data-testid="btn-toggle-statement"
            >
              <Building className="w-4 h-4 mr-2" />
              Statement
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customer Statement */}
      {showStatementInterface && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Customer Statement
            </CardTitle>
          </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Company Information */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm">Company Information</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Company Name</label>
                  <input
                    type="text"
                    value={companyInfo.name}
                    onChange={(e) => setCompanyInfo(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                    placeholder="Company Name"
                    data-testid="input-company-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Company Line 1</label>
                  <input
                    type="text"
                    value={companyInfo.line1}
                    onChange={(e) => setCompanyInfo(prev => ({ ...prev, line1: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                    placeholder="Company Line 1"
                    data-testid="input-company-line1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Company Line 2</label>
                  <input
                    type="text"
                    value={companyInfo.line2}
                    onChange={(e) => setCompanyInfo(prev => ({ ...prev, line2: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                    placeholder="Company Line 2"
                    data-testid="input-company-line2"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Address</label>
                  <textarea
                    value={companyInfo.address}
                    onChange={(e) => setCompanyInfo(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                    rows={2}
                    placeholder="Company Address"
                    data-testid="input-company-address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Phone</label>
                    <input
                      type="text"
                      value={companyInfo.phone}
                      onChange={(e) => setCompanyInfo(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                      placeholder="Phone Number"
                      data-testid="input-company-phone"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                    <input
                      type="email"
                      value={companyInfo.email}
                      onChange={(e) => setCompanyInfo(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                      placeholder="Email Address"
                      data-testid="input-company-email"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Statement Generation */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm">Generate Statement</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Customer</label>
                  <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                    <SelectTrigger className="w-full mt-1" data-testid="select-customer">
                      <SelectValue placeholder="Select customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueCustomers.map((customer) => (
                        <SelectItem key={customer} value={customer}>
                          {customer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Customer Address</label>
                  <textarea
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                    rows={2}
                    placeholder="Customer Address"
                    data-testid="input-customer-address"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Statement Month</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full mt-1 pl-3 text-left font-normal"
                        data-testid="btn-statement-month-selector"
                      >
                        {statementMonth ? (
                          format(statementMonth, "MMMM yyyy")
                        ) : (
                          <span className="text-muted-foreground">Select month...</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={statementMonth}
                        onSelect={setStatementMonth}
                        defaultMonth={statementMonth || new Date()}
                        data-testid="calendar-statement-month-selector"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Issue Date</label>
                    <input
                      type="text"
                      value={manualIssueDate}
                      onChange={(e) => setManualIssueDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                      placeholder="Issue Date"
                      data-testid="input-issue-date"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Statement Date</label>
                    <input
                      type="text"
                      value={manualStatementDate}
                      onChange={(e) => setManualStatementDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border border-input rounded-md text-sm"
                      placeholder="Statement Date"
                      data-testid="input-statement-date"
                    />
                  </div>
                </div>

                <Button 
                  onClick={generateStatement}
                  className="w-full mt-4"
                  data-testid="btn-generate-statement"
                >
                  <User className="w-4 h-4 mr-2" />
                  Generate Statement
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {/* Customer Statement Display */}
      {statementData && showStatement && (
        <Card className="mb-8 print-section">
          <CardHeader className="pb-4">
            <div className="flex justify-end no-print">
              <Button 
                onClick={() => window.print()}
                variant="outline"
                size="sm"
                data-testid="btn-print-statement"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Statement
              </Button>
              <Button 
                onClick={exportStatementToPDF}
                variant="outline"
                size="sm"
                data-testid="btn-export-pdf"
              >
                <FileDown className="w-4 h-4 mr-2" />
                Export to PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Statement Header */}
            <div className="mb-8 p-6 border rounded-lg bg-gray-50">
              {/* Company Info - Center Aligned */}
              <div className="text-center mb-8">
                <div className="text-xl font-bold mb-2">{companyInfo.name}</div>
                {companyInfo.line1 && (
                  <div className="text-lg font-bold mb-1">{companyInfo.line1}</div>
                )}
                {companyInfo.line2 && (
                  <div className="text-lg font-bold mb-3">{companyInfo.line2}</div>
                )}
                {companyInfo.address && (
                  <div className="text-sm text-muted-foreground whitespace-pre-line mb-2">
                    {companyInfo.address}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">
                  {companyInfo.phone && <div>Phone: {companyInfo.phone}</div>}
                  {companyInfo.email && <div>Email: {companyInfo.email}</div>}
                </div>
              </div>

              {/* Customer Info and Dates Row */}
              <div className="grid grid-cols-2 gap-8 pt-4 border-t">
                {/* Customer Info */}
                <div>
                  <h4 className="font-semibold mb-2">Bill To:</h4>
                  <div className="text-sm">
                    <div className="font-medium">{statementData.customer}</div>
                    {customerAddress && (
                      <div className="text-muted-foreground whitespace-pre-line mt-1">
                        {customerAddress}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates */}
                <div className="text-right">
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="font-medium">Issue Date:</span> {manualIssueDate || statementData.issueDate}
                    </div>
                    <div>
                      <span className="font-medium">Statement Date:</span> {manualStatementDate || statementData.statementDate}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Statement Title */}
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">月結單 Statement</h2>
            </div>

            {/* Statement Table */}
            <div className="mb-6 overflow-x-auto">
              <table className="w-full border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Invoice Date</th>
                    <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Invoice Number</th>
                    <th className="border border-gray-300 px-4 py-3 text-right font-semibold">Invoice Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statementData.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="border border-gray-300 px-4 py-3">
                        {format(new Date(`${invoice.invoiceDate}T00:00:00`), "MMM d, yyyy")}
                      </td>
                      <td className="border border-gray-300 px-4 py-3">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-right">
                        ${parseFloat(invoice.totalAmount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  
                  {/* Total Row */}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="border border-gray-300 px-4 py-3" colSpan={2}>
                      TOTAL
                    </td>
                    <td className="border border-gray-300 px-4 py-3 text-right">
                      ${statementData.totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Statement Footer */}
            <div className="text-center text-lg font-semibold pt-4 border-t">
              - End of Statement -
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Report */}
      {reportData && showDetailedReport && (
        <Card className="print-section">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-base sm:text-lg">Detailed {reportData.reportType === "whole-month" ? "Monthly" : reportData.reportType === "specific-date" ? "Daily" : "Period"} Report - {reportData.title}</CardTitle>
              <div className="flex gap-2 no-print">
                <Button 
                  onClick={exportToPDF}
                  variant="outline"
                  size="sm"
                  data-testid="btn-export-pdf"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
                <Button 
                  onClick={printReport}
                  variant="outline"
                  size="sm"
                  data-testid="btn-print-report"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Report Summary */}
            <div className="mb-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="font-semibold mb-2">{reportData.reportType === "whole-month" ? "Monthly" : reportData.reportType === "specific-date" ? "Daily" : "Period"} Summary</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Invoices:</span>
                  <p className="font-semibold">{reportData.totals.invoiceCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Revenue:</span>
                  <p className="font-semibold text-green-600">${reportData.totals.totalAmount.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Profit:</span>
                  <p className="font-semibold text-blue-600">${reportData.totals.totalProfit.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Expenses:</span>
                  <p className="font-semibold text-red-600">${reportData.totals.totalExpenses.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Net Profit:</span>
                  <p className="font-semibold text-amber-600">${reportData.totals.netProfit.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Daily Breakdown */}
            <div className="space-y-6">
              {reportData.dailySummaries.map((day) => (
                <div key={day.date} className="border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-1">
                    <h5 className="font-semibold text-base sm:text-lg">
                      {format(new Date(`${day.date}T00:00:00`), "EEEE, MMMM d, yyyy")}
                    </h5>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {day.invoiceCount} invoices • ${day.totalAmount.toFixed(2)} revenue • ${day.totalProfit.toFixed(2)} profit
                    </div>
                  </div>
                  
                  {/* Invoice Details Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">Invoice Number</th>
                          <th className="text-left py-2 px-4">Customer</th>
                          <th className="text-right py-2 px-4">Cost</th>
                          <th className="text-right py-2 px-4">Amount</th>
                          <th className="text-right py-2 px-4">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.invoices.map((invoice) => {
                          const hasDeposit = parseFloat(invoice.deposit || "0") > 0;
                          return (
                            <tr key={invoice.id} className={`border-b last:border-b-0 ${hasDeposit ? "opacity-60 italic" : ""}`}>
                              <td className="py-2 px-4 font-medium">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => {
                                      setPreviewShowNotes(false);
                                      setPreviewInvoice(invoice);
                                    }}
                                    className="text-primary underline underline-offset-2 hover:opacity-70 transition-opacity text-left"
                                  >
                                    {invoice.invoiceNumber}
                                  </button>
                                  {(invoice.remark || invoice.internalNotes) && (
                                    <button
                                      onClick={() => {
                                        setPreviewShowNotes(true);
                                        setPreviewInvoice(invoice);
                                      }}
                                      className="p-0 border-none bg-transparent cursor-pointer"
                                    >
                                      <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    </button>
                                  )}
                                  {hasDeposit && (
                                    <span className="text-xs font-normal not-italic bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                                      Deposit ${parseFloat(invoice.deposit || "0").toFixed(0)} — not in total
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-4">
                                {invoice.customerName || "N/A"}
                                {invoice.carNo && (
                                  <span className="text-muted-foreground ml-1">· {invoice.carNo}</span>
                                )}
                              </td>
                              <td className="py-2 px-4 text-right">
                                {invoice.cost ? (
                                  <span className="text-orange-600">${parseFloat(invoice.cost).toFixed(2)}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                              <td className="py-2 px-4 text-right">${parseFloat(invoice.totalAmount).toFixed(2)}</td>
                              <td className="py-2 px-4 text-right">
                                {invoice.profit ? (
                                  <span className={parseFloat(invoice.profit) >= 0 ? 'text-green-600' : 'text-red-600'}>
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Daily Summary */}
                  {reportData.reportType === "whole-month" && (
                    <div className="mt-4 p-3 bg-gray-50 rounded border-t">
                      <div className="flex justify-between font-semibold">
                        <span>Daily Total:</span>
                        <div className="space-x-6">
                          {day.totalCost > 0 && (
                            <span className="text-orange-600">Cost: ${day.totalCost.toFixed(2)}</span>
                          )}
                          <span>Revenue: ${day.totalAmount.toFixed(2)}</span>
                          <span className="text-blue-600">Profit: ${day.totalProfit.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            .no-print {
              display: none !important;
            }
            
            .print-section {
              box-shadow: none !important;
              border: none !important;
            }
            
            body * {
              visibility: hidden;
            }
            
            .print-section,
            .print-section * {
              visibility: visible;
            }
            
            .print-section {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
          }
        `
      }} />

      <InvoicePreviewModal
        invoice={previewInvoice}
        isOpen={!!previewInvoice}
        forceShowNotes={previewShowNotes}
        onClose={() => {
          setPreviewInvoice(null);
          setPreviewShowNotes(false);
        }}
      />
    </div>
  );
}