# TyrePro Statistics Page Design Guidelines

## Design Approach
**Design System**: Material Design for data-heavy applications with clean, professional execution. Drawing inspiration from modern analytics platforms like Linear's dashboard clarity and Stripe's data presentation.

## Layout Architecture

**Spacing System**: Use Tailwind units of 4, 6, 8, and 12 for consistent rhythm (p-4, gap-6, mb-8, py-12)

**Page Structure**:
1. Top Navigation Bar (existing pattern - maintain consistency)
2. Page Header with title "Statistics" and date range selector
3. KPI Metrics Row (4 cards spanning full width)
4. Primary Charts Section (2-column grid on desktop, stacked mobile)
5. Data Tables Section (full-width analytical tables)
6. Secondary Metrics Grid (3-column layout with smaller charts)

**Container Strategy**:
- Main content area: max-w-7xl mx-auto px-6
- Grid layouts: gap-6 for cards, gap-8 for major sections
- Vertical section spacing: mb-8 between major sections

## Typography Hierarchy

**Fonts**: Inter (primary), JetBrains Mono (numbers/data)
- Page Title: text-2xl font-semibold
- Section Headers: text-lg font-medium
- Card Titles: text-sm font-medium uppercase tracking-wide
- Metrics/Numbers: text-3xl font-bold (use JetBrains Mono)
- Supporting Text: text-sm
- Table Headers: text-xs font-medium uppercase

## Component Library

**Metrics Cards**:
- White background, subtle shadow (shadow-sm)
- Rounded corners (rounded-lg)
- Padding: p-6
- Layout: Icon top-left, label below, large number prominent, percentage change with color indicator
- Include small sparkline chart for trend visualization

**Chart Containers**:
- White background cards with shadow-sm
- Header with title and time period selector dropdown
- Chart area with proper padding (p-6 for card, p-4 for chart area)
- Legend positioned top-right or bottom
- Gridlines subtle, axes labeled clearly

**Data Tables**:
- Zebra striping for rows (alternate row backgrounds)
- Sticky headers on scroll
- Sortable column headers with arrow indicators
- Right-align numerical columns
- Compact row height (py-3) for density
- Hover state on rows for interactivity

**Chart Types to Include**:
- Line charts: Sales trends over time, inventory levels
- Bar charts: Top-selling tire brands, monthly revenue comparison
- Donut chart: Sales distribution by category
- Area chart: Profit margins over quarters

## Navigation Integration
Maintain existing top navigation bar with "Statistics" tab showing blue accent indicator. Ensure visual consistency with Dashboard, Inventory, Invoices, and Reports tabs.

## Data Visualization Principles
- Clear axis labels and legends
- Tooltips on hover showing exact values
- Consistent color coding across charts
- Grid backgrounds for easier reading
- Responsive chart sizing (min-height to prevent squishing on mobile)

## Responsive Behavior
- Desktop (lg): 4-column metrics, 2-column charts, 3-column secondary grid
- Tablet (md): 2-column metrics, single-column charts, 2-column secondary grid
- Mobile: All elements stack to single column, tables scroll horizontally

## Specific Page Sections

**KPI Metrics Row** (4 cards):
- Total Revenue (with % change vs previous period)
- Total Sales (number of invoices)
- Inventory Value (current stock worth)
- Top Product (best-selling tire model)

**Primary Charts** (2-column):
- Left: Revenue trend line chart (6-month view)
- Right: Sales by category donut chart

**Data Tables**:
- Top 10 Best-Selling Products table
- Recent high-value transactions table

**Secondary Metrics** (3-column):
- Inventory turnover bar chart
- Monthly profit margin area chart
- Customer retention metric card

No hero images needed - this is a data-focused dashboard page prioritizing information density and analytical clarity.