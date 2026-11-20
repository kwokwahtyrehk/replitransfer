import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { Package, Users, TrendingUp, ShoppingCart, DollarSign, Award, Search, FileText, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";

interface ProductSalesData {
  productName: string;
  brand: string;
  category: string;
  size: string;
  totalQuantitySold: number;
  totalRevenue: number;
  invoiceCount: number;
}

interface CustomerData {
  customerName: string;
  totalSpent: number;
  invoiceCount: number;
  averageOrderValue: number;
}

interface CategoryData {
  category: string;
  totalQuantity: number;
  totalRevenue: number;
  itemCount: number;
}

interface MonthlySalesData {
  month: string;
  revenue: number;
  invoiceCount: number;
}

interface StatisticsData {
  productSales: ProductSalesData[];
  topCustomers: CustomerData[];
  categoryBreakdown: CategoryData[];
  monthlySales: MonthlySalesData[];
  summary: {
    totalProducts: number;
    totalCustomers: number;
    totalRevenue: number;
    averageOrderValue: number;
  };
}

interface InvoiceSearchResult {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  customerName: string | null;
  carNo: string | null;
  totalAmount: string;
  matchedItems: { label: string; quantity: number; price: string }[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Statistics() {
  const [timeRange, setTimeRange] = useState<string>("all");
  const [sizeSearch, setSizeSearch] = useState<string>("");
  const [invoiceSearch, setInvoiceSearch] = useState<string>("");
  const [debouncedInvoiceSearch, setDebouncedInvoiceSearch] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedInvoiceSearch(invoiceSearch.trim());
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [invoiceSearch]);
  
  const { data: statistics, isLoading } = useQuery<StatisticsData>({
    queryKey: ["/api/statistics", { timeRange }],
    queryFn: async () => {
      const response = await fetch(`/api/statistics?timeRange=${timeRange}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch statistics");
      }
      return response.json();
    },
  });

  const { data: invoiceSearchResults, isFetching: isSearching } = useQuery<InvoiceSearchResult[]>({
    queryKey: ["/api/statistics/invoice-search", debouncedInvoiceSearch],
    queryFn: async () => {
      if (!debouncedInvoiceSearch) return [];
      const response = await fetch(`/api/statistics/invoice-search?q=${encodeURIComponent(debouncedInvoiceSearch)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Search failed");
      return response.json();
    },
    enabled: debouncedInvoiceSearch.length > 0,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const productSales = statistics?.productSales || [];
  const topCustomers = statistics?.topCustomers || [];
  const categoryBreakdown = statistics?.categoryBreakdown || [];
  const monthlySales = statistics?.monthlySales || [];
  const summary = statistics?.summary || { totalProducts: 0, totalCustomers: 0, totalRevenue: 0, averageOrderValue: 0 };

  const filteredProductSales = sizeSearch.trim() 
    ? productSales.filter(product => 
        product.size?.toLowerCase().includes(sizeSearch.toLowerCase()) ||
        product.productName?.toLowerCase().includes(sizeSearch.toLowerCase())
      )
    : productSales;

  const categoryChartData = categoryBreakdown.map((cat, index) => ({
    name: cat.category.charAt(0).toUpperCase() + cat.category.slice(1),
    value: cat.totalRevenue,
    quantity: cat.totalQuantity,
    fill: COLORS[index % COLORS.length]
  }));

  return (
    <div className="p-3 sm:p-6 space-y-6" data-testid="statistics-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="statistics-title">Sales Statistics</h1>
          <p className="text-muted-foreground hidden sm:block">Analyze your sales performance and product trends</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="time-range-select">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">This Quarter</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice Search by product keyword / tyre size */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="w-4 h-4" />
            Search Invoices by Product
          </CardTitle>
          <p className="text-sm text-muted-foreground">Type a tyre size, brand, pattern, or any product keyword to find invoices</p>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="e.g. 205/55R16, Michelin, Pilot Sport…"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="pl-10 pr-10"
            />
            {invoiceSearch && (
              <button
                onClick={() => { setInvoiceSearch(""); setDebouncedInvoiceSearch(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardHeader>

        {debouncedInvoiceSearch && (
          <CardContent className="pt-0">
            {isSearching ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : invoiceSearchResults && invoiceSearchResults.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary">{invoiceSearchResults.length} invoice{invoiceSearchResults.length !== 1 ? "s" : ""} found</Badge>
                  <span className="text-xs text-muted-foreground">for "{debouncedInvoiceSearch}"</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Total: ${invoiceSearchResults.reduce((s, r) => s + parseFloat(r.totalAmount || "0"), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Invoice No.</TableHead>
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        <TableHead className="whitespace-nowrap">Customer</TableHead>
                        <TableHead className="whitespace-nowrap">Car No.</TableHead>
                        <TableHead>Matched Item(s)</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceSearchResults.map((result) => (
                        <TableRow key={result.invoiceId}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              {result.invoiceNumber}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {result.invoiceDate
                              ? (() => { try { return format(new Date(result.invoiceDate), "d MMM yyyy"); } catch { return result.invoiceDate; } })()
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {result.customerName || <span className="text-muted-foreground">Walk-in</span>}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {result.carNo || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              {result.matchedItems.map((item, i) => (
                                <div key={i} className="text-xs flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">{item.quantity}×</Badge>
                                  <span className="font-medium">{item.label}</span>
                                  <span className="text-muted-foreground">@ ${parseFloat(item.price).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm whitespace-nowrap">
                            ${parseFloat(result.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No invoices found containing "{debouncedInvoiceSearch}"
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-products">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Products Sold</p>
                <p className="text-3xl font-bold">{summary.totalProducts.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card data-testid="card-total-customers">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-3xl font-bold">{summary.totalCustomers.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card data-testid="card-total-revenue">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-3xl font-bold">${summary.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <DollarSign className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card data-testid="card-avg-order">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                <p className="text-3xl font-bold">${summary.averageOrderValue.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <ShoppingCart className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-monthly-sales">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Monthly Sales Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlySales}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="Revenue" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No sales data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-category-breakdown">
          <CardHeader>
            <CardTitle>Sales by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    dataKey="value"
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No category data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-product-sales">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              Product Sales Frequency
            </CardTitle>
            <p className="text-sm text-muted-foreground">How many times each product was sold</p>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tyre size (e.g., 205/55R16)..."
                value={sizeSearch}
                onChange={(e) => setSizeSearch(e.target.value)}
                className="pl-10"
                data-testid="input-size-search"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Times Sold</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProductSales.length > 0 ? (
                    filteredProductSales.slice(0, 50).map((product, index) => (
                      <TableRow key={index} data-testid={`product-row-${index}`}>
                        <TableCell>
                          {index < 3 ? (
                            <Badge variant={index === 0 ? "default" : "secondary"} className={
                              index === 0 ? "bg-yellow-500" : index === 1 ? "bg-gray-400" : "bg-amber-600"
                            }>
                              #{index + 1}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">#{index + 1}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {product.productName || `${product.brand} ${product.size}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {product.category} {product.brand && `• ${product.brand}`} {product.size && `• ${product.size}`}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {product.invoiceCount}x
                        </TableCell>
                        <TableCell className="text-right">
                          {product.totalQuantitySold}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          ${product.totalRevenue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {sizeSearch.trim() 
                          ? `No products found matching "${sizeSearch}"`
                          : "No product sales data available"
                        }
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {sizeSearch.trim() && filteredProductSales.length > 0 && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  Search Results: {filteredProductSales.length} product{filteredProductSales.length !== 1 ? 's' : ''} found
                </p>
                <p className="text-sm text-muted-foreground">
                  Total Qty Sold: {filteredProductSales.reduce((sum, p) => sum + p.totalQuantitySold, 0)} | 
                  Total Revenue: ${filteredProductSales.reduce((sum, p) => sum + p.totalRevenue, 0).toLocaleString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-top-customers">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Top Customers
            </CardTitle>
            <p className="text-sm text-muted-foreground">Customers ranked by total spending</p>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Total Spent</TableHead>
                    <TableHead className="text-right">Avg. Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.length > 0 ? (
                    topCustomers.slice(0, 20).map((customer, index) => (
                      <TableRow key={index} data-testid={`customer-row-${index}`}>
                        <TableCell>
                          {index < 3 ? (
                            <Badge variant={index === 0 ? "default" : "secondary"} className={
                              index === 0 ? "bg-yellow-500" : index === 1 ? "bg-gray-400" : "bg-amber-600"
                            }>
                              #{index + 1}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">#{index + 1}</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {customer.customerName || "Walk-in Customer"}
                        </TableCell>
                        <TableCell className="text-right">
                          {customer.invoiceCount}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          ${customer.totalSpent.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          ${customer.averageOrderValue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No customer data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-best-sellers-chart">
        <CardHeader>
          <CardTitle>Top 10 Best Sellers by Quantity</CardTitle>
        </CardHeader>
        <CardContent>
          {productSales.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={productSales.slice(0, 10).map(p => ({
                name: p.productName || `${p.brand} ${p.size}`.substring(0, 15),
                quantity: p.totalQuantitySold,
                revenue: p.totalRevenue
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="quantity" fill="#3b82f6" name="Quantity Sold" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No sales data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
