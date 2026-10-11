/**
 * The platform, described: its modules and its processes, as the
 * documentation page and the workflow page present them. Pure data with no
 * imports, so server components can read it.
 *
 * This is DESCRIPTION, not behaviour. Nothing here is consulted to allow,
 * total or decide anything; the API does that. When a screen or a rule
 * changes, change its sentence here.
 */

export type GuideSide = "staff" | "portal" | "both";

export interface GuideModule {
  id: string;
  name: string;
  /** The module switch a branch needs for it, where it has one. */
  moduleKey?: "repair_pms" | "detailing" | "equipment" | "crm";
  side: GuideSide;
  summary: string;
  screens: { label: string; href: string; what: string }[];
  /** Things worth knowing before using it. */
  notes: string[];
}

export interface GuideProcess {
  id: string;
  title: string;
  /** One line, for the workflow page. */
  summary: string;
  moduleId: string;
  steps: { title: string; detail: string; who: string }[];
}

export const GUIDE_MODULES: GuideModule[] = [
  {
    id: "fleet",
    name: "Fleet and preventive maintenance",
    moduleKey: "repair_pms",
    side: "both",
    summary:
      "Every vehicle with its odometer readings, its maintenance schedule and its papers. The schedule says what is due, by distance or by time, whichever comes first, and raises an alert before it is late.",
    screens: [
      { label: "Dashboard", href: "/dashboard", what: "A fleet client's morning view: health, what is due, what is waiting on approval." },
      { label: "Vehicles", href: "/vehicles", what: "Each vehicle's record, readings, schedule, jobs and documents." },
      { label: "Schedule", href: "/schedule", what: "What falls due and when, across the fleet." },
      { label: "Documents", href: "/documents", what: "Registration, insurance and other papers, with expiry warnings." },
      { label: "Reports", href: "/reports", what: "Cost, downtime and compliance over time." },
    ],
    notes: [
      "A reading that looks wrong (lower than the last, or an impossible jump) is not refused: you are asked to confirm it.",
      "Alerts are worked out each time you look. One disappears when its cause does; nobody has to clear it.",
      "Closing a job that did a scheduled service restarts that service's interval.",
    ],
  },
  {
    id: "repair",
    name: "Repair shop and work orders",
    moduleKey: "repair_pms",
    side: "both",
    summary:
      "The service centre's floor: checking vehicles in, quoting, getting the customer's approval line by line, scheduling a bay and a technician, closing the job and handing the vehicle back.",
    screens: [
      { label: "Shop today", href: "/shop", what: "What is on the floor now, across every customer." },
      { label: "Job queue", href: "/shop/queue", what: "Jobs by stage, from waiting on approval to ready for collection." },
      { label: "Check in / out", href: "/shop/check-in", what: "The counter: look a vehicle up, register a walk-in, hand a vehicle back." },
      { label: "Work orders", href: "/work-orders", what: "Every job with its lines, approvals, parts and history." },
      { label: "Clients, Technicians, Vendors", href: "/shop/clients", what: "The shop's customers, its people and bays, and who it buys from." },
    ],
    notes: [
      "A work order gets its number when it is sent for approval, not when it is drafted.",
      "Lines under a customer's auto-approve limit approve themselves; the rest wait for the customer's approver.",
      "A bay, a time and a technician can be set only once the work is approved.",
      "Closing a job is a technician's action. Handing the vehicle back settles nothing: billing is separate.",
    ],
  },
  {
    id: "procurement",
    name: "Fleet parts and purchasing",
    side: "portal",
    summary: "For a fleet that keeps its own spares: approvals waiting on you, a forecast of the parts coming maintenance will need, and purchase orders to buy them.",
    screens: [
      { label: "Requests", href: "/requests", what: "Quoted work waiting for your approval, with how long it has waited." },
      { label: "Demand forecast", href: "/demand-forecast", what: "Parts the next months of scheduled maintenance will use." },
      { label: "Purchase orders", href: "/purchase-orders", what: "Orders raised for those parts, held to the issuer's approval limit." },
    ],
    notes: ["An order over your approval limit cannot be issued by you; someone with a higher limit issues it."],
  },
  {
    id: "stock",
    name: "Stock room",
    side: "staff",
    summary: "The shop's own inventory, per branch: what is on the shelf, what it cost, and every movement in or out. Stock changes only through a document; there is no “edit quantity”.",
    screens: [
      { label: "Items", href: "/shop/inventory", what: "The catalogue: parts, consumables, ingredients, with price and reorder point." },
      { label: "Stock on hand", href: "/shop/inventory/stock", what: "Quantity, average cost and value per branch; low and negative flagged." },
      { label: "Item movements", href: "/shop/inventory/movements", what: "The ledger of every move, each linked to the document behind it." },
      { label: "Receive PO", href: "/shop/inventory/purchasing", what: "Purchase orders to vendors, and receiving goods against them." },
      { label: "Stock count", href: "/shop/inventory/counts", what: "Count the shelf; posting the count books the differences." },
      { label: "Transfers", href: "/shop/inventory/transfers", what: "Move stock between branches." },
      { label: "Reorder", href: "/shop/inventory/reorder", what: "What to buy, from reorder points and recent use." },
    ],
    notes: [
      "Stock is valued at a moving average cost.",
      "Each branch decides whether stock may go negative. Where it may not, a move that would is refused and nothing of it is kept.",
      "Parts leave stock when a repair job closes, when a detailing job completes, and when a tool's service entry takes them.",
    ],
  },
  {
    id: "billing",
    name: "Billing and receivables",
    side: "both",
    summary: "From a closed job to money in: invoices with their VAT breakdown, payments by any method, what each customer owes and how late. A fleet client sees its own invoices and statement.",
    screens: [
      { label: "Billing queue", href: "/shop/billing", what: "Closed jobs that no invoice carries yet, oldest first." },
      { label: "Invoices", href: "/invoices", what: "Drafts, issued, part-paid and paid; PDF and acknowledgment receipt." },
      { label: "Receivables", href: "/shop/receivables", what: "Who owes what, by age; invoiced against received." },
    ],
    notes: [
      "An issued invoice and a recorded payment are never edited. A mistake is voided; the number stays used.",
      "A payment is spread over the oldest invoices first unless you say otherwise. What is left over is the customer's credit.",
      "Raising work for a customer over their credit limit is allowed, with a warning.",
      "The platform makes no claim of tax-authority accreditation.",
    ],
  },
  {
    id: "books",
    name: "The books",
    side: "staff",
    summary: "A double-entry general ledger that writes itself: every invoice, payment and stock movement posts its own balanced entry at the moment it happens. Nobody keys a journal by hand.",
    screens: [
      { label: "Chart of accounts", href: "/shop/books", what: "The accounts and their balances." },
      { label: "Posting rules", href: "/shop/books/rules", what: "Which account each kind of event lands in, and the accountant's export mapping." },
      { label: "Journal", href: "/shop/books/journal", what: "Every entry; export to CSV, Xero or QuickBooks." },
      { label: "Period close", href: "/shop/books/periods", what: "Five checks, then close the month for good." },
      { label: "Accounting reports", href: "/shop/books/reports", what: "Trial balance, general ledger, profit and loss by branch, balance sheet, daily sales." },
    ],
    notes: ["Months close in order and are never reopened.", "A correction is a reversing entry dated today, never an edit."],
  },
  {
    id: "detailing",
    name: "Detailing",
    moduleKey: "detailing",
    side: "staff",
    summary: "Bookings for a detailing branch: a menu priced by vehicle size, a schedule that knows how many detailers are free, a job card with a check-in inspection, and a public page where customers book themselves.",
    screens: [
      { label: "New booking", href: "/shop/detailing/new", what: "Pick a customer, a package and a size; the free start times are offered." },
      { label: "Bookings", href: "/shop/detailing", what: "Every booking and its status." },
      { label: "Schedule", href: "/shop/detailing/schedule", what: "The day by bay or by detailer." },
      { label: "Shop monitor", href: "/shop/detailing/monitor", what: "The floor at a glance; also runs on a wall screen with no sign-in." },
      { label: "Packages & pricing", href: "/shop/detailing/packages", what: "Packages, add-ons, prices per size, and the materials each uses." },
      { label: "Detailing settings", href: "/shop/detailing/settings", what: "Detailer pool, closing time, online booking, wall-screen links." },
    ],
    notes: [
      "A long job is laid across days automatically, skipping what is already taken.",
      "A job cannot start before its check-in inspection unless someone overrides that and says why.",
      "A job is signed off by someone other than the detailer who worked it, and only then billed.",
      "Completing a job takes its package's materials from stock, scaled to the vehicle's size.",
    ],
  },
  {
    id: "equipment",
    name: "Equipment monitoring",
    moduleKey: "equipment",
    side: "staff",
    summary: "The shop's own tools as assets: when each is due for service, how much of its rated life is spent, what it has cost, and one health score to sort them by.",
    screens: [
      { label: "Health board", href: "/shop/equipment", what: "Every tool's service status, forecast, runtime and health." },
      { label: "Equipment register", href: "/shop/equipment/register", what: "What each tool is: make, serial, cost, service plan." },
      { label: "Service profiles", href: "/shop/equipment/profiles", what: "Which packages put how many hours on which tools." },
    ],
    notes: [
      "Nobody types a meter. A tool's hours come from the completed jobs of the packages it is mapped to, plus a usage log.",
      "A service plan can have three limits (hours, a count of jobs or cups, days). Whichever trips first is the one shown.",
      "Logging a service can take parts from stock; they are booked to Equipment Repairs & Maintenance.",
    ],
  },
  {
    id: "crm",
    name: "CRM",
    moduleKey: "crm",
    side: "staff",
    summary: "The customer relationship: one page with everything about a customer across every branch, reminders that go out by themselves, memberships and prepaid packages, a pipeline for winning company accounts, and campaigns.",
    screens: [
      { label: "Customers", href: "/shop/crm", what: "Every customer, opening onto their whole record and timeline." },
      { label: "Tasks", href: "/shop/crm/tasks", what: "Follow-ups, and booking requests customers send from a reminder." },
      { label: "Pipeline", href: "/shop/crm/pipeline", what: "Leads by stage; a won lead becomes a company account." },
      { label: "Memberships & packages", href: "/shop/crm/memberships", what: "Tiers, prepaid plans, packages sold and what they still owe as service." },
      { label: "Reminder rules", href: "/shop/crm/reminders", what: "What is sent, with which wording, and the quiet hours." },
      { label: "Templates", href: "/shop/crm/templates", what: "The wording of every message." },
      { label: "Message log", href: "/shop/crm/messages", what: "What was sent, what is waiting, and what was not sent and why." },
      { label: "Segments & campaigns", href: "/shop/crm/campaigns", what: "Groups of customers, and marketing sent to them." },
    ],
    notes: [
      "A message goes only where consent is on record: service reminders for reminders and feedback, marketing for campaigns.",
      "A message that may not be sent is logged with the reason instead of vanishing.",
      "Nothing is sent during quiet hours; it waits until they end.",
      "Text messages are not delivered yet: no SMS provider is connected. Email is.",
      "A customer's record here covers every branch, whichever branch you work in.",
    ],
  },
  {
    id: "admin",
    name: "Administration",
    side: "both",
    summary: "Who can sign in and what they may do, the list of scheduled services, branches and which modules each runs, branding, and approval limits.",
    screens: [
      { label: "Service catalogue", href: "/service-catalogue", what: "The scheduled services and their intervals." },
      { label: "User access", href: "/access", what: "People, their roles and the branches they are held to." },
      { label: "Settings", href: "/settings", what: "Organisation and branch details, modules, branding, approval limits." },
    ],
    notes: ["A fleet client's users are managed by the service centre, not by the client."],
  },
];

export const GUIDE_PROCESSES: GuideProcess[] = [
  {
    id: "pms",
    title: "Keeping a fleet on schedule",
    summary: "A reading comes in, the schedule works out what is due, an alert is raised, the work is done and the interval restarts.",
    moduleId: "fleet",
    steps: [
      { title: "Log a reading", detail: "The odometer is recorded at the counter or by the fleet's own staff. One that looks wrong asks to be confirmed.", who: "Technician, operations, advisor" },
      { title: "The schedule works it out", detail: "Each service is due at a distance or after a time, whichever comes first, projected from how much the vehicle is driven.", who: "The platform" },
      { title: "An alert is raised", detail: "Due soon, then overdue, in the bell. Expiring documents and licences appear there too.", who: "The platform" },
      { title: "Work is raised", detail: "A work order for what is due, from the vehicle, the schedule, or the counter.", who: "Fleet manager, operations, advisor" },
      { title: "The job closes", detail: "Closing it restarts the interval of every scheduled service it did.", who: "Technician" },
    ],
  },
  {
    id: "repair",
    title: "A repair job, from counter to handover",
    summary: "Check in, quote, approve, schedule, work, close, bill, hand back.",
    moduleId: "repair",
    steps: [
      { title: "Check in", detail: "Find the vehicle by plate or VIN, or register a walk-in and record their consent. Take the odometer reading.", who: "Service advisor, cashier" },
      { title: "Quote", detail: "Draft the work order: labour and parts. A part is from shop stock, bought for this job, or supplied by the customer.", who: "Service advisor" },
      { title: "Send for approval", detail: "Sending numbers the order. Lines under the customer's auto-approve limit approve themselves.", who: "Service advisor" },
      { title: "Approve", detail: "The customer's approver accepts or declines each remaining line. A request left too long raises an alert.", who: "Fleet manager, operations, purchasing officer" },
      { title: "Schedule", detail: "Give the approved work a bay, a time and a technician.", who: "Service advisor, branch manager" },
      { title: "Work and close", detail: "Record findings and the parts actually used, then close. Parts from shop stock leave the shelf here.", who: "Technician" },
      { title: "Bill", detail: "The closed job waits in the billing queue until an invoice carries it.", who: "Cashier, advisor" },
      { title: "Hand back", detail: "Release the vehicle at check-out.", who: "Service advisor" },
    ],
  },
  {
    id: "cash",
    title: "From a closed job to money in",
    summary: "Billing queue, invoice, payment, receivables. Issued documents are voided, never edited.",
    moduleId: "billing",
    steps: [
      { title: "Pick from the billing queue", detail: "Choose one customer's closed jobs; they become a draft invoice.", who: "Cashier, advisor" },
      { title: "Issue the invoice", detail: "It takes its number and a snapshot of the seller, buyer and VAT. From here it cannot be edited.", who: "Cashier, advisor" },
      { title: "Record the payment", detail: "Cash, GCash, Maya, card, bank transfer or cheque. It pays the oldest invoices first unless told otherwise.", who: "Cashier" },
      { title: "Watch receivables", detail: "Aging by customer, statements, and a warning when new work goes over a credit limit.", who: "Branch manager, provider admin" },
      { title: "Correct by voiding", detail: "A wrong invoice or payment is voided with a reason; whatever it paid is owed again.", who: "Branch manager, provider admin" },
    ],
  },
  {
    id: "books",
    title: "The books and the month end",
    summary: "Entries post themselves; the month is checked and closed.",
    moduleId: "books",
    steps: [
      { title: "Events post themselves", detail: "Each invoice, payment and stock move writes a balanced entry in the same instant as the event.", who: "The platform" },
      { title: "Rules decide the accounts", detail: "Posting rules map each kind of event to an account, so the chart can be reshaped without touching a posting.", who: "Provider admin" },
      { title: "Review the journal", detail: "Browse entries by event, date and branch; export for the accountant.", who: "Provider admin, branch manager" },
      { title: "Close the month", detail: "Five checks (the ledger balances, stock value agrees, receivables agree, and so on), then close. A closed month is final.", who: "Provider admin" },
      { title: "Read the reports", detail: "Trial balance, profit and loss by branch, balance sheet, daily sales.", who: "Provider admin, branch manager" },
    ],
  },
  {
    id: "stock",
    title: "Stock, from order to shelf to job",
    summary: "Order, receive, use, count, transfer, reorder. Every change is a document.",
    moduleId: "stock",
    steps: [
      { title: "Order", detail: "Raise a purchase order to a vendor.", who: "Branch manager, provider admin" },
      { title: "Receive", detail: "Receive goods against the order, in full or in part. The average cost updates.", who: "Branch manager, provider admin" },
      { title: "Use", detail: "Parts leave the shelf when a job closes, a detailing job completes, or a tool's service takes them.", who: "The platform, on those actions" },
      { title: "Count", detail: "Count what is there; posting the count books the differences.", who: "Branch manager" },
      { title: "Transfer", detail: "Move stock to another branch, at no profit or loss.", who: "Branch manager, provider admin" },
      { title: "Reorder", detail: "Suggestions from reorder points and recent use.", who: "Branch manager" },
    ],
  },
  {
    id: "detailing",
    title: "A detailing job",
    summary: "Book, inspect, work, sign off, bill.",
    moduleId: "detailing",
    steps: [
      { title: "Book", detail: "At the counter or by the customer online. Only start times with enough free detailers are offered.", who: "Advisor, cashier, or the customer" },
      { title: "Inspect at check-in", detail: "Condition ratings, a damage map and photos, before any work. Skipping it needs a stated reason.", who: "Detailer, advisor" },
      { title: "Work the job card", detail: "Start, tick the checklist, complete. Finishing early frees the remaining slots; materials leave stock.", who: "Detailer" },
      { title: "Sign off", detail: "Quality check by someone other than the detailer who did the work.", who: "Advisor, branch manager" },
      { title: "Bill", detail: "An invoice, a counter checkout (invoice and payment at once), or a prepaid credit. A member's discount comes off by itself.", who: "Cashier, advisor" },
    ],
  },
  {
    id: "equipment",
    title: "Looking after the shop's equipment",
    summary: "Register, map to packages, let the meters run, service when due.",
    moduleId: "equipment",
    steps: [
      { title: "Register the tool", detail: "Its service intervals (hours, jobs or cups, days) and its rated life.", who: "Branch manager, provider admin" },
      { title: "Map it to packages", detail: "Say how many hours one job of each package puts on it.", who: "Branch manager, provider admin" },
      { title: "The meters run themselves", detail: "Hours accrue from completed jobs and the usage log. Nothing is typed in.", who: "The platform" },
      { title: "Watch the board", detail: "Status, forecast and health; an alert when a service is due or life is nearly spent.", who: "Any staff" },
      { title: "Log the service", detail: "It restarts the interval. Parts taken from stock are booked as a maintenance expense.", who: "Branch manager, provider admin" },
    ],
  },
  {
    id: "crm",
    title: "Staying in touch with customers",
    summary: "Reminders go out by themselves to customers who agreed; replies come back as tasks.",
    moduleId: "crm",
    steps: [
      { title: "Reminders are built each morning", detail: "Maintenance due, a document expiring, a detail due again, a customer not seen for a while. One per vehicle.", who: "The platform" },
      { title: "Each is checked before it goes", detail: "Consent on record, not opted out, not sent recently, not in quiet hours. A refusal is logged with its reason.", who: "The platform" },
      { title: "The customer replies from the link", detail: "They book online where the branch offers it, or leave a request that lands on the task list.", who: "The customer" },
      { title: "Staff follow up", detail: "Tasks with an assignee, a due date and a reminder; notes on the customer's record.", who: "Advisor, cashier" },
      { title: "Feedback after payment", detail: "A 0 to 10 question once an invoice is paid in full, adding up to a Net Promoter Score.", who: "The platform, then the customer" },
      { title: "Campaigns and the pipeline", detail: "Marketing to a segment of customers who agreed to it; leads worked by stage until won into an account.", who: "Branch manager, provider admin, advisor" },
    ],
  },
];

/** What holds everywhere on the platform. */
export const GUIDE_PRINCIPLES: { title: string; detail: string }[] = [
  { title: "The server decides", detail: "Totals, due dates, statuses and permissions are worked out by the platform's API. A screen shows what it is given and never keeps its own copy of a rule." },
  { title: "Issued means final", detail: "An invoice, a payment or a stock document is never edited once issued. It is voided or reversed, and the number is never reused." },
  { title: "Numbers have no gaps", detail: "Work orders, invoices, payments, receipts and bookings are numbered in sequence at the moment they are made." },
  { title: "Money is exact", detail: "Amounts are kept in whole centavos and rounded once per total." },
  { title: "Consent is a record", detail: "Each customer's agreement (to keeping service records, to reminders, to marketing) is logged with when and how it was given, and withdrawing it adds a line rather than erasing one." },
  { title: "Dates are Manila dates", detail: "A business day is a day in Asia/Manila, whoever is looking and from wherever." },
  { title: "Nothing pretends", detail: "A button you may not use is shown dimmed with the reason. A screen never shows a change before the platform has confirmed it." },
];
