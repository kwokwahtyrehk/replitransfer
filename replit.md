# Overview

TyrePro is a modern full-stack business management application designed for tire shop operations. It provides comprehensive inventory management, invoice generation, and business analytics capabilities. The application features a React frontend with TypeScript, an Express.js backend, and PostgreSQL database integration through Drizzle ORM.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for development tooling
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Management**: React Hook Form with Zod validation

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with structured error handling
- **Validation**: Zod schemas for request/response validation
- **Database Layer**: Drizzle ORM with PostgreSQL dialect
- **Development**: Hot module replacement with Vite middleware integration

## Data Storage
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle migrations in `/migrations` directory
- **Development Storage**: In-memory storage implementation for testing

## Core Data Models
- **Inventory Items**: Product management with name, size, quantity, and remarks
- **Invoices**: Customer billing with auto-generated invoice numbers
- **Invoice Items**: Line items linking invoices to inventory products
- **Relationships**: Foreign key constraints with cascade deletion

## Authentication & Authorization
- Session-based authentication with bcrypt password hashing
- Default credentials: username=`kwokwahtyre`, password=`96549101`
- Password change functionality with email confirmation via SendGrid
- 30-day "Remember Me" option extends session duration

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Connection**: Environment-based DATABASE_URL configuration

## UI Component Libraries
- **Radix UI**: Accessible component primitives for complex UI elements
- **Lucide React**: Icon library for consistent iconography
- **Embla Carousel**: Touch-friendly carousel components

## Development Tools
- **Vite**: Build tool with HMR and plugin ecosystem
- **ESBuild**: Fast TypeScript compilation for production builds
- **Replit Integration**: Development environment optimizations

## Utility Libraries
- **date-fns**: Date manipulation and formatting
- **clsx & tailwind-merge**: Conditional CSS class composition
- **nanoid**: Unique ID generation for entities

## Form & Validation
- **React Hook Form**: Performance-optimized form handling
- **Zod**: Runtime type validation and schema generation
- **@hookform/resolvers**: Integration bridge for validation libraries

# Invoice Template Configuration

## Default Company Settings
The application uses these default values for invoice templates:
- **Company Name**: 國華膠輪汽車用品
- **Company Subtitle**: Kwok Wah Tyre & Motoring Accessories Co.
- **Address**: G/F, 290 Sai Yeung Choi Street North, Kowloon
- **Phone**: 23804092
- **Email**: kwokwahtyre@biznetvigator.com
- **Primary Color**: #000000 (Black)
- **Font Family**: Arial, sans-serif
- **Title Size**: 24px
- **Content Size**: 14px

## Invoice Numbering System
- **Format**: KW[YYMM]-[5-digit sequence number]
- **Example**: KW2509-39742
- **Behavior**: Sequential numbering continues across months
- **Date Change**: Auto-updates month prefix while preserving sequence number

# Recent Changes

## Supply Page (April 20, 2026)
Added a new "Supply" tab to the menu bar for managing tyre supply information, with two sub-tabs:

### Supply Items Tab
- **Search Bar**: Search by tyre size (primary), brand, or pattern — live filtering as you type
- **List View**: Table showing brand, pattern, size, EV compatibility (color-coded badge), and linked supplier companies
- **Add / Edit / Delete**: Full CRUD with a modal form (brand, pattern, size, EV compatibility dropdown, multi-select suppliers)
- **EV Compatibility**: Dropdown with Yes / No / Partial options; Yes = green badge, No = grey, Partial = blue
- **Supplier Multi-Select**: Inline checkbox list inside the form to link one or many suppliers from the directory
- **Database Table**: `supply_items` table with fields: brand, pattern, size, ev_compatibility, supplier_contact_name, supplier_contact_phone
- **Join Table**: `supply_item_suppliers` links supply items to supplier directory entries
- **Navigation**: "Supply" tab added after Statistics in the top menu bar (Truck icon)
- **API Endpoints**: GET/POST `/api/supply`, PUT/DELETE `/api/supply/:id` (all auth-protected)

### Supplier Directory Tab
- **Directory Table**: Lists all suppliers with company name, 3 contact persons, and phone number
- **Add / Edit / Delete**: Full CRUD with a modal (company name, contact person 1/2/3, phone number)
- **Database Table**: `supplier_directory` with fields: company_name, contact_person_1, contact_person_2, contact_person_3, phone_number
- **API Endpoints**: GET/POST `/api/supplier-directory`, PUT/DELETE `/api/supplier-directory/:id` (all auth-protected)

## Statistics Page (January 5, 2026)
Added comprehensive sales analytics and product tracking:

### Statistics Features
- **Navigation**: New "Statistics" tab added after Reports in main navigation
- **Time Range Filter**: Dropdown to filter by All Time, This Month, This Quarter, This Year
- **Summary Cards**: Products Sold, Total Customers, Total Revenue, Average Order Value

### Charts & Visualizations
- **Monthly Sales Trend**: Line chart showing last 12 months of revenue (recharts)
- **Sales by Category**: Pie chart breaking down Tyres vs Wheels vs Others
- **Top 10 Best Sellers**: Horizontal bar chart showing products by quantity sold

### Data Tables
- **Product Sales Frequency**: Tracks each product's sales performance
  - Product name, brand, category
  - Times sold (invoice appearances)
  - Total quantity sold
  - Total revenue generated
- **Top Customers**: Customer spending leaderboard
  - Customer name, order count, total spent, average order value

### API Endpoint
- **GET /api/statistics?timeRange=all|month|quarter|year**
- Returns: productSales, topCustomers, categoryBreakdown, monthlySales, summary
- Aggregates data from invoice_items table with proper joins

## Backup/Restore Fixes (November 19, 2025)
Fixed critical bugs in backup and restore functionality for both inventory and invoices:

### Invoice Backup Button Fix
- **Bug**: The "Back up" button was calling `handleBackup` which exports CSV format
- **Fix**: Changed button to call `handleBackupJSON` which exports proper JSON format
- **Impact**: Invoice backups now download as JSON files that can be properly restored
- **Button Label**: Changed from "Back up" to "Backup (JSON)" for clarity
- **File Format**: Downloads as `invoices-backup-YYYY-MM-DD.json` with structure:
  ```json
  {
    "exportDate": "ISO timestamp",
    "invoices": [/* array of invoices with items */]
  }
  ```
- **All Fields Preserved**: Backup/restore now verified to preserve all invoice columns:
  - Customer Name (customer_name)
  - Car Number (car_no)
  - Comment (remark)
  - Internal Use (internal_notes)
  - All invoice items and metadata

### Large Backup File Support
- **Bug**: Restore failed with HTTP 413 "Request Entity Too Large" for backups with 385+ invoices
- **Fix**: Increased Express body-parser limit from 100kb to 50MB
- **Location**: server/index.ts line 11-12
- **Impact**: Large backup files (thousands of invoices) now restore successfully

### Inventory Bulk Update Fix  
- **Bug**: `bulkUpdateInventory` in MemStorage was hardcoding `costPrice` and `sellingPrice` to `null`
- **Fix**: Updated to read actual price values from CSV import data
- **Implementation**: Now properly extracts and converts price fields from imported data
- **Impact**: Cost Price and Selling Price are now preserved during CSV export/import cycles

### Storage Implementation
- **Confirmed**: Application uses `DatabaseStorage` (PostgreSQL) for all data persistence
- **Tables**: inventory_items, invoices, invoice_items, users all exist in database
- **Data Persistence**: All inventory and invoice data is stored in PostgreSQL, not in-memory

## Revenue Calculation & Negative Prices (November 17, 2025)
Fixed revenue reporting and enabled negative product prices:

### Revenue Calculation Updates
- **Deposit Invoice Exclusion**: Invoices with deposits (deposit > 0) are now excluded from revenue calculations
- **Rationale**: Deposits indicate partial/non-final invoices and should not count toward total revenue
- **Impact Areas**:
  - Dashboard "Monthly Sales" metric
  - Reports page "Total Revenue" analytics
  - Detailed reports and daily summaries
- **Implementation**: Filters out invoices where `deposit > 0` before summing revenue

### Negative Price Support
- **Product Prices**: Now allow negative amounts for discounts, credits, or adjustments
- **Validation**: Removed minimum price constraint (previously 0.01)
- **Affected Forms**: Both Create Invoice and Edit Invoice modals
- **Use Cases**: Discounts, refunds, credits, price adjustments

## Backup and Restore System (October 12, 2025)
Implemented comprehensive backup and restore functionality with automated weekly email backups:

### Restore Functionality
- **Restore Button**: Added next to the Backup button in Invoice Management page
- **File Upload**: Accepts JSON backup files for data recovery
- **Smart Restore**: Only restores invoices that don't already exist (prevents duplicates)
- **Complete Restoration**: Restores invoices with all associated items and metadata
- **Confirmation Dialog**: Requires user confirmation before restoring data

### Automated Email Backup System
- **Schedule**: Every Saturday at 11:59 PM Hong Kong Time (UTC+8)
- **Email Recipient**: hbcheung8z@yahoo.com
- **Sender**: kwokwahtyre@biznetvigator.com
- **Attachment Format**: JSON file (`invoices-backup-YYYY-MM-DD.json`)
- **Email Content**: Includes backup date, invoice count, and restoration instructions
- **Technology**: Uses SendGrid API with node-cron scheduler
- **Timezone**: Runs in Asia/Hong_Kong timezone for accurate scheduling

### Backup Formats
- **CSV Export**: Original format for reporting and analysis (handleBackup function)
- **JSON Export**: New format optimized for data restoration (handleBackupJSON function)
- Both formats include complete invoice and item data

## Unpaid Invoice Follow-up System (October 11, 2025)
Implemented comprehensive follow-up tracking system for unpaid invoices:

### Database Changes
- Added `followUpRequired` integer field (0=paid, 1=needs follow-up) to invoices table
- Added `paymentReceivedDate` text field for recording payment dates (YYYY-MM-DD format)
- Auto-clears payment date when marking for follow-up
- Auto-records current date when marking as paid

### Backend API
- GET `/api/invoices/follow-up` - Retrieve all invoices requiring follow-up
- PUT `/api/invoices/:id/follow-up` - Toggle follow-up status for single invoice
- PUT `/api/invoices/batch/follow-up` - Batch update multiple invoices
- Route ordering: specific routes before parameterized routes to avoid conflicts

### Frontend Features
**Invoices Page:**
- **Payment Status Indicators:**
  - Orange "Follow-up" badge displayed next to invoice numbers for unpaid invoices
  - Green dollar sign icon displayed next to invoice numbers for paid invoices
  - Tooltip on dollar sign shows payment date on hover (format: "Paid on MMM d, yyyy")
- **Action Buttons:**
  - Bell/BellOff toggle button in actions column:
    - Orange Bell icon = mark for follow-up (when paid)
    - Green BellOff icon = mark as paid (when needs follow-up)
  - Batch operations:
    - "Mark for Follow-up" button (appears when invoices selected)
    - "Mark as Paid" button (appears when invoices selected)
- Type-safe number coercion for followUpRequired field

**Dashboard:**
- "Follow-up Required" section (appears only when follow-up invoices exist)
- Orange-themed card showing invoice number, customer, amount, and date
- "Mark as Paid" button for each follow-up invoice
- Real-time updates when invoices are marked as paid

### Payment Date Logic
- Marking for follow-up: `paymentReceivedDate` set to null
- Marking as paid: `paymentReceivedDate` set to current date (YYYY-MM-DD)
- Explicit date values sent from frontend to backend
- Backend auto-handles undefined paymentReceivedDate with fallback logic

## Template Color Updates
- Changed all default colors from blue (#2563eb) to black (#000000)
- Fixed hardcoded blue colors in invoice preview:
  - Product brand display
  - Total column values
  - Line item totals
- All colors now respect the `primaryColor` template setting

## Mobile Responsiveness (April 25, 2026)
All pages are now fully mobile-responsive using consistent Tailwind breakpoint patterns:
- **Pattern**: `p-3 sm:p-6` padding, `text-lg sm:text-2xl` headings, `flex-col sm:flex-row` stacking layouts
- **Header nav**: Horizontal scroll with compact items, title compressed, subtitle hidden on mobile
- **Dashboard**: 2-column stat card grid on mobile, compact hero section
- **Invoices / Inventory**: Wrapped button bars (`flex-wrap gap-2`), subtitle hidden on mobile
- **Statistics**: Header stacks vertically, time-range select goes full-width, table wrappers have `overflow-x-auto`
- **Reports**: Outer padding reduced, subtitle hidden, Quick Stats grid stacks to 1-col, summary grids responsive, all report/statement tables wrapped with `overflow-x-auto`, detailed report header stacks on mobile
- **Supply**: Already responsive

## Testing Credentials
- Username: `kwokwahtyre`
- Password: `96549101`