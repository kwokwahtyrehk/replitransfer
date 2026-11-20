import { useState, useRef, useEffect } from "react";
import { Download, Printer, FileText, User, Car, Building2, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InvoiceWithItems } from "@shared/schema";

interface InvoicePreviewModalProps {
  invoice: InvoiceWithItems | null;
  isOpen: boolean;
  onClose: () => void;
  printMode?: boolean; // When true, hide internal notes for printing/PDF
  isCreationPreview?: boolean; // When true, hide print/PDF buttons (during invoice creation)
  forceShowNotes?: boolean; // When true, always show comment + internal notes
}

export default function InvoicePreviewModal({ 
  invoice, 
  isOpen, 
  onClose,
  printMode = false,
  isCreationPreview = false,
  forceShowNotes = false,
}: InvoicePreviewModalProps) {
  const [showHeader, setShowHeader] = useState(true);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [templateSettings, setTemplateSettings] = useState({
    companyName: "國華膠輪汽車用品",
    companySubtitle: "Kwok Wah Tyre & Motoring Accessories Co.",
    invoiceTitle: "",
    showBrand: false,
    showInternalNotes: true,
    showCustomerInfo: true,
    showDeposit: true,
    showShipping: true,
    primaryColor: "#000000",
    fontFamily: "Arial, sans-serif",
    titleSize: "24",
    titleBold: true,
    contentSize: "14",
    contentBold: false,
    totalSize: "18",
    totalBold: true,
    headerAlignment: "center", 
    bodyAlignment: "left",
    marginTop: "20",
    marginBottom: "20",
    marginLeft: "20",
    marginRight: "20",
    companyAddress: "G/F, 290 Sai Yeung Choi Street North, Kowloon",
    phoneNumber: "23804092",
    emailAddress: "kwokwahtyre@biznetvigator.com",
    footerText: "Thank you for your business!",
    // Company Information Font Settings
    companyNameFontFamily: "Arial, sans-serif",
    companyNameFontSize: "24",
    companyNameBold: true,
    companySubtitleFontFamily: "Arial, sans-serif",
    companySubtitleFontSize: "14",
    companySubtitleBold: false,
    companyContactFontFamily: "Arial, sans-serif",
    companyContactFontSize: "12",
    companyContactBold: false,
  });

  // Override template settings for print mode - hide internal notes
  const effectiveSettings = printMode 
    ? { ...templateSettings, showInternalNotes: false }
    : templateSettings;

  useEffect(() => {
    const stored = localStorage.getItem('invoiceTemplateSettings');
    if (stored) {
      setTemplateSettings(JSON.parse(stored));
    }
  }, [isOpen]);

  if (!invoice) return null;

  const itemsSubtotal = invoice.items.reduce((sum, item) => sum + (item.quantity * parseFloat(item.price)), 0);
  const deposit = parseFloat(invoice.deposit?.toString() || "0");
  const shipping = parseFloat(invoice.shipping?.toString() || "0");
  const finalTotal = itemsSubtotal - deposit + shipping;
  
  const handlePrint = () => {
    const printContent = invoiceRef.current;
    if (printContent) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const fontSize = `${templateSettings.contentSize}px`;
        
        // Use custom margins
        const marginTop = templateSettings.marginTop || '20';
        const marginBottom = templateSettings.marginBottom || '20';
        const marginLeft = templateSettings.marginLeft || '20';
        const marginRight = templateSettings.marginRight || '20';
        
        // Create print-specific HTML that matches preview exactly
        const printHTML = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Invoice ${invoice.invoiceNumber}</title>
              <style>
                @page { 
                  margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; 
                }
                body { 
                  font-family: ${templateSettings.fontFamily}; 
                  margin: 0; 
                  padding: 32px;
                  font-size: ${fontSize};
                  color: #000;
                  background: white;
                }
                .company-header { 
                  text-align: ${templateSettings.headerAlignment}; 
                  margin-bottom: 30px; 
                }
                .company-name {
                  color: ${templateSettings.primaryColor};
                  font-family: ${templateSettings.companyNameFontFamily || templateSettings.fontFamily};
                  font-size: ${templateSettings.companyNameFontSize || templateSettings.titleSize}px;
                  font-weight: ${(templateSettings.companyNameBold !== undefined ? templateSettings.companyNameBold : templateSettings.titleBold) ? 'bold' : 'normal'};
                  margin-bottom: 8px;
                }
                .company-subtitle {
                  color: #666;
                  margin-bottom: 16px;
                  font-family: ${templateSettings.companySubtitleFontFamily || templateSettings.fontFamily};
                  font-size: ${templateSettings.companySubtitleFontSize || templateSettings.contentSize}px;
                  font-weight: ${(templateSettings.companySubtitleBold !== undefined ? templateSettings.companySubtitleBold : templateSettings.contentBold) ? 'bold' : 'normal'};
                }
                .invoice-title {
                  text-align: center;
                  font-size: ${templateSettings.titleSize}px;
                  font-weight: ${templateSettings.titleBold ? 'bold' : 'normal'};
                  color: ${templateSettings.primaryColor};
                  margin: 24px 0;
                }
                .invoice-details { 
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 32px;
                  margin-bottom: 32px;
                }
                .info-bubble {
                  border-radius: 8px;
                  padding: 16px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .info-bubble.blue {
                  background: #eff6ff;
                  border: 1px solid #bfdbfe;
                }
                .info-bubble.green {
                  background: #f0fdf4;
                  border: 1px solid #bbf7d0;
                }
                .bubble-header {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  margin-bottom: 12px;
                }
                .bubble-dot {
                  width: 12px;
                  height: 12px;
                  border-radius: 50%;
                }
                .bubble-dot.blue { background: #3b82f6; }
                .bubble-dot.green { background: #10b981; }
                .bubble-title {
                  font-weight: ${templateSettings.contentBold ? 'bold' : '600'};
                  font-size: ${templateSettings.contentSize}px;
                }
                .bubble-title.blue { color: #1e40af; }
                .bubble-title.green { color: #065f46; }
                .bubble-content {
                  font-size: ${templateSettings.contentSize}px;
                  font-weight: ${templateSettings.contentBold ? 'bold' : 'normal'};
                }
                .bubble-row {
                  display: flex;
                  justify-content: space-between;
                  margin-bottom: 8px;
                }
                .bubble-label { color: #666; }
                .bubble-value { font-weight: 600; }
                .items-table-container {
                  background: #f9fafb;
                  border: 1px solid #e5e7eb;
                  border-radius: 8px;
                  overflow: hidden;
                  margin-bottom: 24px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .table-header {
                  background: #374151;
                  color: white;
                  padding: 12px 16px;
                }
                .table-title {
                  font-weight: 600;
                  font-size: 18px;
                  margin: 0;
                }
                .items-table { 
                  width: 100%; 
                  border-collapse: collapse;
                  border: 2px solid #000000;
                }
                .items-table thead tr {
                  background: #f3f4f6;
                  border-bottom: 2px solid #000000;
                }
                .items-table th { 
                  padding: 16px;
                  font-weight: bold;
                  color: #374151;
                  border: 1px solid #000000;
                }
                .items-table td { 
                  padding: 16px;
                  border: 1px solid #000000;
                }
                .items-table tbody tr:nth-child(even) {
                  background: #f9fafb;
                }
                .items-table tbody tr:nth-child(odd) {
                  background: white;
                }
                .product-name {
                  font-weight: 600;
                  color: #111827;
                  margin-bottom: 4px;
                }
                .product-brand {
                  font-size: ${Math.max(parseInt(templateSettings.contentSize) - 2, 10)}px;
                  color: ${templateSettings.primaryColor};
                  font-weight: ${templateSettings.contentBold ? 'bold' : '500'};
                }
                .product-details {
                  font-size: ${Math.max(parseInt(templateSettings.contentSize) - 2, 10)}px;
                  color: #666;
                }
                .detail-row {
                  display: flex;
                  margin-bottom: 4px;
                }
                .detail-label {
                  font-weight: 500;
                  width: 64px;
                  flex-shrink: 0;
                }
                .total-value {
                  font-weight: bold;
                  color: ${templateSettings.primaryColor};
                  font-size: 18px;
                }
                .total-section {
                  display: flex;
                  justify-content: flex-end;
                  margin-top: 32px;
                }
                .total-card {
                  background: white;
                  border: 1px solid #e5e7eb;
                  border-radius: 8px;
                  padding: 24px;
                  max-width: 320px;
                  width: 100%;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .total-row {
                  display: flex;
                  justify-content: space-between;
                  margin-bottom: 8px;
                  font-size: 18px;
                }
                .total-row.final {
                  border-top: 1px solid #d1d5db;
                  padding-top: 8px;
                  margin-top: 8px;
                  font-size: 20px;
                  font-weight: bold;
                }
                .deposit-row {
                  color: #dc2626 !important;
                  font-size: 14px;
                }
                .shipping-row {
                  font-size: 14px;
                  color: #000000 !important;
                }
                .total-value {
                  color: #000000 !important;
                }
                .footer {
                  margin-top: 32px;
                  padding-top: 24px;
                  border-top: 1px solid #d1d5db;
                  text-align: center;
                }
                .footer-text {
                  font-size: ${templateSettings.contentSize}px;
                  color: #666;
                  font-weight: ${templateSettings.contentBold ? 'bold' : '500'};
                }
                @media print { 
                  body { margin: 0; padding: 0; }
                  .no-print { display: none; }
                  /* Force colors to be preserved during print */
                  * { 
                    -webkit-print-color-adjust: exact !important;
                    color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                  .deposit-row {
                    color: #dc2626 !important;
                  }
                  .shipping-row {
                    color: #000000 !important;
                  }
                  .total-value {
                    color: #000000 !important;
                  }
                  .total-row {
                    color: #000000 !important;
                  }
                }
              </style>
            </head>
            <body>
              <!-- Company Information -->
              ${showHeader ? `
              <div class="company-header">
                <h1 class="company-name">${templateSettings.companyName}</h1>
                <p class="company-subtitle">${templateSettings.companySubtitle}</p>
                ${(templateSettings.companyAddress || templateSettings.phoneNumber || templateSettings.emailAddress) ? `
                <div style="color: #666; font-family: ${templateSettings.companyContactFontFamily || templateSettings.fontFamily}; font-size: ${templateSettings.companyContactFontSize || Math.max(10, parseInt(templateSettings.contentSize) - 2)}px; font-weight: ${(templateSettings.companyContactBold !== undefined ? templateSettings.companyContactBold : templateSettings.contentBold) ? 'bold' : 'normal'};">
                  ${templateSettings.companyAddress ? `<div>${templateSettings.companyAddress}</div>` : ''}
                  ${templateSettings.phoneNumber ? `<div>Phone: ${templateSettings.phoneNumber}</div>` : ''}
                  ${templateSettings.emailAddress ? `<div>Email: ${templateSettings.emailAddress}</div>` : ''}
                </div>
                ` : ''}
              </div>
              
              <!-- Invoice Title -->
              ${templateSettings.invoiceTitle ? `<div class="invoice-title">${templateSettings.invoiceTitle}</div>` : ''}
              ` : ''}
              
              <!-- Invoice Information -->
              <div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong>Invoice Number:</strong> ${invoice.invoiceNumber}
                  </div>
                  <div>
                    <strong>Date:</strong> ${formatDate(invoice.invoiceDate)}
                  </div>
                </div>
                ${(invoice.customerName || invoice.carNo) ? `
                <div style="margin-top: 8px;">
                  ${invoice.customerName ? `<strong>Customer:</strong> ${invoice.customerName}` : ''}
                  ${invoice.customerName && invoice.carNo ? ' | ' : ''}
                  ${invoice.carNo ? `<strong>Car Number:</strong> ${invoice.carNo}` : ''}
                </div>
                ` : ''}
              </div>
              
              
              <!-- Professional Items Table -->
              <div class="items-table-container">
                <table class="items-table">
                  <thead>
                    <tr>
                      <th style="text-align: left;">Product</th>
                      <th style="text-align: center;">Qty</th>
                      <th style="text-align: right;">Unit Price</th>
                      <th style="text-align: right;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${invoice.items.map((item, index) => `
                      <tr>
                        <td>
                          <div class="product-name">${item.productName}</div>
                          ${templateSettings.showBrand && item.brand ? `<div class="product-brand">Brand: ${item.brand}</div>` : ''}
                        </td>
                        <td style="text-align: center; font-weight: 600;">${item.quantity}</td>
                        <td style="text-align: right; font-weight: 600;">$${parseFloat(item.price).toFixed(2)}</td>
                        <td style="text-align: right;" class="total-value">$${(item.quantity * parseFloat(item.price)).toFixed(2)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              
              <!-- Comments Section - appears before subtotal in print -->
              ${invoice.remark ? `
              <div class="comments-section" style="margin: 24px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #f9fafb;">
                <h3 style="font-size: ${templateSettings.contentSize}px; font-weight: ${templateSettings.contentBold ? 'bold' : '600'}; margin-bottom: 8px; color: #374151;">Comments</h3>
                <p style="font-size: ${templateSettings.contentSize}px; font-weight: ${templateSettings.contentBold ? 'bold' : 'normal'}; color: #374151; margin: 0;">${invoice.remark}</p>
              </div>
              ` : ''}
              
              <!-- Total Section -->
              <div class="total-section">
                <div class="total-card">
                  <div class="total-row" style="font-size: ${templateSettings.totalSize}px; font-weight: ${templateSettings.totalBold ? 'bold' : 'normal'};">
                    <span>Subtotal:</span>
                    <span>$${itemsSubtotal.toFixed(2)}</span>
                  </div>
                  ${deposit > 0 ? `
                  <div class="total-row deposit-row" style="font-size: ${Math.max(parseInt(templateSettings.totalSize) - 2, 12)}px; font-weight: ${templateSettings.totalBold ? 'bold' : 'normal'}; color: #dc2626;">
                    <span>Deposit (paid):</span>
                    <span>-$${deposit.toFixed(2)}</span>
                  </div>
                  ` : ''}
                  ${shipping > 0 ? `
                  <div class="total-row shipping-row" style="font-size: ${Math.max(parseInt(templateSettings.totalSize) - 2, 12)}px; font-weight: ${templateSettings.totalBold ? 'bold' : 'normal'};">
                    <span>Shipping:</span>
                    <span>+$${shipping.toFixed(2)}</span>
                  </div>
                  ` : ''}
                  <div class="total-row final" style="font-size: ${Math.max(parseInt(templateSettings.totalSize), 18)}px; font-weight: bold;">
                    <span>Total Amount:</span>
                    <span>$${finalTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              <!-- Footer -->
              ${showHeader && templateSettings.footerText ? `
              <div class="footer">
                <p class="footer-text">${templateSettings.footerText}</p>
              </div>
              ` : ''}
            </body>
          </html>
        `;
        
        printWindow.document.write(printHTML);
        printWindow.document.close();
        printWindow.print();
        printWindow.close();
      }
    }
  };

  const handleExportPDF = async () => {
    const el = invoiceRef.current;
    if (!el) return;
    setIsExportingPDF(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pdfW / canvas.width, pdfH / canvas.height);
      const imgW = canvas.width * ratio;
      const imgH = canvas.height * ratio;
      const x = (pdfW - imgW) / 2;
      const y = 0;
      // If content is taller than one page, add extra pages
      const totalPages = Math.ceil(imgH / pdfH);
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", x, y - page * pdfH, imgW, imgH);
      }
      pdf.save(`${invoice.invoiceNumber}.pdf`);
      toast({ title: "PDF saved", description: `${invoice.invoiceNumber}.pdf` });
    } catch (err) {
      toast({ title: "Export failed", description: "Could not generate PDF. Please try again.", variant: "destructive" });
    } finally {
      setIsExportingPDF(false);
    }
  };

  const _handleExportPDF_UNUSED = () => {
    // kept only so the template HTML strings below compile; not called anywhere
    const pdfWindow = window.open('', '_blank');
    if (!pdfWindow) return;

    const fontSize = `${templateSettings.contentSize}px`;
    const marginTop = templateSettings.marginTop || '20';
    const marginBottom = templateSettings.marginBottom || '20';
    const marginLeft = templateSettings.marginLeft || '20';
    const marginRight = templateSettings.marginRight || '20';

    const pdfHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${invoice.invoiceNumber}</title>
          <style>
            @page { 
              margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm; 
            }
            body { 
              font-family: ${templateSettings.fontFamily}; 
              margin: 0; 
              padding: 32px;
              font-size: ${fontSize};
              color: #000;
              background: white;
            }
            .company-header { 
              text-align: ${templateSettings.headerAlignment}; 
              margin-bottom: 30px; 
            }
            .company-name {
              color: ${templateSettings.primaryColor};
              font-family: ${templateSettings.companyNameFontFamily || templateSettings.fontFamily};
              font-size: ${templateSettings.companyNameFontSize || templateSettings.titleSize}px;
              font-weight: ${(templateSettings.companyNameBold !== undefined ? templateSettings.companyNameBold : templateSettings.titleBold) ? 'bold' : 'normal'};
              margin-bottom: 8px;
            }
            .company-subtitle {
              color: #666;
              margin-bottom: 16px;
              font-family: ${templateSettings.companySubtitleFontFamily || templateSettings.fontFamily};
              font-size: ${templateSettings.companySubtitleFontSize || templateSettings.contentSize}px;
              font-weight: ${(templateSettings.companySubtitleBold !== undefined ? templateSettings.companySubtitleBold : templateSettings.contentBold) ? 'bold' : 'normal'};
            }
            .invoice-title {
              text-align: center;
              font-size: ${templateSettings.titleSize}px;
              font-weight: ${templateSettings.titleBold ? 'bold' : 'normal'};
              color: ${templateSettings.primaryColor};
              margin: 24px 0;
            }
            .items-table { 
              width: 100%; 
              border-collapse: collapse;
              border: 2px solid #000000;
            }
            .items-table thead tr {
              background: #f3f4f6;
              border-bottom: 2px solid #000000;
            }
            .items-table th { 
              padding: 16px;
              font-weight: bold;
              color: #374151;
              border: 1px solid #000000;
            }
            .items-table td { 
              padding: 16px;
              border: 1px solid #000000;
            }
            .items-table tbody tr:nth-child(even) { background: #f9fafb; }
            .items-table tbody tr:nth-child(odd) { background: white; }
            .product-name { font-weight: 600; color: #111827; margin-bottom: 4px; }
            .product-brand {
              font-size: ${Math.max(parseInt(templateSettings.contentSize) - 2, 10)}px;
              color: ${templateSettings.primaryColor};
              font-weight: ${templateSettings.contentBold ? 'bold' : '500'};
            }
            .product-details {
              font-size: ${Math.max(parseInt(templateSettings.contentSize) - 2, 10)}px;
              color: #666;
            }
            .detail-row { display: flex; margin-bottom: 4px; }
            .detail-label { font-weight: 500; width: 64px; flex-shrink: 0; }
            .total-value { font-weight: bold; color: ${templateSettings.primaryColor}; font-size: 18px; }
            .total-section { display: flex; justify-content: flex-end; margin-top: 32px; }
            .total-card {
              background: white; border: 1px solid #e5e7eb; border-radius: 8px;
              padding: 24px; max-width: 320px; width: 100%;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .total-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 18px; }
            .total-row.final {
              border-top: 1px solid #d1d5db; padding-top: 8px; margin-top: 8px;
              font-size: 20px; font-weight: bold;
            }
            .deposit-row { color: #dc2626 !important; font-size: 14px; }
            .shipping-row { font-size: 14px; color: #000000 !important; }
            .total-value { color: #000000 !important; }
            .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #d1d5db; text-align: center; }
            .footer-text { font-size: ${templateSettings.contentSize}px; color: #666; font-weight: ${templateSettings.contentBold ? 'bold' : '500'}; }
            .save-hint {
              text-align: center; padding: 12px; background: #fef3c7; border: 1px solid #f59e0b;
              border-radius: 8px; margin-bottom: 16px; font-size: 14px; color: #92400e;
            }
            @media print { 
              body { margin: 0; padding: 0; }
              .no-print, .save-hint { display: none !important; }
              * { 
                -webkit-print-color-adjust: exact !important;
                color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .deposit-row { color: #dc2626 !important; }
              .shipping-row { color: #000000 !important; }
              .total-value { color: #000000 !important; }
              .total-row { color: #000000 !important; }
            }
          </style>
        </head>
        <body>
          <div class="save-hint">
            Select <strong>"Save as PDF"</strong> as the destination in the print dialog to save as PDF file.
          </div>

          ${showHeader ? `
          <div class="company-header">
            <h1 class="company-name">${templateSettings.companyName}</h1>
            <p class="company-subtitle">${templateSettings.companySubtitle}</p>
            ${(templateSettings.companyAddress || templateSettings.phoneNumber || templateSettings.emailAddress) ? `
            <div style="color: #666; font-family: ${templateSettings.companyContactFontFamily || templateSettings.fontFamily}; font-size: ${templateSettings.companyContactFontSize || Math.max(10, parseInt(templateSettings.contentSize) - 2)}px; font-weight: ${(templateSettings.companyContactBold !== undefined ? templateSettings.companyContactBold : templateSettings.contentBold) ? 'bold' : 'normal'};">
              ${templateSettings.companyAddress ? `<div>${templateSettings.companyAddress}</div>` : ''}
              ${templateSettings.phoneNumber ? `<div>Phone: ${templateSettings.phoneNumber}</div>` : ''}
              ${templateSettings.emailAddress ? `<div>Email: ${templateSettings.emailAddress}</div>` : ''}
            </div>
            ` : ''}
          </div>
          ${templateSettings.invoiceTitle ? `<div class="invoice-title">${templateSettings.invoiceTitle}</div>` : ''}
          ` : ''}
          
          <div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</div>
              <div><strong>Date:</strong> ${formatDate(invoice.invoiceDate)}</div>
            </div>
            ${(invoice.customerName || invoice.carNo) ? `
            <div style="margin-top: 8px;">
              ${invoice.customerName ? `<strong>Customer:</strong> ${invoice.customerName}` : ''}
              ${invoice.customerName && invoice.carNo ? ' | ' : ''}
              ${invoice.carNo ? `<strong>Car Number:</strong> ${invoice.carNo}` : ''}
            </div>
            ` : ''}
          </div>
          
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
            <table class="items-table">
              <thead>
                <tr>
                  <th style="text-align: left;">Product</th>
                  <th style="text-align: center;">Qty</th>
                  <th style="text-align: right;">Unit Price</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map((item) => `
                  <tr>
                    <td>
                      <div class="product-name">${item.productName}</div>
                      ${templateSettings.showBrand && item.brand ? `<div class="product-brand">Brand: ${item.brand}</div>` : ''}
                    </td>
                    <td style="text-align: center; font-weight: 600;">${item.quantity}</td>
                    <td style="text-align: right; font-weight: 600;">$${parseFloat(item.price).toFixed(2)}</td>
                    <td style="text-align: right;" class="total-value">$${(item.quantity * parseFloat(item.price)).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          ${invoice.remark ? `
          <div style="margin: 24px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #f9fafb;">
            <h3 style="font-size: ${templateSettings.contentSize}px; font-weight: ${templateSettings.contentBold ? 'bold' : '600'}; margin-bottom: 8px; color: #374151;">Comments</h3>
            <p style="font-size: ${templateSettings.contentSize}px; font-weight: ${templateSettings.contentBold ? 'bold' : 'normal'}; color: #374151; margin: 0;">${invoice.remark}</p>
          </div>
          ` : ''}
          
          <div class="total-section">
            <div class="total-card">
              <div class="total-row" style="font-size: ${templateSettings.totalSize}px; font-weight: ${templateSettings.totalBold ? 'bold' : 'normal'};">
                <span>Subtotal:</span>
                <span>$${itemsSubtotal.toFixed(2)}</span>
              </div>
              ${deposit > 0 ? `
              <div class="total-row deposit-row" style="font-size: ${Math.max(parseInt(templateSettings.totalSize) - 2, 12)}px; font-weight: ${templateSettings.totalBold ? 'bold' : 'normal'}; color: #dc2626;">
                <span>Deposit (paid):</span>
                <span>-$${deposit.toFixed(2)}</span>
              </div>
              ` : ''}
              ${shipping > 0 ? `
              <div class="total-row shipping-row" style="font-size: ${Math.max(parseInt(templateSettings.totalSize) - 2, 12)}px; font-weight: ${templateSettings.totalBold ? 'bold' : 'normal'};">
                <span>Shipping:</span>
                <span>+$${shipping.toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="total-row final" style="font-size: ${Math.max(parseInt(templateSettings.totalSize), 18)}px; font-weight: bold;">
                <span>Total Amount:</span>
                <span>$${finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          ${showHeader && templateSettings.footerText ? `
          <div class="footer">
            <p class="footer-text">${templateSettings.footerText}</p>
          </div>
          ` : ''}
        </body>
      </html>
    `;

    pdfWindow.document.write(pdfHTML);
    pdfWindow.document.close();
    pdfWindow.onload = () => {
      pdfWindow.print();
    };
  };


  const formatDate = (date: string | Date | null) => {
    if (!date) return "N/A";
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "paid": return "default";
      case "pending": return "secondary";
      case "overdue": return "destructive";
      default: return "outline";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-auto" data-testid="invoice-preview-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Invoice Preview - {invoice.invoiceNumber}
          </DialogTitle>
          <DialogDescription>
            {isCreationPreview ? "Preview your invoice before creating" : "View, print, and download this invoice"}
          </DialogDescription>
        </DialogHeader>

        {/* Action Buttons - Hidden during creation preview */}
        {!isCreationPreview && (
          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              onClick={() => setShowHeader(!showHeader)}
              variant={showHeader ? "default" : "outline"}
              size="sm"
              data-testid="btn-toggle-header"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Header
            </Button>
            <Button
              onClick={handlePrint}
              variant="outline"
              size="sm"
              data-testid="btn-print-invoice"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button
              onClick={handleExportPDF}
              variant="outline"
              size="sm"
              data-testid="btn-export-pdf"
              disabled={isExportingPDF}
            >
              {isExportingPDF
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                : <><Download className="w-4 h-4 mr-2" />Export PDF</>
              }
            </Button>
          </div>
        )}

        {/* Invoice Content */}
        <div 
          ref={invoiceRef} 
          className="bg-white text-black p-8 rounded-lg border"
          data-testid="invoice-content"
          style={{ 
            fontFamily: templateSettings.fontFamily,
            fontSize: `${templateSettings.contentSize}px`
          }}
        >
          {/* Header - Company Information */}
          {showHeader && (
            <div className="mb-8">
              <div style={{ textAlign: templateSettings.headerAlignment as any }}>
                <h1 
                  className="mb-2" 
                  style={{ 
                    color: templateSettings.primaryColor,
                    fontFamily: templateSettings.companyNameFontFamily || templateSettings.fontFamily,
                    fontSize: `${templateSettings.companyNameFontSize || templateSettings.titleSize}px`,
                    fontWeight: (templateSettings.companyNameBold !== undefined ? templateSettings.companyNameBold : templateSettings.titleBold) ? 'bold' : 'normal'
                  }}
                >
                  {templateSettings.companyName}
                </h1>
                <p 
                  className="text-gray-600 mb-2"
                  style={{ 
                    fontFamily: templateSettings.companySubtitleFontFamily || templateSettings.fontFamily,
                    fontSize: `${templateSettings.companySubtitleFontSize || templateSettings.contentSize}px`,
                    fontWeight: (templateSettings.companySubtitleBold !== undefined ? templateSettings.companySubtitleBold : templateSettings.contentBold) ? 'bold' : 'normal'
                  }}
                >
                  {templateSettings.companySubtitle}
                </p>
                {(templateSettings.companyAddress || templateSettings.phoneNumber || templateSettings.emailAddress) && (
                  <div 
                    className="text-gray-600 mb-4"
                    style={{ 
                      fontFamily: templateSettings.companyContactFontFamily || templateSettings.fontFamily,
                      fontSize: `${templateSettings.companyContactFontSize || Math.max(10, parseInt(templateSettings.contentSize) - 2)}px`,
                      fontWeight: (templateSettings.companyContactBold !== undefined ? templateSettings.companyContactBold : templateSettings.contentBold) ? 'bold' : 'normal'
                    }}
                  >
                    {templateSettings.companyAddress && <div>{templateSettings.companyAddress}</div>}
                    {templateSettings.phoneNumber && <div>Phone: {templateSettings.phoneNumber}</div>}
                    {templateSettings.emailAddress && <div>Email: {templateSettings.emailAddress}</div>}
                  </div>
                )}
              </div>
              
              {templateSettings.invoiceTitle && (
                <div style={{ textAlign: "center" }} className="my-6">
                  <h2 
                    style={{ 
                      fontFamily: templateSettings.fontFamily,
                    color: templateSettings.primaryColor,
                    fontSize: `${templateSettings.titleSize}px`,
                    fontWeight: templateSettings.titleBold ? 'bold' : 'normal'
                  }}
                >
                    {templateSettings.invoiceTitle}
                  </h2>
                </div>
              )}
            </div>
          )}

          {/* Invoice Details - Simple List */}
          <div className="mb-8">
            <div className="bg-gray-50 border rounded-lg p-4 space-y-2">
              <div className="flex">
                <span className="font-medium w-24">Invoice:</span>
                <span>{invoice.invoiceNumber}</span>
              </div>
              <div className="flex">
                <span className="font-medium w-24">Date:</span>
                <span>{formatDate(invoice.invoiceDate)}</span>
              </div>
              {invoice.customerName && (
                <div className="flex">
                  <span className="font-medium w-24">Customer:</span>
                  <span>{invoice.customerName}</span>
                </div>
              )}
              {invoice.carNo && (
                <div className="flex">
                  <span className="font-medium w-24">Car No.:</span>
                  <span>{invoice.carNo}</span>
                </div>
              )}
            </div>
          </div>

          {/* Professional Items Table */}
          <div className="mb-6">
            <div className="bg-gray-50 border rounded-lg overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="text-left py-4 px-4 font-bold text-gray-700">Product</th>
                      <th className="text-center py-4 px-4 font-bold text-gray-700">Qty</th>
                      <th className="text-right py-4 px-4 font-bold text-gray-700">Unit Price</th>
                      <th className="text-right py-4 px-4 font-bold text-gray-700">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {invoice.items.map((item, index) => (
                      <tr key={item.id} className={`border-b hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                        <td className="py-4 px-4 border border-black">
                          <div className="font-semibold text-gray-900">{item.productName}</div>
                          {templateSettings.showBrand && item.brand && (
                            <div className="text-sm font-medium" style={{ color: templateSettings.primaryColor }}>Brand: {item.brand}</div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center font-semibold text-gray-900 border border-black">{item.quantity}</td>
                        <td className="py-4 px-4 text-right font-semibold text-gray-900 border border-black">${parseFloat(item.price).toFixed(2)}</td>
                        <td className="py-4 px-4 text-right font-bold text-gray-900 text-lg border border-black" style={{ color: templateSettings.primaryColor }}>
                          ${(item.quantity * parseFloat(item.price)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Comments Section - appears before subtotal */}
          {invoice.remark && (
            <div className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Comments</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700">{invoice.remark}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Total Section */}
          <div className="flex justify-end">
            <Card className="w-full max-w-sm">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between" style={{ 
                    fontSize: `${templateSettings.totalSize}px`,
                    fontWeight: templateSettings.totalBold ? 'bold' : 'normal',
                    color: '#000000'
                  }}>
                    <span>Subtotal:</span>
                    <span>${itemsSubtotal.toFixed(2)}</span>
                  </div>
                  
                  {/* Show deposit if it exists */}
                  {deposit > 0 && (
                    <div className="flex justify-between text-red-600" style={{ 
                      fontSize: `${Math.max(parseInt(templateSettings.totalSize) - 2, 12)}px`,
                      fontWeight: templateSettings.totalBold ? 'bold' : 'normal',
                      color: '#dc2626'
                    }}>
                      <span>Deposit (paid):</span>
                      <span>-${deposit.toFixed(2)}</span>
                    </div>
                  )}
                  
                  {/* Show shipping if it exists */}
                  {shipping > 0 && (
                    <div className="flex justify-between" style={{ 
                      fontSize: `${Math.max(parseInt(templateSettings.totalSize) - 2, 12)}px`,
                      fontWeight: templateSettings.totalBold ? 'bold' : 'normal',
                      color: '#000000'
                    }}>
                      <span>Shipping:</span>
                      <span>+${shipping.toFixed(2)}</span>
                    </div>
                  )}
                  
                  <Separator />
                  <div className="flex justify-between" style={{ 
                    fontSize: `${Math.max(parseInt(templateSettings.totalSize), 18)}px`,
                    fontWeight: 'bold',
                    color: '#000000'
                  }}>
                    <span>Total Amount:</span>
                    <span>${finalTotal.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Internal Notes Only - appears after total */}
          <div className="mt-6 space-y-4">
            {(effectiveSettings.showInternalNotes || forceShowNotes) && invoice.internalNotes && (
              <Card className="border-orange-200 bg-orange-50" data-internal-notes>
                <CardHeader>
                  <CardTitle 
                    className="text-orange-800 flex items-center gap-2"
                    style={{ 
                      fontSize: `${templateSettings.contentSize}px`,
                      fontWeight: templateSettings.contentBold ? 'bold' : 'normal'
                    }}
                  >
                    <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                    Internal Notes (For Internal Use Only)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p 
                    className="text-orange-700 font-medium"
                    style={{ 
                      fontSize: `${templateSettings.contentSize}px`,
                      fontWeight: templateSettings.contentBold ? 'bold' : 'normal'
                    }}
                  >
                    {invoice.internalNotes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Footer */}
          {showHeader && templateSettings.footerText && (
            <div className="mt-8 pt-6 border-t text-center">
              <p 
                className="text-gray-600 font-medium"
                style={{ 
                  fontSize: `${templateSettings.contentSize}px`,
                  fontWeight: templateSettings.contentBold ? 'bold' : 'normal'
                }}
              >
                {templateSettings.footerText}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}