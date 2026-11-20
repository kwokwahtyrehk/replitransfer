import { useState } from "react";
import { Settings, Palette, FileText, Type, AlignCenter, Layout, Eye, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface TemplateSettings {
  companyName: string;
  companySubtitle: string;
  invoiceTitle: string;
  footerText: string;
  showBrand: boolean;
  showInternalNotes: boolean;
  showCustomerInfo: boolean;
  showDeposit: boolean;
  showShipping: boolean;
  primaryColor: string;
  fontFamily: string;
  titleSize: string;
  titleBold: boolean;
  contentSize: string;
  contentBold: boolean;
  totalSize: string;
  totalBold: boolean;
  headerAlignment: string;
  bodyAlignment: string;
  marginTop: string;
  marginBottom: string;
  marginLeft: string;
  marginRight: string;
  companyAddress: string;
  phoneNumber: string;
  emailAddress: string;
  // Company Information Font Settings
  companyNameFontFamily: string;
  companyNameFontSize: string;
  companyNameBold: boolean;
  companySubtitleFontFamily: string;
  companySubtitleFontSize: string;
  companySubtitleBold: boolean;
  companyContactFontFamily: string;
  companyContactFontSize: string;
  companyContactBold: boolean;
}

interface InvoiceTemplateSettingsProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export default function InvoiceTemplateSettings({ open: controlledOpen, onOpenChange, hideTrigger = false }: InvoiceTemplateSettingsProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const dialogOpen = isControlled ? controlledOpen : isOpen;
  const setDialogOpen = (open: boolean) => {
    if (isControlled) onOpenChange?.(open);
    else setIsOpen(open);
  };
  
  // Load settings from localStorage with defaults
  const getStoredSettings = (): TemplateSettings => {
    const stored = localStorage.getItem('invoiceTemplateSettings');
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      companyName: "國華膠輪汽車用品",
      companySubtitle: "Kwok Wah Tyre & Motoring Accessories Co.",
      invoiceTitle: "",
      footerText: "Thank you for your business!",
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
    };
  };

  const [settings, setSettings] = useState<TemplateSettings>(getStoredSettings);

  const handleSave = () => {
    localStorage.setItem('invoiceTemplateSettings', JSON.stringify(settings));
    toast({
      title: "Success",
      description: "Invoice template settings saved successfully",
    });
    setDialogOpen(false);
  };

  const handleReset = () => {
    const defaultSettings: TemplateSettings = {
      companyName: "國華膠輪汽車用品",
      companySubtitle: "Kwok Wah Tyre & Motoring Accessories Co.",
      invoiceTitle: "",
      footerText: "Thank you for your business!",
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
    };
    setSettings(defaultSettings);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {!hideTrigger && !isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" data-testid="btn-template-settings">
            <Settings className="w-4 h-4 mr-2" />
            Template Settings
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-5xl" data-testid="template-settings-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Customize Invoice Template
          </DialogTitle>
          <DialogDescription>
            Customize the appearance and fields shown in your invoices
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Company Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Company Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={settings.companyName}
                    onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    placeholder="Enter company name"
                    data-testid="input-company-name"
                  />
                </div>
                <div>
                  <Label htmlFor="companySubtitle">Company Subtitle</Label>
                  <Input
                    id="companySubtitle"
                    value={settings.companySubtitle}
                    onChange={(e) => setSettings({ ...settings, companySubtitle: e.target.value })}
                    placeholder="Enter company subtitle"
                    data-testid="input-company-subtitle"
                  />
                </div>
                <div>
                  <Label htmlFor="invoiceTitle">Invoice Title (leave empty to hide)</Label>
                  <Input
                    id="invoiceTitle"
                    value={settings.invoiceTitle}
                    onChange={(e) => setSettings({ ...settings, invoiceTitle: e.target.value })}
                    placeholder="e.g., INVOICE, BILL, RECEIPT (leave empty to hide)"
                    data-testid="input-invoice-title"
                  />
                </div>
                <div>
                  <Label htmlFor="footerText">Footer Text (leave empty to hide)</Label>
                  <Input
                    id="footerText"
                    value={settings.footerText}
                    onChange={(e) => setSettings({ ...settings, footerText: e.target.value })}
                    placeholder="e.g., Thank you for your business!"
                    data-testid="input-footer-text"
                  />
                </div>
                <div>
                  <Label htmlFor="companyAddress">Address</Label>
                  <Input
                    id="companyAddress"
                    value={settings.companyAddress}
                    onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                    placeholder="Enter company address"
                    data-testid="input-company-address"
                  />
                </div>
                <div>
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    value={settings.phoneNumber}
                    onChange={(e) => setSettings({ ...settings, phoneNumber: e.target.value })}
                    placeholder="Enter phone number"
                    data-testid="input-phone-number"
                  />
                </div>
                <div>
                  <Label htmlFor="emailAddress">Email Address</Label>
                  <Input
                    id="emailAddress"
                    type="email"
                    value={settings.emailAddress}
                    onChange={(e) => setSettings({ ...settings, emailAddress: e.target.value })}
                    placeholder="Enter email address"
                    data-testid="input-email-address"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Typography & Fonts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Typography & Fonts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <Input
                    id="primaryColor"
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                    className="w-20 h-10"
                    data-testid="input-primary-color"
                  />
                </div>
                <div>
                  <Label htmlFor="fontFamily">Font Family</Label>
                  <Select
                    value={settings.fontFamily}
                    onValueChange={(value) => setSettings({ ...settings, fontFamily: value })}
                  >
                    <SelectTrigger data-testid="select-font-family">
                      <SelectValue placeholder="Select font family" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                      <SelectItem value="Times, serif">Times New Roman</SelectItem>
                      <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                      <SelectItem value="Georgia, serif">Georgia</SelectItem>
                      <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
                      <SelectItem value="Courier New, monospace">Courier New</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Font Sizes & Styles</Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="titleSize" className="text-xs">Headings</Label>
                      <Input
                        id="titleSize"
                        type="number"
                        value={settings.titleSize}
                        onChange={(e) => setSettings({ ...settings, titleSize: e.target.value })}
                        placeholder="24"
                        min="12"
                        max="48"
                        data-testid="input-title-size"
                      />
                    </div>
                    <div>
                      <Label htmlFor="contentSize" className="text-xs">Body Text</Label>
                      <Input
                        id="contentSize"
                        type="number"
                        value={settings.contentSize}
                        onChange={(e) => setSettings({ ...settings, contentSize: e.target.value })}
                        placeholder="14"
                        min="10"
                        max="20"
                        data-testid="input-content-size"
                      />
                    </div>
                    <div>
                      <Label htmlFor="totalSize" className="text-xs">Totals</Label>
                      <Input
                        id="totalSize"
                        type="number"
                        value={settings.totalSize}
                        onChange={(e) => setSettings({ ...settings, totalSize: e.target.value })}
                        placeholder="18"
                        min="12"
                        max="24"
                        data-testid="input-total-size"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="titleBold"
                        checked={settings.titleBold}
                        onCheckedChange={(checked) => 
                          setSettings({ ...settings, titleBold: Boolean(checked) })
                        }
                        data-testid="checkbox-title-bold"
                      />
                      <Label htmlFor="titleBold" className="text-xs">Bold Headings</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="contentBold"
                        checked={settings.contentBold}
                        onCheckedChange={(checked) => 
                          setSettings({ ...settings, contentBold: Boolean(checked) })
                        }
                        data-testid="checkbox-content-bold"
                      />
                      <Label htmlFor="contentBold" className="text-xs">Bold Body</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="totalBold"
                        checked={settings.totalBold}
                        onCheckedChange={(checked) => 
                          setSettings({ ...settings, totalBold: Boolean(checked) })
                        }
                        data-testid="checkbox-total-bold"
                      />
                      <Label htmlFor="totalBold" className="text-xs">Bold Totals</Label>
                    </div>
                  </div>
                </div>
                
                {/* Company Information Font Settings */}
                <Separator />
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Company Information Fonts</Label>
                  
                  {/* Company Name */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Company Name</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Select
                        value={settings.companyNameFontFamily}
                        onValueChange={(value) => setSettings({ ...settings, companyNameFontFamily: value })}
                      >
                        <SelectTrigger data-testid="select-company-name-font">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                          <SelectItem value="Times, serif">Times New Roman</SelectItem>
                          <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                          <SelectItem value="Georgia, serif">Georgia</SelectItem>
                          <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
                          <SelectItem value="Courier New, monospace">Courier New</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={settings.companyNameFontSize}
                        onChange={(e) => setSettings({ ...settings, companyNameFontSize: e.target.value })}
                        placeholder="24"
                        min="12"
                        max="48"
                        data-testid="input-company-name-size"
                      />
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="companyNameBold"
                          checked={settings.companyNameBold}
                          onCheckedChange={(checked) => 
                            setSettings({ ...settings, companyNameBold: Boolean(checked) })
                          }
                          data-testid="checkbox-company-name-bold"
                        />
                        <Label htmlFor="companyNameBold" className="text-xs">Bold</Label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Company Subtitle */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Company Subtitle</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Select
                        value={settings.companySubtitleFontFamily}
                        onValueChange={(value) => setSettings({ ...settings, companySubtitleFontFamily: value })}
                      >
                        <SelectTrigger data-testid="select-company-subtitle-font">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                          <SelectItem value="Times, serif">Times New Roman</SelectItem>
                          <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                          <SelectItem value="Georgia, serif">Georgia</SelectItem>
                          <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
                          <SelectItem value="Courier New, monospace">Courier New</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={settings.companySubtitleFontSize}
                        onChange={(e) => setSettings({ ...settings, companySubtitleFontSize: e.target.value })}
                        placeholder="14"
                        min="10"
                        max="24"
                        data-testid="input-company-subtitle-size"
                      />
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="companySubtitleBold"
                          checked={settings.companySubtitleBold}
                          onCheckedChange={(checked) => 
                            setSettings({ ...settings, companySubtitleBold: Boolean(checked) })
                          }
                          data-testid="checkbox-company-subtitle-bold"
                        />
                        <Label htmlFor="companySubtitleBold" className="text-xs">Bold</Label>
                      </div>
                    </div>
                  </div>
                  
                  {/* Company Contact Info */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Contact Info (Phone & Email)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Select
                        value={settings.companyContactFontFamily}
                        onValueChange={(value) => setSettings({ ...settings, companyContactFontFamily: value })}
                      >
                        <SelectTrigger data-testid="select-company-contact-font">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                          <SelectItem value="Times, serif">Times New Roman</SelectItem>
                          <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                          <SelectItem value="Georgia, serif">Georgia</SelectItem>
                          <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
                          <SelectItem value="Courier New, monospace">Courier New</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={settings.companyContactFontSize}
                        onChange={(e) => setSettings({ ...settings, companyContactFontSize: e.target.value })}
                        placeholder="12"
                        min="8"
                        max="18"
                        data-testid="input-company-contact-size"
                      />
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="companyContactBold"
                          checked={settings.companyContactBold}
                          onCheckedChange={(checked) => 
                            setSettings({ ...settings, companyContactBold: Boolean(checked) })
                          }
                          data-testid="checkbox-company-contact-bold"
                        />
                        <Label htmlFor="companyContactBold" className="text-xs">Bold</Label>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Layout & Alignment */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlignCenter className="w-4 h-4" />
                  Layout & Alignment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="headerAlignment">Header Alignment</Label>
                  <Select
                    value={settings.headerAlignment}
                    onValueChange={(value) => setSettings({ ...settings, headerAlignment: value })}
                  >
                    <SelectTrigger data-testid="select-header-alignment">
                      <SelectValue placeholder="Select header alignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bodyAlignment">Body Alignment</Label>
                  <Select
                    value={settings.bodyAlignment}
                    onValueChange={(value) => setSettings({ ...settings, bodyAlignment: value })}
                  >
                    <SelectTrigger data-testid="select-body-alignment">
                      <SelectValue placeholder="Select body alignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="center">Center</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Page Setup */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layout className="w-4 h-4" />
                  Page Setup (mm)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="marginTop">Top</Label>
                    <Input
                      id="marginTop"
                      type="number"
                      value={settings.marginTop}
                      onChange={(e) => setSettings({ ...settings, marginTop: e.target.value })}
                      placeholder="20"
                      min="0"
                      max="50"
                      data-testid="input-margin-top"
                    />
                  </div>
                  <div>
                    <Label htmlFor="marginBottom">Bottom</Label>
                    <Input
                      id="marginBottom"
                      type="number"
                      value={settings.marginBottom}
                      onChange={(e) => setSettings({ ...settings, marginBottom: e.target.value })}
                      placeholder="20"
                      min="0"
                      max="50"
                      data-testid="input-margin-bottom"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="marginLeft">Left</Label>
                    <Input
                      id="marginLeft"
                      type="number"
                      value={settings.marginLeft}
                      onChange={(e) => setSettings({ ...settings, marginLeft: e.target.value })}
                      placeholder="20"
                      min="0"
                      max="50"
                      data-testid="input-margin-left"
                    />
                  </div>
                  <div>
                    <Label htmlFor="marginRight">Right</Label>
                    <Input
                      id="marginRight"
                      type="number"
                      value={settings.marginRight}
                      onChange={(e) => setSettings({ ...settings, marginRight: e.target.value })}
                      placeholder="20"
                      min="0"
                      max="50"
                      data-testid="input-margin-right"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Display Options */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Display Options
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showCustomerInfo"
                      checked={settings.showCustomerInfo}
                      onCheckedChange={(checked) => 
                        setSettings({ ...settings, showCustomerInfo: Boolean(checked) })
                      }
                      data-testid="checkbox-show-customer-info"
                    />
                    <Label htmlFor="showCustomerInfo" className="text-sm">Customer Information</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showBrand"
                      checked={settings.showBrand}
                      onCheckedChange={(checked) => 
                        setSettings({ ...settings, showBrand: Boolean(checked) })
                      }
                      data-testid="checkbox-show-brand"
                    />
                    <Label htmlFor="showBrand" className="text-sm">Product Brand</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showInternalNotes"
                      checked={settings.showInternalNotes}
                      onCheckedChange={(checked) => 
                        setSettings({ ...settings, showInternalNotes: Boolean(checked) })
                      }
                      data-testid="checkbox-show-internal-notes"
                    />
                    <Label htmlFor="showInternalNotes" className="text-sm">Internal Notes</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showDeposit"
                      checked={settings.showDeposit}
                      onCheckedChange={(checked) => 
                        setSettings({ ...settings, showDeposit: Boolean(checked) })
                      }
                      data-testid="checkbox-show-deposit"
                    />
                    <Label htmlFor="showDeposit" className="text-sm">Deposit Field</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showShipping"
                      checked={settings.showShipping}
                      onCheckedChange={(checked) => 
                        setSettings({ ...settings, showShipping: Boolean(checked) })
                      }
                      data-testid="checkbox-show-shipping"
                    />
                    <Label htmlFor="showShipping" className="text-sm">Shipping Field</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          <Card className="bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                className="p-4 bg-white border rounded-lg space-y-3"
                style={{ 
                  fontFamily: settings.fontFamily,
                  fontSize: `${settings.contentSize}px`
                }}
              >
                <div style={{ textAlign: settings.headerAlignment as any }}>
                  <h3 style={{ 
                    color: settings.primaryColor,
                    fontFamily: settings.companyNameFontFamily,
                    fontSize: `${settings.companyNameFontSize}px`,
                    fontWeight: settings.companyNameBold ? 'bold' : 'normal',
                    margin: '0 0 8px 0'
                  }}>
                    {settings.companyName}
                  </h3>
                  <p style={{ 
                    color: '#666',
                    fontFamily: settings.companySubtitleFontFamily,
                    fontSize: `${settings.companySubtitleFontSize}px`,
                    fontWeight: settings.companySubtitleBold ? 'bold' : 'normal',
                    margin: '0 0 8px 0'
                  }}>
                    {settings.companySubtitle}
                  </p>
                  {(settings.phoneNumber || settings.emailAddress) && (
                    <div style={{ 
                      color: '#666',
                      fontFamily: settings.companyContactFontFamily,
                      fontSize: `${settings.companyContactFontSize}px`,
                      fontWeight: settings.companyContactBold ? 'bold' : 'normal'
                    }}>
                      {settings.phoneNumber && <div>Phone: {settings.phoneNumber}</div>}
                      {settings.emailAddress && <div>Email: {settings.emailAddress}</div>}
                    </div>
                  )}
                </div>
                
                <div style={{ textAlign: "center" }} className="my-4">
                  <h2 style={{ 
                    fontSize: `${settings.titleSize}px`,
                    fontWeight: settings.titleBold ? 'bold' : 'normal',
                    color: settings.primaryColor,
                    margin: '16px 0'
                  }}>
                    INVOICE
                  </h2>
                </div>
                <Separator />
                <div style={{ 
                  textAlign: settings.bodyAlignment as any,
                  fontSize: `${settings.contentSize}px`,
                  fontWeight: settings.contentBold ? 'bold' : 'normal'
                }}>
                  <div style={{ marginBottom: '4px' }}>Invoice #: KW2508-00001</div>
                  <div style={{ marginBottom: '4px' }}>Date: {new Date().toLocaleDateString()}</div>
                  {settings.showCustomerInfo && <div style={{ marginBottom: '4px' }}>Customer: Sample Customer</div>}
                  {settings.showBrand && <div style={{ marginBottom: '4px' }}>Product: Sample Tire - Brand: Michelin</div>}
                  {settings.showDeposit && <div style={{ marginBottom: '4px' }}>Deposit: $50.00</div>}
                  {settings.showShipping && <div style={{ marginBottom: '4px' }}>Shipping: $25.00</div>}
                  <div style={{ marginBottom: '4px' }}>Total: $275.00</div>
                  {settings.showInternalNotes && (
                    <div style={{ 
                      color: '#ea580c',
                      fontSize: `${Math.max(10, parseInt(settings.contentSize) - 1)}px`,
                      fontWeight: settings.contentBold ? 'bold' : 'normal'
                    }}>
                      Internal Notes: For staff use only
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={handleReset} data-testid="btn-reset-settings">
            Reset to Default
          </Button>
          <div className="space-x-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-settings">
              Cancel
            </Button>
            <Button onClick={handleSave} data-testid="btn-save-settings">
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}