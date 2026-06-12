import { FormEvent, Fragment, MouseEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type WorkspaceTab =
  | "overview"
  | "projects"
  | "accounting"
  | "journal"
  | "counterparties"
  | "documents"
  | "reporting"
  | "setup"
  | "audit";
type SetupSubTab = "initialization" | "accounts" | "rules" | "periods";

interface Project {
  id: string;
  name: string;
  address?: string | null;
  budget?: string | null;
  createdAt: string;
}

interface EntityRecord {
  id: string;
  name: string;
  legalName?: string | null;
  type: string;
  country: string;
  baseCurrency: string;
  accountingStandard: string;
  accountingInitializedAt?: string | null;
  accountingTemplate?: {
    id: string;
    name: string;
    version: string;
  } | null;
  isActive: boolean;
  createdAt: string;
  organization?: {
    name: string;
  } | null;
}

interface EntityDetailPayload {
  entity: EntityRecord;
  summary: {
    projectsCount: number;
    counterpartiesCount: number;
    transactionsCount: number;
    documentsCount: number;
    journalEntries: {
      total: number;
      draft: number;
      posted: number;
      reversed: number;
    };
  };
  permissions: EntityPermissions;
}

interface EntityPermissions {
  canAccessWorkspace: boolean;
  canManageEntity: boolean;
  canManageAccountingSetup: boolean;
  canCreateAccountingTransaction: boolean;
  canPostJournalEntry: boolean;
  canReverseJournalEntry: boolean;
  canManageCounterparties: boolean;
  canManageDocuments: boolean;
  canViewReports: boolean;
}

interface Account {
  id: string;
  code: string;
  label: string;
  accountClass: string;
  type: string;
  isSystem?: boolean;
  isActive?: boolean;
}

interface AccountClassificationPreview {
  code: string;
  label: string;
  accountClass: string;
  suggestedType?: string | null;
  parentAccount?: Pick<Account, "id" | "code" | "label" | "type"> | null;
  confidence: "PARENT" | "INFERRED" | "MANUAL_REQUIRED";
  warnings: string[];
}

interface AccountingRule {
  id: string;
  entityId?: string | null;
  transactionType: string;
  debitAccountId: string;
  creditAccountId: string;
  descriptionTemplate?: string | null;
  priority: number;
  isActive: boolean;
  debitAccount: Account;
  creditAccount: Account;
}

interface AccountingTemplate {
  id: string;
  name: string;
  version: string;
  jurisdiction: string;
  standard: string;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
  accountsCount: number;
  rulesCount: number;
}

interface AccountingPeriod {
  id: string;
  entityId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
  closedAt?: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
  } | null;
}

interface ApplyTemplateResult {
  entityId: string;
  templateId: string;
  templateName: string;
  accountsCreated: number;
  accountsSkipped: number;
  rulesCreated: number;
  rulesSkipped: number;
  skippedRules?: {
    transactionType: string;
    reason: string;
  }[];
}

interface Counterparty {
  id: string;
  name: string;
  type: string;
  email?: string | null;
  vatNumber?: string | null;
  country?: string | null;
  createdAt: string;
}

interface JournalLine {
  id: string;
  debit: string;
  credit: string;
  currency: string;
  description?: string | null;
  account: Account;
  counterparty?: Counterparty | null;
  project?: Project | null;
}

interface JournalEntry {
  id: string;
  entityId?: string;
  date: string;
  description: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  postedAt?: string | null;
  lines: JournalLine[];
}

interface Transaction {
  id: string;
  date: string;
  type: string;
  amount: string;
  currency: string;
  status: string;
  description?: string | null;
  counterparty?: Counterparty | null;
}

interface CreateTransactionResponse {
  transaction: Transaction;
  journalEntry: JournalEntry;
}

interface JournalEntryActionResponse {
  id: string;
  entityId: string;
  transactionId?: string | null;
  status: "POSTED";
  postedAt?: string | null;
  lineCount: number;
}

interface ReverseJournalEntryResponse extends JournalEntryActionResponse {
  date: string;
}

interface AccountingDocument {
  id: string;
  entityId: string;
  transactionId?: string | null;
  counterpartyId?: string | null;
  title?: string | null;
  type: string;
  fileUrl: string;
  downloadUrl?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  storageProvider?: string | null;
  storageKey?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  counterparty?: Counterparty | null;
  transaction?: Transaction | null;
  uploadedBy?: {
    id: string;
    email: string;
  } | null;
}

interface GeneralLedgerLine {
  journalEntryId: string;
  journalEntryDate: string;
  journalEntryDescription: string;
  accountId: string;
  accountCode: string;
  accountLabel: string;
  debit: string;
  credit: string;
  currency: string;
  counterpartyName?: string | null;
  projectName?: string | null;
  lineDescription?: string | null;
}

interface GeneralLedgerReport {
  entityId: string;
  filters: {
    accountId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  };
  lines: GeneralLedgerLine[];
}

interface TrialBalanceAccount {
  accountId: string;
  accountCode: string;
  accountLabel: string;
  accountClass: string;
  accountType: string;
  debit: string;
  credit: string;
  balance: string;
}

interface TrialBalanceReport {
  entityId: string;
  filters: {
    startDate?: string | null;
    endDate?: string | null;
  };
  totals: {
    debit: string;
    credit: string;
    difference: string;
    balanced: boolean;
  };
  accounts: TrialBalanceAccount[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

interface TransactionForm {
  type: string;
  amount: string;
  currency: string;
  date: string;
  description: string;
  projectId: string;
  counterpartyId: string;
}

interface ProjectForm {
  name: string;
  address: string;
  budget: string;
}

interface CounterpartyForm {
  name: string;
  type: string;
  email: string;
  vatNumber: string;
  country: string;
}

interface DocumentForm {
  file: File | null;
  type: string;
  title: string;
  counterpartyId: string;
  transactionId: string;
}

interface InvoiceCandidate {
  id: string;
  entityId: string;
  documentId: string;
  counterpartyId?: string | null;
  type: string;
  status: string;
  invoiceNumber?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  currency: string;
  subtotal?: string | null;
  vatAmount?: string | null;
  totalAmount: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  document?: {
    id: string;
    title?: string | null;
    originalFilename?: string | null;
    type: string;
    status: string;
    transaction?: {
      id: string;
      date: string;
      type: string;
      amount: string;
      currency: string;
      status: string;
      description?: string | null;
    } | null;
  } | null;
  counterparty?: Counterparty | null;
}

interface InvoiceCandidateForm {
  documentId: string;
  counterpartyId: string;
  type: string;
  status?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
  description: string;
}

interface ReportFilters {
  periodId: string;
  startDate: string;
  endDate: string;
  accountId: string;
}

interface PeriodForm {
  name: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
}

interface AccountForm {
  code: string;
  label: string;
  accountClass: string;
  type: string;
}

interface RuleForm {
  transactionType: string;
  debitAccountId: string;
  creditAccountId: string;
  descriptionTemplate: string;
  priority: string;
}

type ClassValue = string | false | null | undefined;

const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(" ");
const PAGE_BG = "bg-[#ececf1]";
const CARD =
  "rounded-[1.5rem] border border-black/10 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.05)]";
const SUBCARD = "rounded-[1.25rem] border border-black/5 bg-[#f7f7f9]";
const INPUT =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black outline-none transition placeholder:text-black/30 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";
const BUTTON_BLUE =
  "inline-flex items-center justify-center rounded-full bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-blue-600 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_DARK =
  "inline-flex items-center justify-center rounded-full bg-black px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:bg-slate-800 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50";
const TRANSACTION_TYPES = [
  "CUSTOMER_INVOICE",
  "CUSTOMER_PAYMENT",
  "SUPPLIER_INVOICE",
  "SUPPLIER_PAYMENT",
  "BANK_FEE",
];
const COUNTERPARTY_TYPES = [
  "CLIENT",
  "SUPPLIER",
  "INVESTOR",
  "BANK",
  "EMPLOYEE",
  "TAX_AUTHORITY",
  "RELATED_PARTY",
  "OTHER",
];
const DOCUMENT_TYPES = [
  "SUPPLIER_INVOICE",
  "CUSTOMER_INVOICE",
  "BANK_STATEMENT",
  "CONTRACT",
  "TAX_DOCUMENT",
  "REPORT",
  "OTHER",
];
const DOCUMENT_REVIEW_STATUSES = [
  "UPLOADED",
  "PROCESSING",
  "LINKED",
  "REVIEWED",
  "REJECTED",
  "FAILED",
];
const REVIEW_QUEUE_GROUPS = [
  {
    id: "pending",
    title: "Pending review",
    description: "Newly uploaded or in-progress documents.",
    statuses: ["UPLOADED", "PROCESSING"],
    badgeClass: "bg-amber-50 text-amber-700",
  },
  {
    id: "exceptions",
    title: "Exceptions",
    description: "Rejected or failed items needing follow-up.",
    statuses: ["REJECTED", "FAILED"],
    badgeClass: "bg-red-50 text-red-600",
  },
  {
    id: "reviewed",
    title: "Reviewed",
    description: "Documents already cleared by operations.",
    statuses: ["REVIEWED"],
    badgeClass: "bg-emerald-50 text-emerald-700",
  },
] as const;
const RULE_TRANSACTION_TYPES = [
  "CUSTOMER_INVOICE",
  "CUSTOMER_PAYMENT",
  "SUPPLIER_INVOICE",
  "SUPPLIER_PAYMENT",
  "BANK_FEE",
  "LOAN_RECEIVED",
  "LOAN_REPAYMENT",
  "CAPITAL_CONTRIBUTION",
  "CAPITAL_CALL",
  "INVESTOR_CONTRIBUTION",
  "INVESTMENT_ACQUISITION",
  "INVESTMENT_DISPOSAL",
  "DISTRIBUTION",
  "VALUATION_ADJUSTMENT",
  "FX_ADJUSTMENT",
  "TRANSFER",
  "MANUAL_ADJUSTMENT",
];
const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "accounting", label: "Accounting" },
  { id: "journal", label: "Journal" },
  { id: "counterparties", label: "Counterparties" },
  { id: "documents", label: "Documents" },
  { id: "reporting", label: "Reporting" },
  { id: "setup", label: "Setup" },
  { id: "audit", label: "Audit" },
];
const SETUP_TABS: { id: SetupSubTab; label: string }[] = [
  { id: "initialization", label: "Initialization" },
  { id: "accounts", label: "Chart of Accounts" },
  { id: "rules", label: "Accounting Rules" },
  { id: "periods", label: "Periods" },
];
const DEFAULT_VISIBLE_ACCOUNTS = 12;
const DEFAULT_VISIBLE_RULES = 10;

const initialTransactionForm = (): TransactionForm => ({
  type: "CUSTOMER_INVOICE",
  amount: "",
  currency: "EUR",
  date: new Date().toISOString().slice(0, 10),
  description: "",
  projectId: "",
  counterpartyId: "",
});

const initialProjectForm = (): ProjectForm => ({
  name: "",
  address: "",
  budget: "",
});

const initialCounterpartyForm = (): CounterpartyForm => ({
  name: "",
  type: "CLIENT",
  email: "",
  vatNumber: "",
  country: "LU",
});

const initialDocumentForm = (): DocumentForm => ({
  file: null,
  type: "OTHER",
  title: "",
  counterpartyId: "",
  transactionId: "",
});

const initialInvoiceCandidateForm = (
  currency = "EUR"
): InvoiceCandidateForm => ({
  documentId: "",
  counterpartyId: "",
  type: "SUPPLIER",
  status: "DRAFT",
  invoiceNumber: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  currency,
  subtotal: "",
  vatAmount: "",
  totalAmount: "",
  description: "",
});

const initialReportFilters = (): ReportFilters => ({
  periodId: "",
  startDate: "",
  endDate: "",
  accountId: "",
});

const initialPeriodForm = (): PeriodForm => ({
  name: "",
  startDate: "",
  endDate: "",
  status: "OPEN",
});

const initialAccountForm = (): AccountForm => ({
  code: "",
  label: "",
  accountClass: "",
  type: "",
});

const initialRuleForm = (): RuleForm => ({
  transactionType: "CUSTOMER_INVOICE",
  debitAccountId: "",
  creditAccountId: "",
  descriptionTemplate: "",
  priority: "100",
});

function LogoMark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-7 items-center gap-[3px]">
        <span className="h-6 w-3 rounded-[2px] bg-black" />
        <span className="h-6 w-3 rounded-[2px] bg-black" />
      </div>
      <span className="text-sm font-bold tracking-tight text-black">
        Proliquid
      </span>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
}

function formatAccountingPeriodDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function formatAmount(value: string | number, currency = "EUR") {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "—";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatFileSize(value?: number | null) {
  if (!value || value <= 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function hasTrialBalanceActivity(account: TrialBalanceAccount) {
  const debit = Number(account.debit ?? 0);
  const credit = Number(account.credit ?? 0);
  const balance = Number(account.balance ?? 0);

  return debit !== 0 || credit !== 0 || balance !== 0;
}

function statusClass(status: string) {
  if (status === "POSTED") return "bg-emerald-50 text-emerald-700";
  if (status === "REVERSED") return "bg-slate-100 text-slate-500";
  if (status === "CANCELLED") return "bg-red-50 text-red-600";
  return "bg-amber-50 text-amber-700";
}

function documentStatusClass(status: string) {
  if (status === "UPLOADED" || status === "LINKED" || status === "REVIEWED") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "PROCESSING" || status === "EXTRACTED") {
    return "bg-blue-50 text-blue-700";
  }
  if (status === "REJECTED" || status === "FAILED") {
    return "bg-red-50 text-red-600";
  }
  return "bg-slate-100 text-slate-600";
}

function documentDisplayName(document: AccountingDocument) {
  return document.title || document.originalFilename || "Untitled document";
}

function documentDownloadUrl(document: AccountingDocument) {
  return document.downloadUrl || `/api/accounting/documents/${document.id}/download`;
}

function documentQueueActions(status: string) {
  if (status === "UPLOADED") {
    return [
      { label: "Start", status: "PROCESSING" },
      { label: "Review", status: "REVIEWED" },
      { label: "Reject", status: "REJECTED" },
    ];
  }

  if (status === "PROCESSING") {
    return [
      { label: "Review", status: "REVIEWED" },
      { label: "Fail", status: "FAILED" },
    ];
  }

  if (status === "REJECTED" || status === "FAILED") {
    return [
      { label: "Retry", status: "PROCESSING" },
      { label: "Review", status: "REVIEWED" },
    ];
  }

  if (status === "REVIEWED") {
    return [{ label: "Reopen", status: "PROCESSING" }];
  }

  return [];
}

function isInvoiceDocumentType(type: string) {
  return (
    type === "INVOICE" ||
    type === "SUPPLIER_INVOICE" ||
    type === "CUSTOMER_INVOICE"
  );
}

function invoiceCandidateTypeFromDocument(type: string) {
  return type === "CUSTOMER_INVOICE" ? "CUSTOMER" : "SUPPLIER";
}

function invoiceCandidateStatusClass(status: string) {
  if (status === "ACCOUNTING_DRAFT_CREATED") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "READY_FOR_ACCOUNTING_REVIEW") {
    return "bg-blue-50 text-blue-700";
  }

  return "bg-amber-50 text-amber-700";
}

function invoiceCandidateStatusLabel(status: string) {
  if (status === "ACCOUNTING_DRAFT_CREATED") {
    return "Accounting draft created";
  }

  if (status === "READY_FOR_ACCOUNTING_REVIEW") {
    return "Ready for accounting review";
  }

  return "Draft";
}

function invoiceCandidateFormFromCandidate(candidate: InvoiceCandidate): InvoiceCandidateForm {
  return {
    documentId: candidate.documentId,
    counterpartyId: candidate.counterpartyId || "",
    type: candidate.type,
    status: candidate.status,
    invoiceNumber: candidate.invoiceNumber || "",
    invoiceDate: candidate.invoiceDate.slice(0, 10),
    dueDate: candidate.dueDate ? candidate.dueDate.slice(0, 10) : "",
    currency: candidate.currency,
    subtotal: candidate.subtotal || "",
    vatAmount: candidate.vatAmount || "",
    totalAmount: candidate.totalAmount,
    description: candidate.description || "",
  };
}

function total(lines: JournalLine[], field: "debit" | "credit") {
  return lines.reduce((sum, line) => sum + Number(line[field] || 0), 0);
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className={cn(CARD, "p-4")}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">
          {label}
        </p>
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            accent ? "bg-blue-500" : "bg-black/10"
          )}
        />
      </div>
      <p className="mt-4 text-3xl font-bold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full border px-4 py-2 text-xs font-semibold transition",
        active
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/55 hover:border-black hover:text-black"
      )}
    >
      {label}
    </button>
  );
}

export default function EntityWorkspacePage() {
  const router = useRouter();
  const entityId =
    typeof router.query.entityId === "string"
      ? router.query.entityId
      : undefined;
  const tabQuery =
    typeof router.query.tab === "string" ? router.query.tab : "overview";
  const initialTab = TABS.some((tab) => tab.id === tabQuery)
    ? (tabQuery as WorkspaceTab)
    : "overview";

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const [setupSubTab, setSetupSubTab] =
    useState<SetupSubTab>("initialization");
  const [entityDetail, setEntityDetail] = useState<EntityDetailPayload | null>(
    null
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [documents, setDocuments] = useState<AccountingDocument[]>([]);
  const [invoiceCandidates, setInvoiceCandidates] = useState<InvoiceCandidate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<AccountingRule[]>([]);
  const [templates, setTemplates] = useState<AccountingTemplate[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [applyTemplateResult, setApplyTemplateResult] =
    useState<ApplyTemplateResult | null>(null);
  const [generalLedger, setGeneralLedger] = useState<GeneralLedgerReport | null>(
    null
  );
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReport | null>(
    null
  );
  const [showZeroBalanceAccounts, setShowZeroBalanceAccounts] = useState(false);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(
    initialTransactionForm
  );
  const [projectForm, setProjectForm] = useState<ProjectForm>(initialProjectForm);
  const [counterpartyForm, setCounterpartyForm] =
    useState<CounterpartyForm>(initialCounterpartyForm);
  const [documentForm, setDocumentForm] = useState<DocumentForm>(
    initialDocumentForm
  );
  const [invoiceCandidateForm, setInvoiceCandidateForm] =
    useState<InvoiceCandidateForm>(initialInvoiceCandidateForm);
  const [accountForm, setAccountForm] = useState<AccountForm>(initialAccountForm);
  const [accountPreview, setAccountPreview] =
    useState<AccountClassificationPreview | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(initialRuleForm);
  const [reportFilters, setReportFilters] = useState<ReportFilters>(
    initialReportFilters
  );
  const [periodForm, setPeriodForm] = useState<PeriodForm>(initialPeriodForm);
  const [projectSearch, setProjectSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [showAllRules, setShowAllRules] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [loadedSections, setLoadedSections] = useState<Record<string, boolean>>({});
  const [submittingTransaction, setSubmittingTransaction] = useState(false);
  const [submittingProject, setSubmittingProject] = useState(false);
  const [addingCounterparty, setAddingCounterparty] = useState(false);
  const [addingDocument, setAddingDocument] = useState(false);
  const [creatingInvoiceCandidate, setCreatingInvoiceCandidate] = useState(false);
  const [activeInvoiceCandidateId, setActiveInvoiceCandidateId] =
    useState<string | null>(null);
  const [focusedTransactionId, setFocusedTransactionId] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [selectedInvoiceCandidateDocumentId, setSelectedInvoiceCandidateDocumentId] =
    useState<string | null>(null);
  const [selectedInvoiceCandidateId, setSelectedInvoiceCandidateId] =
    useState<string | null>(null);
  const [documentFileInputKey, setDocumentFileInputKey] = useState(0);
  const [addingAccount, setAddingAccount] = useState(false);
  const [previewingAccount, setPreviewingAccount] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (activeTab !== "accounting" || !focusedTransactionId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const row = window.document.getElementById(`transaction-${focusedTransactionId}`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [activeTab, focusedTransactionId, transactions]);

  const request = async <T,>(url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.replace("/login");
      throw new Error("Your session has expired. Please sign in again.");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = (await response.json()) as ApiResponse<T>;

    if (response.status === 401) {
      localStorage.removeItem("token");
      router.replace("/login");
    }

    if (!response.ok || !payload.success) {
      throw new Error(payload.message || "Unable to complete request");
    }

    return payload.data as T;
  };

  const selectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);

    if (!entityId) return;

    router.replace(
      `/dashboard/entity/${entityId}${tab === "overview" ? "" : `?tab=${tab}`}`,
      undefined,
      { shallow: true }
    );
  };

  const loadReports = async (
    filters: ReportFilters,
    showRefresh = false
  ) => {
    if (!entityId) return;

    if (showRefresh) {
      setReportsLoading(true);
    }

    try {
      const baseQuery = new URLSearchParams();
      baseQuery.set("entityId", entityId);

      if (filters.startDate) {
        baseQuery.set("startDate", filters.startDate);
      }
      if (filters.periodId) {
        baseQuery.set("periodId", filters.periodId);
      }

      if (filters.endDate) {
        baseQuery.set("endDate", filters.endDate);
      }

      const generalLedgerQuery = new URLSearchParams(baseQuery);

      if (filters.accountId) {
        generalLedgerQuery.set("accountId", filters.accountId);
      }

      const [trialBalanceData, generalLedgerData] = await Promise.all([
        request<TrialBalanceReport>(
          `/api/accounting/reports/trial-balance?${baseQuery.toString()}`
        ),
        request<GeneralLedgerReport>(
          `/api/accounting/reports/general-ledger?${generalLedgerQuery.toString()}`
        ),
      ]);

      setTrialBalance(trialBalanceData);
      setGeneralLedger(generalLedgerData);
    } catch (reportError) {
      setError(
        reportError instanceof Error
          ? reportError.message
          : "Unable to load reporting"
      );
    } finally {
      setReportsLoading(false);
    }
  };

  const markLoaded = (section: string) => {
    setLoadedSections((current) => ({ ...current, [section]: true }));
  };

  const resetLoaded = (...sections: string[]) => {
    setLoadedSections((current) => {
      if (!sections.length) return {};
      const next = { ...current };
      sections.forEach((section) => {
        delete next[section];
      });
      return next;
    });
  };

  const loadEntityDetail = async (showRefresh = false) => {
    if (!entityId) return;

    if (showRefresh) {
      setRefreshing(true);
    }

    setError(null);

    try {
      const entityData = await request<EntityDetailPayload>(`/api/entities/${entityId}`);
      setEntityDetail(entityData);
      if (
        activeTab === "setup" &&
        !entityData.permissions.canManageAccountingSetup
      ) {
        setActiveTab("overview");
      }
      setTransactionForm((current) => ({
        ...current,
        currency: entityData.entity.baseCurrency || current.currency,
      }));
      setInvoiceCandidateForm((current) => ({
        ...current,
        currency: current.currency || entityData.entity.baseCurrency || "EUR",
      }));
      markLoaded("entity");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load entity workspace"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadProjects = async () => {
    if (!entityId) return;
    const projectData = await request<Project[]>(`/api/entities/${entityId}/projects`);
    setProjects(projectData);
    markLoaded("projects");
  };

  const loadTransactions = async (limit = 50) => {
    if (!entityId) return;
    const transactionData = await request<Transaction[]>(
      `/api/accounting/transactions?entityId=${encodeURIComponent(entityId)}&limit=${limit}`
    );
    setTransactions(transactionData);
    markLoaded("transactions");
  };

  const loadJournalEntries = async (limit = 50) => {
    if (!entityId) return;
    const journalEntryData = await request<JournalEntry[]>(
      `/api/accounting/journal-entries?entityId=${encodeURIComponent(entityId)}&limit=${limit}`
    );
    setJournalEntries(journalEntryData);
    markLoaded("journalEntries");
  };

  const loadCounterparties = async () => {
    if (!entityId) return;
    const counterpartyData = await request<Counterparty[]>(
      `/api/accounting/counterparties?entityId=${encodeURIComponent(entityId)}`
    );
    setCounterparties(counterpartyData);
    markLoaded("counterparties");
  };

  const loadDocuments = async () => {
    if (!entityId) return;
    const documentData = await request<AccountingDocument[]>(
      `/api/accounting/documents?entityId=${encodeURIComponent(entityId)}`
    );
    setDocuments(documentData);
    markLoaded("documents");
  };

  const loadInvoiceCandidates = async () => {
    if (!entityId) return;
    const candidateData = await request<InvoiceCandidate[]>(
      `/api/accounting/invoice-candidates?entityId=${encodeURIComponent(entityId)}`
    );
    setInvoiceCandidates(candidateData);
    markLoaded("invoiceCandidates");
  };

  const loadAccounts = async () => {
    if (!entityId || !entityDetail?.permissions.canManageAccountingSetup) return;
    const accountData = await request<Account[]>(
      `/api/accounting/chart-of-accounts?entityId=${encodeURIComponent(
        entityId
      )}&includeInactive=true&limit=1000`
    );
    setAccounts(accountData);
    markLoaded("accounts");
  };

  const loadRules = async () => {
    if (!entityId || !entityDetail?.permissions.canManageAccountingSetup) return;
    const ruleData = await request<AccountingRule[]>(
      `/api/accounting/rules?entityId=${encodeURIComponent(entityId)}&includeInactive=true`
    );
    setRules(ruleData);
    markLoaded("rules");
  };

  const loadTemplates = async () => {
    if (!entityDetail?.permissions.canManageAccountingSetup) return;
    const templateData = await request<AccountingTemplate[]>("/api/accounting/templates");
    setTemplates(templateData);
    setSelectedTemplateId((current) => current || templateData[0]?.id || "");
    markLoaded("templates");
  };

  const loadPeriods = async () => {
    if (!entityId || !entityDetail?.permissions.canManageAccountingSetup) return;
    const periodData = await request<AccountingPeriod[]>(
      `/api/accounting/periods?entityId=${encodeURIComponent(entityId)}`
    );
    setPeriods(periodData);
    markLoaded("periods");
  };

  const loadAuditLogs = async () => {
    if (!entityId) return;
    const auditLogData = await request<AuditLog[]>(
      `/api/audit-logs?entityId=${encodeURIComponent(entityId)}&limit=100`
    );
    setAuditLogs(auditLogData);
    markLoaded("auditLogs");
  };

  const loadSetupSubTab = async (subTab: SetupSubTab, force = false) => {
    if (!entityDetail?.permissions.canManageAccountingSetup) return;

    if (subTab === "initialization") {
      if (force || !loadedSections.templates) await loadTemplates();
      return;
    }

    if (subTab === "accounts") {
      if (force || !loadedSections.accounts) await loadAccounts();
      return;
    }

    if (subTab === "rules") {
      await Promise.all([
        !force && loadedSections.accounts ? Promise.resolve() : loadAccounts(),
        !force && loadedSections.rules ? Promise.resolve() : loadRules(),
      ]);
      return;
    }

    if (subTab === "periods") {
      if (force || !loadedSections.periods) await loadPeriods();
    }
  };

  const loadTabData = async (tab: WorkspaceTab, force = false) => {
    if (!entityId || !entityDetail) return;
    setError(null);

    try {
      if (tab === "overview") {
        await Promise.all([
          !force && loadedSections.transactions ? Promise.resolve() : loadTransactions(5),
          !force && loadedSections.journalEntries ? Promise.resolve() : loadJournalEntries(5),
        ]);
      } else if (tab === "projects") {
        if (force || !loadedSections.projects) await loadProjects();
      } else if (tab === "accounting") {
        await Promise.all([
          !force && loadedSections.transactions ? Promise.resolve() : loadTransactions(),
          !force && loadedSections.projects ? Promise.resolve() : loadProjects(),
          !force && loadedSections.counterparties ? Promise.resolve() : loadCounterparties(),
        ]);
      } else if (tab === "journal") {
        if (force || !loadedSections.journalEntries) await loadJournalEntries();
      } else if (tab === "counterparties") {
        if (force || !loadedSections.counterparties) await loadCounterparties();
      } else if (tab === "documents") {
        const documentLoads: Promise<void>[] = [
          !force && loadedSections.documents ? Promise.resolve() : loadDocuments(),
          !force && loadedSections.invoiceCandidates
            ? Promise.resolve()
            : loadInvoiceCandidates(),
        ];

        if (entityDetail.permissions.canManageDocuments) {
          documentLoads.push(
            !force && loadedSections.counterparties ? Promise.resolve() : loadCounterparties(),
            !force && loadedSections.transactions ? Promise.resolve() : loadTransactions()
          );
        }

        await Promise.all(documentLoads);
      } else if (tab === "reporting") {
        await Promise.all([
          !force && loadedSections.accounts ? Promise.resolve() : loadAccounts(),
          !force && trialBalance && generalLedger
            ? Promise.resolve()
            : loadReports(reportFilters, true),
        ]);
      } else if (tab === "setup") {
        await loadSetupSubTab(setupSubTab, force);
      } else if (tab === "audit") {
        if (force || !loadedSections.auditLogs) await loadAuditLogs();
      }
    } catch (tabError) {
      setError(
        tabError instanceof Error
          ? tabError.message
          : "Unable to load workspace data"
      );
    }
  };

  useEffect(() => {
    if (!router.isReady || !entityId) return;

    if (!localStorage.getItem("token")) {
      router.replace("/login");
      return;
    }

    setLoadedSections({});
    loadEntityDetail(false);
  }, [router.isReady, entityId]);

  useEffect(() => {
    if (!entityDetail || !entityId) return;
    loadTabData(activeTab);
  }, [activeTab, entityDetail?.entity.id]);

  useEffect(() => {
    if (!entityDetail || activeTab !== "setup") return;
    loadSetupSubTab(setupSubTab);
  }, [setupSubTab, activeTab, entityDetail?.entity.id]);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();

    if (!query) return projects;

    return projects.filter((project) => {
      return (
        project.name.toLowerCase().includes(query) ||
        (project.address || "").toLowerCase().includes(query)
      );
    });
  }, [projectSearch, projects]);

  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();

    if (!query) return accounts;

    return accounts.filter((account) => {
      return (
        account.code.toLowerCase().includes(query) ||
        account.label.toLowerCase().includes(query)
      );
    });
  }, [accountSearch, accounts]);

  const filteredRules = useMemo(() => {
    const query = ruleSearch.trim().toLowerCase();

    if (!query) return rules;

    return rules.filter((rule) => {
      return (
        rule.transactionType.toLowerCase().includes(query) ||
        rule.debitAccount.code.toLowerCase().includes(query) ||
        rule.debitAccount.label.toLowerCase().includes(query) ||
        rule.creditAccount.code.toLowerCase().includes(query) ||
        rule.creditAccount.label.toLowerCase().includes(query) ||
        (rule.descriptionTemplate || "").toLowerCase().includes(query)
      );
    });
  }, [ruleSearch, rules]);

  const visibleAccounts = useMemo(
    () =>
      showAllAccounts
        ? filteredAccounts
        : filteredAccounts.slice(0, DEFAULT_VISIBLE_ACCOUNTS),
    [filteredAccounts, showAllAccounts]
  );

  const visibleRules = useMemo(
    () =>
      showAllRules
        ? filteredRules
        : filteredRules.slice(0, DEFAULT_VISIBLE_RULES),
    [filteredRules, showAllRules]
  );

  const documentReviewQueue = useMemo(
    () => ({
      pending: documents.filter((document) =>
        ["UPLOADED", "PROCESSING"].includes(document.status)
      ),
      reviewed: documents.filter((document) => document.status === "REVIEWED"),
      exceptions: documents.filter((document) =>
        ["REJECTED", "FAILED"].includes(document.status)
      ),
    }),
    [documents]
  );

  const documentReviewSummary = useMemo(
    () => ({
      pending: documentReviewQueue.pending.length,
      reviewed: documentReviewQueue.reviewed.length,
      exceptions: documentReviewQueue.exceptions.length,
    }),
    [documentReviewQueue]
  );

  const invoiceCandidateDocumentIds = useMemo(
    () => new Set(invoiceCandidates.map((candidate) => candidate.documentId)),
    [invoiceCandidates]
  );

  const reviewedInvoiceDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          document.status === "REVIEWED" &&
          isInvoiceDocumentType(document.type) &&
          !invoiceCandidateDocumentIds.has(document.id)
      ),
    [documents, invoiceCandidateDocumentIds]
  );

  const trialBalanceRows = trialBalance?.accounts || [];
  const visibleTrialBalanceRows = useMemo(
    () =>
      showZeroBalanceAccounts
        ? trialBalanceRows
        : trialBalanceRows.filter(hasTrialBalanceActivity),
    [showZeroBalanceAccounts, trialBalanceRows]
  );

  const kpis = useMemo(
    () => ({
      projects: entityDetail?.summary.projectsCount ?? projects.length,
      transactions: entityDetail?.summary.transactionsCount ?? transactions.length,
      draftEntries:
        entityDetail?.summary.journalEntries.draft ??
        journalEntries.filter((entry) => entry.status === "DRAFT").length,
      postedEntries:
        entityDetail?.summary.journalEntries.posted ??
        journalEntries.filter((entry) => entry.status === "POSTED").length,
      counterparties: entityDetail?.summary.counterpartiesCount ?? counterparties.length,
      documents: entityDetail?.summary.documentsCount ?? documents.length,
    }),
    [entityDetail, projects, transactions, journalEntries, counterparties, documents]
  );

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);
  const recentJournalEntries = useMemo(
    () => journalEntries.slice(0, 5),
    [journalEntries]
  );

  const accountKpis = useMemo(
    () => ({
      total: accounts.length,
      active: accounts.filter((account) => account.isActive).length,
      inactive: accounts.filter((account) => !account.isActive).length,
      system: accounts.filter((account) => account.isSystem).length,
      custom: accounts.filter((account) => !account.isSystem).length,
    }),
    [accounts]
  );

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.isActive),
    [accounts]
  );

  const updateEntitySummary = (
    updater: (summary: EntityDetailPayload["summary"]) => EntityDetailPayload["summary"]
  ) => {
    setEntityDetail((current) =>
      current
        ? {
            ...current,
            summary: updater(current.summary),
          }
        : current
    );
  };

  const handleTransactionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;

    setSubmittingTransaction(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await request<CreateTransactionResponse>("/api/accounting/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          type: transactionForm.type,
          amount: transactionForm.amount,
          currency: transactionForm.currency,
          date: transactionForm.date,
          description: transactionForm.description || undefined,
          projectId: transactionForm.projectId || undefined,
          counterpartyId: transactionForm.counterpartyId || undefined,
        }),
      });

      setTransactionForm({
        ...initialTransactionForm(),
        currency: entityDetail?.entity.baseCurrency || "EUR",
      });
      setTransactions((current) => [payload.transaction, ...current].slice(0, 50));
      setJournalEntries((current) => [payload.journalEntry, ...current].slice(0, 50));
      updateEntitySummary((summary) => ({
        ...summary,
        transactionsCount: summary.transactionsCount + 1,
        journalEntries: {
          ...summary.journalEntries,
          total: summary.journalEntries.total + 1,
          draft: summary.journalEntries.draft + 1,
        },
      }));
      setSuccess("Transaction created. Draft journal entry generated.");
      selectTab("journal");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create transaction"
      );
    } finally {
      setSubmittingTransaction(false);
    }
  };

  const handleProjectSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;

    setSubmittingProject(true);
    setError(null);
    setSuccess(null);

    try {
      const project = await request<Project>(`/api/entities/${entityId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectForm.name,
          address: projectForm.address || undefined,
          budget: projectForm.budget || undefined,
        }),
      });

      setProjectForm(initialProjectForm());
      setProjects((current) => [project, ...current]);
      updateEntitySummary((summary) => ({
        ...summary,
        projectsCount: summary.projectsCount + 1,
      }));
      setSuccess("Project created inside the entity workspace.");
    } catch (projectError) {
      setError(
        projectError instanceof Error
          ? projectError.message
          : "Unable to create project"
      );
    } finally {
      setSubmittingProject(false);
    }
  };

  const handleEntryAction = async (
    journalEntryId: string,
    action: "post" | "reverse"
  ) => {
    setActiveEntryId(journalEntryId);
    setError(null);
    setSuccess(null);

    try {
      if (action === "post") {
        const payload = await request<JournalEntryActionResponse>(
          `/api/accounting/journal-entries/${journalEntryId}/${action}`,
          { method: "POST" }
        );

        setJournalEntries((current) =>
          current.map((entry) =>
            entry.id === payload.id
              ? {
                  ...entry,
                  status: "POSTED",
                  postedAt: payload.postedAt || null,
                }
              : entry
          )
        );
        updateEntitySummary((summary) => ({
          ...summary,
          journalEntries: {
            ...summary.journalEntries,
            draft: Math.max(0, summary.journalEntries.draft - 1),
            posted: summary.journalEntries.posted + 1,
          },
        }));
      } else {
        await request<ReverseJournalEntryResponse>(
          `/api/accounting/journal-entries/${journalEntryId}/${action}`,
          { method: "POST" }
        );
        resetLoaded("journalEntries");
        await loadJournalEntries();
        updateEntitySummary((summary) => ({
          ...summary,
          journalEntries: {
            ...summary.journalEntries,
            total: summary.journalEntries.total + 1,
            posted: summary.journalEntries.posted + 1,
          },
        }));
      }

      setSuccess(
        action === "post"
          ? "Journal entry posted successfully."
          : "Reversal journal entry created successfully."
      );
      setTrialBalance(null);
      setGeneralLedger(null);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update journal entry"
      );
    } finally {
      setActiveEntryId(null);
    }
  };

  const handleAddCounterparty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;

    setAddingCounterparty(true);
    setError(null);
    setSuccess(null);

    try {
      const counterparty = await request<Counterparty>(
        "/api/accounting/counterparties",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityId,
            name: counterpartyForm.name,
            type: counterpartyForm.type,
            email: counterpartyForm.email || undefined,
            vatNumber: counterpartyForm.vatNumber || undefined,
            country: counterpartyForm.country || undefined,
          }),
        }
      );

      setCounterpartyForm(initialCounterpartyForm());
      setTransactionForm((current) => ({
        ...current,
        counterpartyId: counterparty.id,
      }));
      setCounterparties((current) => [counterparty, ...current]);
      updateEntitySummary((summary) => ({
        ...summary,
        counterpartiesCount: summary.counterpartiesCount + 1,
      }));
      setSuccess("Counterparty added and available for transaction entry.");
    } catch (counterpartyError) {
      setError(
        counterpartyError instanceof Error
          ? counterpartyError.message
          : "Unable to add counterparty"
      );
    } finally {
      setAddingCounterparty(false);
    }
  };

  const handleAddDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;

    if (!documentForm.file) {
      setError("Choose a file to upload.");
      return;
    }

    setAddingDocument(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", documentForm.file);
      formData.append("entityId", entityId);
      formData.append("type", documentForm.type);

      if (documentForm.title) {
        formData.append("title", documentForm.title);
      }

      if (documentForm.counterpartyId) {
        formData.append("counterpartyId", documentForm.counterpartyId);
      }

      if (documentForm.transactionId) {
        formData.append("transactionId", documentForm.transactionId);
      }

      const document = await request<AccountingDocument>("/api/accounting/documents/upload", {
        method: "POST",
        body: formData,
      });

      setDocumentForm(initialDocumentForm());
      setDocumentFileInputKey((current) => current + 1);
      setDocuments((current) => [document, ...current]);
      updateEntitySummary((summary) => ({
        ...summary,
        documentsCount: summary.documentsCount + 1,
      }));
      setSuccess("Document uploaded and linked to this entity workspace.");
    } catch (documentError) {
      setError(
        documentError instanceof Error
          ? documentError.message
          : "Unable to upload document"
      );
    } finally {
      setAddingDocument(false);
    }
  };

  const handleOpenDocument = async (
    event: MouseEvent<HTMLAnchorElement>,
    document: AccountingDocument
  ) => {
    event.preventDefault();

    const token = localStorage.getItem("token");

    if (!token) {
      router.replace("/login");
      setError("Your session has expired. Please sign in again.");
      return;
    }

    setOpeningDocumentId(document.id);
    setError(null);

    try {
      const response = await fetch(documentDownloadUrl(document), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        localStorage.removeItem("token");
        router.replace("/login");
        throw new Error("Your session has expired. Please sign in again.");
      }

      if (!response.ok) {
        let message = "Unable to open document";

        try {
          const payload = (await response.clone().json()) as { message?: string };
          message = payload.message || message;
        } catch {
          // Successful responses are binary; error responses should be JSON.
        }

        throw new Error(message);
      }

      const fileBlob = await response.blob();
      const objectUrl = URL.createObjectURL(fileBlob);
      const downloadLink = window.document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.target = "_blank";
      downloadLink.rel = "noopener noreferrer";
      downloadLink.click();

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to open document"
      );
    } finally {
      setOpeningDocumentId(null);
    }
  };

  const handleDocumentStatus = async (
    document: AccountingDocument,
    status: string
  ) => {
    if (document.status === status) return;

    setActiveDocumentId(document.id);
    setError(null);
    setSuccess(null);

    try {
      const updatedDocument = await request<AccountingDocument>(
        `/api/accounting/documents/${document.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );

      setDocuments((current) =>
        current.map((item) =>
          item.id === updatedDocument.id ? updatedDocument : item
        )
      );
      setSuccess(`Document status updated to ${updatedDocument.status}.`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update document status"
      );
    } finally {
      setActiveDocumentId(null);
    }
  };

  const startInvoiceCandidate = (document: AccountingDocument) => {
    const currency = entityDetail?.entity.baseCurrency || "EUR";
    setSelectedInvoiceCandidateId(null);
    setSelectedInvoiceCandidateDocumentId(document.id);
    setInvoiceCandidateForm({
      ...initialInvoiceCandidateForm(currency),
      documentId: document.id,
      counterpartyId: document.counterpartyId || "",
      type: invoiceCandidateTypeFromDocument(document.type),
      currency,
      description: document.title || document.originalFilename || "",
    });
    setError(null);
    setSuccess(null);
  };

  const resetInvoiceCandidateEditor = () => {
    setSelectedInvoiceCandidateId(null);
    setSelectedInvoiceCandidateDocumentId(null);
    setInvoiceCandidateForm(
      initialInvoiceCandidateForm(entityDetail?.entity.baseCurrency || "EUR")
    );
  };

  const startInvoiceCandidateEdit = (candidate: InvoiceCandidate) => {
    setSelectedInvoiceCandidateId(candidate.id);
    setSelectedInvoiceCandidateDocumentId(candidate.documentId);
    setInvoiceCandidateForm(invoiceCandidateFormFromCandidate(candidate));
    setError(null);
    setSuccess(null);
  };

  const submitInvoiceCandidate = async (
    targetStatus: "DRAFT" | "READY_FOR_ACCOUNTING_REVIEW" = "DRAFT"
  ) => {
    if (!entityId) return;

    setCreatingInvoiceCandidate(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        entityId,
        documentId: invoiceCandidateForm.documentId,
        counterpartyId: invoiceCandidateForm.counterpartyId || undefined,
        type: invoiceCandidateForm.type,
        status: targetStatus,
        invoiceNumber: invoiceCandidateForm.invoiceNumber || undefined,
        invoiceDate: invoiceCandidateForm.invoiceDate,
        dueDate: invoiceCandidateForm.dueDate || undefined,
        currency: invoiceCandidateForm.currency,
        subtotal: invoiceCandidateForm.subtotal || undefined,
        vatAmount: invoiceCandidateForm.vatAmount || undefined,
        totalAmount: invoiceCandidateForm.totalAmount,
        description: invoiceCandidateForm.description || undefined,
      };

      if (selectedInvoiceCandidateId) {
        const candidate = await request<InvoiceCandidate>(
          `/api/accounting/invoice-candidates/${selectedInvoiceCandidateId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        setInvoiceCandidates((current) =>
          current.map((item) => (item.id === candidate.id ? candidate : item))
        );
        startInvoiceCandidateEdit(candidate);
        setSuccess(
          targetStatus === "READY_FOR_ACCOUNTING_REVIEW"
            ? "Invoice candidate is ready for accounting review."
            : "Invoice candidate draft updated."
        );
      } else {
        const candidate = await request<InvoiceCandidate>(
          "/api/accounting/invoice-candidates",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        setInvoiceCandidates((current) => [candidate, ...current]);
        if (targetStatus === "READY_FOR_ACCOUNTING_REVIEW") {
          const promotedCandidate = await request<InvoiceCandidate>(
            `/api/accounting/invoice-candidates/${candidate.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: targetStatus }),
            }
          );

          setInvoiceCandidates((current) =>
            current.map((item) =>
              item.id === promotedCandidate.id ? promotedCandidate : item
            )
          );
          resetInvoiceCandidateEditor();
          setSuccess("Invoice candidate created and moved to accounting review.");
        } else {
          resetInvoiceCandidateEditor();
          setSuccess("Invoice candidate created from reviewed document.");
        }
      }
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : selectedInvoiceCandidateId
            ? "Unable to update invoice candidate"
            : "Unable to create invoice candidate"
      );
    } finally {
      setCreatingInvoiceCandidate(false);
    }
  };

  const handleCreateInvoiceCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitInvoiceCandidate("DRAFT");
  };

  const handleInvoiceCandidateStatus = async (
    candidate: InvoiceCandidate,
    status: "DRAFT" | "READY_FOR_ACCOUNTING_REVIEW"
  ) => {
    setCreatingInvoiceCandidate(true);
    setActiveInvoiceCandidateId(candidate.id);
    setError(null);
    setSuccess(null);

    try {
      const updatedCandidate = await request<InvoiceCandidate>(
        `/api/accounting/invoice-candidates/${candidate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );

      setInvoiceCandidates((current) =>
        current.map((item) =>
          item.id === updatedCandidate.id ? updatedCandidate : item
        )
      );

      if (selectedInvoiceCandidateId === updatedCandidate.id) {
        startInvoiceCandidateEdit(updatedCandidate);
      }

      setSuccess(
        status === "READY_FOR_ACCOUNTING_REVIEW"
          ? "Invoice candidate is ready for accounting review."
          : "Invoice candidate reopened as draft."
      );
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : "Unable to update invoice candidate"
      );
    } finally {
      setCreatingInvoiceCandidate(false);
      setActiveInvoiceCandidateId(null);
    }
  };

  const openDraftTransaction = (transaction: Transaction) => {
    setTransactions((current) => {
      const existing = current.find((item) => item.id === transaction.id);

      if (existing) {
        return current.map((item) =>
          item.id === transaction.id ? { ...existing, ...transaction } : item
        );
      }

      return [transaction, ...current].slice(0, 50);
    });
    setFocusedTransactionId(transaction.id);
    setSuccess("Draft accounting transaction opened in the Accounting tab.");
    selectTab("accounting");
  };

  const handleCreateInvoiceCandidateAccountingDraft = async (
    candidate: InvoiceCandidate
  ) => {
    if (!entityId) return;

    setCreatingInvoiceCandidate(true);
    setActiveInvoiceCandidateId(candidate.id);
    setError(null);
    setSuccess(null);

    try {
      const payload = await request<{
        candidate: InvoiceCandidate;
        transaction: Transaction;
        journalEntry: JournalEntry;
      }>(`/api/accounting/invoice-candidates/${candidate.id}/create-transaction`, {
        method: "POST",
      });

      setInvoiceCandidates((current) =>
        current.map((item) =>
          item.id === payload.candidate.id ? payload.candidate : item
        )
      );
      if (selectedInvoiceCandidateId === payload.candidate.id) {
        resetInvoiceCandidateEditor();
      }
      setTransactions((current) => {
        const existing = current.find((item) => item.id === payload.transaction.id);

        if (existing) {
          return current.map((item) =>
            item.id === payload.transaction.id ? payload.transaction : item
          );
        }

        return [payload.transaction, ...current].slice(0, 50);
      });
      setDocuments((current) =>
        current.map((item) =>
          item.id === payload.candidate.documentId
            ? {
                ...item,
                status: "LINKED",
                transaction: payload.transaction,
              }
            : item
        )
      );

      if (loadedSections.transactions) {
        await loadTransactions();
      }

      await loadEntityDetail();

      setFocusedTransactionId(payload.transaction.id);
      setSuccess("Draft accounting transaction created from invoice candidate.");
      selectTab("accounting");
    } catch (candidateError) {
      setError(
        candidateError instanceof Error
          ? candidateError.message
          : "Unable to create draft accounting transaction"
      );
    } finally {
      setCreatingInvoiceCandidate(false);
      setActiveInvoiceCandidateId(null);
    }
  };

  const handleAddAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;

    setAddingAccount(true);
    setError(null);
    setSuccess(null);

    try {
      const derivedClass =
        accountForm.accountClass.trim() || accountForm.code.trim().charAt(0);

      await request<Account>("/api/accounting/chart-of-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          code: accountForm.code,
          label: accountForm.label,
          accountClass: derivedClass,
          type: accountForm.type,
          jurisdiction: "LU",
          standard: "LUX_GAAP",
          isSystem: false,
          isActive: true,
        }),
      });

      setAccountForm(initialAccountForm());
      setAccountPreview(null);
      setSuccess("Account created.");
      resetLoaded("accounts");
      await Promise.all([loadEntityDetail(false), loadAccounts()]);
    } catch (accountError) {
      setError(
        accountError instanceof Error
          ? accountError.message
          : "Unable to create account"
      );
    } finally {
      setAddingAccount(false);
    }
  };

  const handlePreviewAccount = async () => {
    if (!entityId) return;

    setPreviewingAccount(true);
    setError(null);
    setSuccess(null);

    try {
      const preview = await request<AccountClassificationPreview>(
        "/api/accounting/chart-of-accounts/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityId,
            code: accountForm.code,
            label: accountForm.label,
            type: accountForm.type || undefined,
          }),
        }
      );

      setAccountPreview(preview);
      setAccountForm((current) => ({
        ...current,
        accountClass: preview.accountClass,
        type: preview.suggestedType || current.type,
      }));
    } catch (previewError) {
      setAccountPreview(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Unable to preview account classification"
      );
    } finally {
      setPreviewingAccount(false);
    }
  };

  const handleToggleAccount = async (account: Account) => {
    setActiveAccountId(account.id);
    setError(null);
    setSuccess(null);

    try {
      await request(`/api/accounting/chart-of-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });

      setSuccess(
        account.isActive ? "Account deactivated." : "Account activated."
      );
      resetLoaded("accounts");
      await loadAccounts();
    } catch (accountError) {
      setError(
        accountError instanceof Error
          ? accountError.message
          : "Unable to update account"
      );
    } finally {
      setActiveAccountId(null);
    }
  };

  const handleAddRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;

    setAddingRule(true);
    setError(null);
    setSuccess(null);

    try {
      await request<AccountingRule>("/api/accounting/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          transactionType: ruleForm.transactionType,
          debitAccountId: ruleForm.debitAccountId,
          creditAccountId: ruleForm.creditAccountId,
          descriptionTemplate: ruleForm.descriptionTemplate || undefined,
          priority: Number(ruleForm.priority),
          isActive: true,
        }),
      });

      setRuleForm(initialRuleForm());
      setSuccess("Accounting rule created.");
      resetLoaded("rules");
      await loadRules();
    } catch (ruleError) {
      setError(
        ruleError instanceof Error ? ruleError.message : "Unable to create rule"
      );
    } finally {
      setAddingRule(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!entityId || !selectedTemplateId) return;

    setApplyingTemplate(true);
    setError(null);
    setSuccess(null);
    setApplyTemplateResult(null);

    try {
      const result = await request<ApplyTemplateResult>(
        `/api/entities/${entityId}/apply-accounting-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: selectedTemplateId,
            mode: "SKIP_EXISTING",
          }),
        }
      );

      setApplyTemplateResult(result);
      setSuccess("Accounting template applied.");
      resetLoaded("accounts", "rules");
      await Promise.all([loadEntityDetail(false), loadAccounts(), loadRules()]);
      setSetupSubTab("accounts");
    } catch (templateError) {
      setError(
        templateError instanceof Error
          ? templateError.message
          : "Unable to apply accounting template"
      );
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handleToggleRule = async (rule: AccountingRule) => {
    setActiveRuleId(rule.id);
    setError(null);
    setSuccess(null);

    try {
      await request(`/api/accounting/rules/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });

      setSuccess(rule.isActive ? "Rule deactivated." : "Rule activated.");
      resetLoaded("rules");
      await loadRules();
    } catch (ruleError) {
      setError(
        ruleError instanceof Error ? ruleError.message : "Unable to update rule"
      );
    } finally {
      setActiveRuleId(null);
    }
  };

  const handleAddPeriod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entityId) return;
    setAddingPeriod(true);
    setError(null);
    setSuccess(null);
    try {
      await request<AccountingPeriod>("/api/accounting/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId, ...periodForm }),
      });
      setPeriodForm(initialPeriodForm());
      setSuccess("Accounting period created.");
      resetLoaded("periods");
      await loadPeriods();
    } catch (periodError) {
      setError(periodError instanceof Error ? periodError.message : "Unable to create period");
    } finally {
      setAddingPeriod(false);
    }
  };

  const handlePeriodStatus = async (
    period: AccountingPeriod,
    status: AccountingPeriod["status"]
  ) => {
    setActivePeriodId(period.id);
    setError(null);
    setSuccess(null);
    try {
      await request<AccountingPeriod>(`/api/accounting/periods/${period.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setSuccess(`Accounting period set to ${status}.`);
      resetLoaded("periods");
      await loadPeriods();
    } catch (periodError) {
      setError(periodError instanceof Error ? periodError.message : "Unable to update period");
    } finally {
      setActivePeriodId(null);
    }
  };

  const applyReportFilters = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    await loadReports(reportFilters, true);
    selectTab("reporting");
  };

  const toggleEntry = (journalEntryId: string) => {
    setExpandedEntries((current) =>
      current.includes(journalEntryId)
        ? current.filter((id) => id !== journalEntryId)
        : [...current, journalEntryId]
    );
  };

  if (loading) {
    return (
      <main className={cn(PAGE_BG, "min-h-screen px-6 py-20 text-black")}>
        <div className="mx-auto w-full max-w-[1680px]">
          <div className={cn(CARD, "animate-pulse p-8")}>
            <div className="h-6 w-40 rounded-full bg-black/5" />
            <div className="mt-6 h-10 w-72 rounded-2xl bg-black/5" />
            <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-24 rounded-3xl bg-black/5" />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!entityDetail) {
    return (
      <main className={cn(PAGE_BG, "min-h-screen px-6 py-20 text-black")}>
        <div className="mx-auto max-w-3xl">
          <div className={cn(CARD, "p-8 text-center")}>
            <h1 className="text-2xl font-bold tracking-[-0.04em]">
              Entity workspace unavailable
            </h1>
            <p className="mt-3 text-sm font-medium text-black/50">
              This entity could not be loaded with the current session.
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className={cn(BUTTON_DARK, "mt-6")}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className={cn(PAGE_BG, "min-h-screen text-black")}>
      <header className="border-b border-black/5 bg-[#ececf1]/90 backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-4 px-6 py-4 xl:px-10">
          <LogoMark />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-full border border-black px-4 py-2 text-xs font-bold text-black transition hover:bg-black hover:text-white"
            >
              Back to dashboard
            </button>
            <button
              type="button"
              onClick={async () => {
                resetLoaded();
                await loadEntityDetail(true);
                await loadTabData(activeTab, true);
              }}
              disabled={refreshing}
              className={BUTTON_DARK}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1680px] px-6 pb-20 pt-6 xl:px-10">
        <section className={cn(CARD, "p-5")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Entity workspace
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
                {entityDetail.entity.name}
              </h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-black px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-white">
                  {entityDetail.entity.type}
                </span>
                <span className="rounded-full bg-[#f4f4f7] px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-black/55">
                  {entityDetail.entity.baseCurrency}
                </span>
                <span className="rounded-full bg-[#f4f4f7] px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-black/55">
                  {entityDetail.entity.accountingStandard}
                </span>
                <span className="rounded-full bg-[#f4f4f7] px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-black/55">
                  {entityDetail.entity.country}
                </span>
              </div>
            </div>

            <div className="max-w-sm rounded-[1.25rem] border border-black/5 bg-[#f7f7f9] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/45">
                Organization
              </p>
           
              {entityDetail.entity.organization?.name && (
                <p className="mt-1 text-sm  text-center font-black text-black/45">
                  {entityDetail.entity.organization.name}
                </p>
              )}
            </div>
          </div>
        </section>

        {(error || success) && (
          <section className="mt-4 space-y-3">
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-700">
                {success}
              </div>
            )}
          </section>
        )}

        <section className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Projects" value={kpis.projects} accent />
          <KpiCard label="Transactions" value={kpis.transactions} />
          <KpiCard label="Draft entries" value={kpis.draftEntries} />
          <KpiCard label="Posted entries" value={kpis.postedEntries} />
          <KpiCard label="Counterparties" value={kpis.counterparties} />
          <KpiCard label="Documents" value={kpis.documents} />
        </section>

        <section className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-3">
            {TABS.filter(
              (tab) =>
                (tab.id !== "setup" ||
                  entityDetail.permissions.canManageAccountingSetup) &&
                (tab.id !== "reporting" || entityDetail.permissions.canViewReports)
            ).map((tab) => (
              <TabButton
                key={tab.id}
                label={tab.label}
                active={activeTab === tab.id}
                onClick={() => selectTab(tab.id)}
              />
            ))}
          </div>
        </section>

        {activeTab === "overview" && (
          <section className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className={cn(CARD, "p-5")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Quick actions
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {entityDetail.permissions.canCreateAccountingTransaction && (
                <button
                  type="button"
                  onClick={() => selectTab("accounting")}
                  className={cn(SUBCARD, "px-4 py-4 text-left transition hover:bg-white")}
                >
                  <p className="text-sm font-semibold">New transaction</p>
                  <p className="mt-1 text-xs font-medium text-black/45">
                    Create a draft journal flow
                  </p>
                </button>
                )}
                {entityDetail.permissions.canManageEntity && (
                <button
                  type="button"
                  onClick={() => selectTab("projects")}
                  className={cn(SUBCARD, "px-4 py-4 text-left transition hover:bg-white")}
                >
                  <p className="text-sm font-semibold">Add project</p>
                  <p className="mt-1 text-xs font-medium text-black/45">
                    Extend the entity workspace
                  </p>
                </button>
                )}
                {entityDetail.permissions.canManageCounterparties && (
                <button
                  type="button"
                  onClick={() => selectTab("counterparties")}
                  className={cn(SUBCARD, "px-4 py-4 text-left transition hover:bg-white")}
                >
                  <p className="text-sm font-semibold">Add counterparty</p>
                  <p className="mt-1 text-xs font-medium text-black/45">
                    Keep relationships operational
                  </p>
                </button>
                )}
                {entityDetail.permissions.canManageDocuments && (
                <button
                  type="button"
                  onClick={() => selectTab("documents")}
                  className={cn(SUBCARD, "px-4 py-4 text-left transition hover:bg-white")}
                >
                  <p className="text-sm font-semibold">Add document</p>
                  <p className="mt-1 text-xs font-medium text-black/45">
                    Link evidence to operations
                  </p>
                </button>
                )}
                {entityDetail.permissions.canViewReports && (
                <button
                  type="button"
                  onClick={() => selectTab("reporting")}
                  className={cn(SUBCARD, "px-4 py-4 text-left transition hover:bg-white sm:col-span-2")}
                >
                  <p className="text-sm font-semibold">View reporting</p>
                  <p className="mt-1 text-xs font-medium text-black/45">
                    Trial balance and general ledger
                  </p>
                </button>
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <div className={cn(CARD, "overflow-hidden")}>
                <div className="border-b border-black/5 px-5 py-4">
                  <h2 className="text-lg font-semibold tracking-[-0.03em]">
                    Recent transactions
                  </h2>
                </div>
                {!recentTransactions.length ? (
                  <p className="px-5 py-8 text-sm font-medium text-black/45">
                    No transactions yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                        <tr>
                          <th className="px-5 py-3">Date</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3 text-right">Amount</th>
                          <th className="px-5 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {recentTransactions.map((transaction) => (
                          <tr className="transition hover:bg-black/[0.02]" key={transaction.id}>
                            <td className="px-5 py-4 font-medium text-black/60">
                              {formatDate(transaction.date)}
                            </td>
                            <td className="px-4 py-4 font-semibold text-black/80">
                              {transaction.type}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                              {formatAmount(
                                transaction.amount,
                                transaction.currency
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={cn(
                                  "rounded-full px-3 py-2 text-[10px] font-semibold tracking-[0.12em]",
                                  statusClass(transaction.status)
                                )}
                              >
                                {transaction.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className={cn(CARD, "overflow-hidden")}>
                <div className="border-b border-black/5 px-5 py-4">
                  <h2 className="text-lg font-semibold tracking-[-0.03em]">
                    Recent journal entries
                  </h2>
                </div>
                {!recentJournalEntries.length ? (
                  <p className="px-5 py-8 text-sm font-medium text-black/45">
                    No journal entries yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                        <tr>
                          <th className="px-5 py-3">Date</th>
                          <th className="px-4 py-3">Description</th>
                          <th className="px-5 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {recentJournalEntries.map((entry) => (
                          <tr className="transition hover:bg-black/[0.02]" key={entry.id}>
                            <td className="px-5 py-4 font-medium text-black/60">
                              {formatDate(entry.date)}
                            </td>
                            <td className="px-4 py-4 font-semibold text-black/80">
                              {entry.description}
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className={cn(
                                  "rounded-full px-3 py-2 text-[10px] font-semibold tracking-[0.12em]",
                                  statusClass(entry.status)
                                )}
                              >
                                {entry.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "projects" && (
          <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            {entityDetail.permissions.canManageEntity && (
            <div className={cn(CARD, "p-5")}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                    Project creation
                  </p>
                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                    Add project
                  </h2>
                </div>
              </div>

              <form onSubmit={handleProjectSubmit} className="mt-5 grid gap-4">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Name
                  </span>
                  <input
                    required
                    value={projectForm.name}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Project name"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Address <span className="text-black/30">optional</span>
                  </span>
                  <input
                    value={projectForm.address}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        address: event.target.value,
                      }))
                    }
                    placeholder="Address or location"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Budget <span className="text-black/30">optional</span>
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={projectForm.budget}
                    onChange={(event) =>
                      setProjectForm((current) => ({
                        ...current,
                        budget: event.target.value,
                      }))
                    }
                    placeholder="0.00"
                    className={INPUT}
                  />
                </label>

                <div>
                  <button
                    type="submit"
                    disabled={submittingProject}
                    className={BUTTON_BLUE}
                  >
                    {submittingProject ? "Creating..." : "Add project"}
                  </button>
                </div>
              </form>
            </div>
            )}

            {entityDetail.permissions.canManageDocuments && (
              <div className={cn(CARD, "p-5")}>
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                      Invoice loop
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                      {selectedInvoiceCandidateId
                        ? "Edit Invoice Candidate"
                        : "Invoice Candidate"}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-black/45">
                      {selectedInvoiceCandidateId
                        ? "Update the draft details, then move the candidate into accounting review once the minimum evidence is present."
                        : "Turn a reviewed invoice document into a structured draft candidate for accounting review."}
                    </p>
                  </div>
                  {(selectedInvoiceCandidateDocumentId || selectedInvoiceCandidateId) && (
                    <button
                      type="button"
                      onClick={resetInvoiceCandidateEditor}
                      className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-black/60 transition hover:border-black hover:text-black"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!reviewedInvoiceDocuments.length &&
                !selectedInvoiceCandidateDocumentId &&
                !selectedInvoiceCandidateId ? (
                  <p className="mt-5 text-sm font-medium text-black/45">
                    No reviewed invoice documents are ready to become candidates yet.
                  </p>
                ) : (
                  <>
                    {!selectedInvoiceCandidateDocumentId &&
                      !selectedInvoiceCandidateId &&
                      reviewedInvoiceDocuments.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {reviewedInvoiceDocuments.map((document) => (
                          <button
                            key={document.id}
                            type="button"
                            onClick={() => startInvoiceCandidate(document)}
                            className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/65 transition hover:border-blue-500 hover:text-blue-600"
                          >
                            {documentDisplayName(document)}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedInvoiceCandidateDocumentId && (
                      <form
                        onSubmit={handleCreateInvoiceCandidate}
                        className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
                      >
                        <label className="xl:col-span-2">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Reviewed document
                          </span>
                          <select
                            value={invoiceCandidateForm.documentId}
                            disabled={Boolean(selectedInvoiceCandidateId)}
                            onChange={(event) => {
                              if (selectedInvoiceCandidateId) return;
                              const selectedDocument = reviewedInvoiceDocuments.find(
                                (document) => document.id === event.target.value
                              );
                              if (!selectedDocument) return;
                              startInvoiceCandidate(selectedDocument);
                            }}
                            className={INPUT}
                          >
                            {reviewedInvoiceDocuments
                              .concat(
                                documents.filter(
                                  (document) =>
                                    document.id === selectedInvoiceCandidateDocumentId &&
                                    isInvoiceDocumentType(document.type) &&
                                    document.status === "REVIEWED"
                                )
                              )
                              .filter(
                                (document, index, current) =>
                                  current.findIndex((item) => item.id === document.id) === index
                              )
                              .map((document) => (
                                <option key={document.id} value={document.id}>
                                  {documentDisplayName(document)}
                                </option>
                              ))}
                          </select>
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Candidate type
                          </span>
                          <select
                            value={invoiceCandidateForm.type}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                type: event.target.value,
                              }))
                            }
                            className={INPUT}
                          >
                            <option value="SUPPLIER">SUPPLIER</option>
                            <option value="CUSTOMER">CUSTOMER</option>
                          </select>
                        </label>

                        {selectedInvoiceCandidateId && (
                          <div className="flex items-end">
                            <span
                              className={cn(
                                "rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                invoiceCandidateStatusClass(
                                  invoiceCandidateForm.status || "DRAFT"
                                )
                              )}
                            >
                              {invoiceCandidateStatusLabel(
                                invoiceCandidateForm.status || "DRAFT"
                              )}
                            </span>
                          </div>
                        )}

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Counterparty
                          </span>
                          <select
                            value={invoiceCandidateForm.counterpartyId}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                counterpartyId: event.target.value,
                              }))
                            }
                            className={INPUT}
                          >
                            <option value="">No counterparty selected</option>
                            {counterparties.map((counterparty) => (
                              <option key={counterparty.id} value={counterparty.id}>
                                {counterparty.name} — {counterparty.type}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Invoice number <span className="text-black/30">optional</span>
                          </span>
                          <input
                            value={invoiceCandidateForm.invoiceNumber}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                invoiceNumber: event.target.value,
                              }))
                            }
                            placeholder="INV-2026-001"
                            className={INPUT}
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Invoice date
                          </span>
                          <input
                            type="date"
                            value={invoiceCandidateForm.invoiceDate}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                invoiceDate: event.target.value,
                              }))
                            }
                            className={INPUT}
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Due date <span className="text-black/30">optional</span>
                          </span>
                          <input
                            type="date"
                            value={invoiceCandidateForm.dueDate}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                dueDate: event.target.value,
                              }))
                            }
                            className={INPUT}
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Currency
                          </span>
                          <input
                            value={invoiceCandidateForm.currency}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                currency: event.target.value.toUpperCase(),
                              }))
                            }
                            className={INPUT}
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Subtotal <span className="text-black/30">optional</span>
                          </span>
                          <input
                            value={invoiceCandidateForm.subtotal}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                subtotal: event.target.value,
                              }))
                            }
                            placeholder="1000.00"
                            className={INPUT}
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            VAT amount <span className="text-black/30">optional</span>
                          </span>
                          <input
                            value={invoiceCandidateForm.vatAmount}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                vatAmount: event.target.value,
                              }))
                            }
                            placeholder="170.00"
                            className={INPUT}
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Total amount
                          </span>
                          <input
                            value={invoiceCandidateForm.totalAmount}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                totalAmount: event.target.value,
                              }))
                            }
                            placeholder="1170.00"
                            className={INPUT}
                          />
                        </label>

                        <label className="xl:col-span-4">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                            Description <span className="text-black/30">optional</span>
                          </span>
                          <input
                            value={invoiceCandidateForm.description}
                            onChange={(event) =>
                              setInvoiceCandidateForm((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                            placeholder="Administration fees Q2 2026"
                            className={INPUT}
                          />
                        </label>

                        <div className="xl:col-span-4 flex flex-wrap gap-3">
                          <button
                            type="submit"
                            disabled={creatingInvoiceCandidate}
                            className={BUTTON_BLUE}
                          >
                            {creatingInvoiceCandidate
                              ? selectedInvoiceCandidateId
                                ? "Saving..."
                                : "Creating..."
                              : selectedInvoiceCandidateId
                                ? "Save draft"
                                : "Create invoice candidate"}
                          </button>
                          <button
                            type="button"
                            disabled={creatingInvoiceCandidate}
                            onClick={() =>
                              submitInvoiceCandidate("READY_FOR_ACCOUNTING_REVIEW")
                            }
                            className={BUTTON_DARK}
                          >
                            {creatingInvoiceCandidate
                              ? "Saving..."
                              : selectedInvoiceCandidateId
                                ? "Save & mark ready"
                                : "Create & mark ready"}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="flex flex-col gap-4 border-b border-black/5 px-5 py-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Projects
                  </h2>
                  <p className="mt-1 text-sm font-medium text-black/45">
                    Search and review entity projects.
                  </p>
                </div>

                <div className="w-full md:max-w-sm">
                  <input
                    value={projectSearch}
                    onChange={(event) => setProjectSearch(event.target.value)}
                    placeholder="Search projects"
                    className={INPUT}
                  />
                </div>
              </div>

              {!filteredProjects.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  No projects yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                      <tr>
                        <th className="px-5 py-3">Project</th>
                        <th className="px-4 py-3">Address</th>
                        <th className="px-4 py-3 text-right">Budget</th>
                        <th className="px-5 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {filteredProjects.map((project) => (
                        <tr className="transition hover:bg-black/[0.02]" key={project.id}>
                          <td className="px-5 py-4 font-semibold">
                            {project.name}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {project.address || "—"}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                            {project.budget
                              ? formatAmount(
                                  project.budget,
                                  entityDetail.entity.baseCurrency
                                )
                              : "—"}
                          </td>
                          <td className="px-5 py-4 font-medium text-black/60">
                            {formatDate(project.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "accounting" && (
          <section className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            {entityDetail.permissions.canCreateAccountingTransaction && (
            <div className={cn(CARD, "p-5")}>
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                    New operation
                  </p>
                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                    Create transaction
                  </h2>
                </div>
                <p className="max-w-md text-sm font-semibold leading-6 text-black/45">
                  Draft journal entries are generated from deterministic rules.
                </p>
              </div>

              <form
                onSubmit={handleTransactionSubmit}
                className="mt-5 grid gap-4 md:grid-cols-2"
              >
                <label className="md:col-span-2">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Transaction type
                  </span>
                  <select
                    value={transactionForm.type}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    {TRANSACTION_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Amount
                  </span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={transactionForm.amount}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    placeholder="0.00"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Currency
                  </span>
                  <input
                    value={transactionForm.currency}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Date
                  </span>
                  <input
                    type="date"
                    value={transactionForm.date}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                    className={INPUT}
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Description
                  </span>
                  <input
                    value={transactionForm.description}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Describe this transaction"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Project <span className="text-black/30">optional</span>
                  </span>
                  <select
                    value={transactionForm.projectId}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        projectId: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    <option value="">No project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Counterparty <span className="text-black/30">optional</span>
                  </span>
                  <select
                    value={transactionForm.counterpartyId}
                    onChange={(event) =>
                      setTransactionForm((current) => ({
                        ...current,
                        counterpartyId: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    <option value="">No counterparty</option>
                    {counterparties.map((counterparty) => (
                      <option key={counterparty.id} value={counterparty.id}>
                        {counterparty.name} — {counterparty.type}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={submittingTransaction}
                    className={BUTTON_BLUE}
                  >
                    {submittingTransaction
                      ? "Creating..."
                      : "Create transaction"}
                  </button>
                </div>
              </form>
            </div>
            )}

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="border-b border-black/5 px-5 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Transactions
                  </h2>
                  {focusedTransactionId && (
                    <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                      Focused draft transaction
                    </span>
                  )}
                </div>
              </div>
              {!transactions.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  No transactions yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                      <tr>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-5 py-3">Counterparty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {transactions.map((transaction) => (
                        <tr
                          id={`transaction-${transaction.id}`}
                          className={cn(
                            "transition hover:bg-black/[0.02]",
                            focusedTransactionId === transaction.id &&
                              "bg-blue-50/60 ring-1 ring-inset ring-blue-500/20"
                          )}
                          key={transaction.id}
                        >
                          <td className="px-5 py-4 font-medium text-black/60">
                            {formatDate(transaction.date)}
                          </td>
                          <td className="px-4 py-4 font-semibold text-black/80">
                            {transaction.type}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                            {formatAmount(
                              transaction.amount,
                              transaction.currency
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                "rounded-full px-3 py-2 text-[10px] font-semibold tracking-[0.12em]",
                                statusClass(transaction.status)
                              )}
                            >
                              {transaction.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-medium text-black/60">
                            {transaction.counterparty?.name || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "journal" && (
          <section className={cn(CARD, "mt-4 overflow-hidden")}>
            <div className="flex flex-col gap-4 border-b border-black/5 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                  Journal control
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                  Journal entries
                </h2>
              </div>
              <button
                type="button"
                disabled={refreshing}
                onClick={async () => {
                  resetLoaded("journalEntries");
                  setRefreshing(true);
                  try {
                    await loadJournalEntries();
                  } finally {
                    setRefreshing(false);
                  }
                }}
                className={BUTTON_DARK}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            {!journalEntries.length ? (
              <p className="px-5 py-10 text-sm font-medium text-black/45">
                No journal entries yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    <tr>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                      <th className="px-4 py-3 text-center">Lines</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {journalEntries.map((entry) => {
                      const isExpanded = expandedEntries.includes(entry.id);
                      const currency = entry.lines[0]?.currency || "EUR";
                      const entryIsLoading = activeEntryId === entry.id;

                      return (
                        <Fragment key={entry.id}>
                          <tr className="transition hover:bg-[#fafafd]">
                            <td className="px-5 py-4 font-medium text-black/60">
                              {formatDate(entry.date)}
                            </td>
                            <td className="min-w-[240px] px-4 py-4 font-medium text-black/75">
                              {entry.description}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={cn(
                                  "rounded-full px-3 py-2 text-[10px] font-semibold tracking-[0.12em]",
                                  statusClass(entry.status)
                                )}
                              >
                                {entry.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                              {formatAmount(total(entry.lines, "debit"), currency)}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                              {formatAmount(total(entry.lines, "credit"), currency)}
                            </td>
                            <td className="px-4 py-4 text-center font-bold text-black/55">
                              {entry.lines.length}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleEntry(entry.id)}
                                  className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold transition hover:border-black hover:bg-black hover:text-white"
                                >
                                  {isExpanded ? "Hide" : "Lines"}
                                </button>
                                {entry.status === "DRAFT" &&
                                  entityDetail.permissions.canPostJournalEntry && (
                                  <button
                                    type="button"
                                    disabled={entryIsLoading}
                                    onClick={() =>
                                      handleEntryAction(entry.id, "post")
                                    }
                                    className="rounded-full bg-blue-500 px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                                  >
                                    {entryIsLoading ? "Posting..." : "Post"}
                                  </button>
                                )}
                                {entry.status === "POSTED" &&
                                  entityDetail.permissions.canReverseJournalEntry && (
                                  <button
                                    type="button"
                                    disabled={entryIsLoading}
                                    onClick={() =>
                                      handleEntryAction(entry.id, "reverse")
                                    }
                                    className="rounded-full bg-black px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                                  >
                                    {entryIsLoading ? "Reversing..." : "Reverse"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-[#f7f7f9] px-5 py-4">
                                <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                                  <table className="min-w-full text-left text-xs">
                                    <thead className="bg-black text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
                                      <tr>
                                        <th className="px-4 py-3">Account</th>
                                        <th className="px-4 py-3">Label</th>
                                        <th className="px-4 py-3">Project</th>
                                        <th className="px-4 py-3">Counterparty</th>
                                        <th className="px-4 py-3 text-right">Debit</th>
                                        <th className="px-4 py-3 text-right">Credit</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5">
                                      {entry.lines.map((line) => (
                                        <tr className="transition hover:bg-black/[0.02]" key={line.id}>
                                          <td className="px-4 py-4 font-mono font-bold">
                                            {line.account?.code || "—"}
                                          </td>
                                          <td className="px-4 py-4 font-medium text-black/75">
                                            {line.account?.label || "—"}
                                          </td>
                                          <td className="px-4 py-4 font-medium text-black/60">
                                            {line.project?.name || "—"}
                                          </td>
                                          <td className="px-4 py-4 font-medium text-black/60">
                                            {line.counterparty?.name || "—"}
                                          </td>
                                          <td className="px-4 py-4 text-right font-mono">
                                            {formatAmount(line.debit, line.currency)}
                                          </td>
                                          <td className="px-4 py-4 text-right font-mono">
                                            {formatAmount(line.credit, line.currency)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === "counterparties" && (
          <section className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            {entityDetail.permissions.canManageCounterparties && (
            <div className={cn(CARD, "p-5")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Business network
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                Add counterparty
              </h2>

              <form onSubmit={handleAddCounterparty} className="mt-5 grid gap-4">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Name
                  </span>
                  <input
                    required
                    value={counterpartyForm.name}
                    onChange={(event) =>
                      setCounterpartyForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Counterparty name"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Type
                  </span>
                  <select
                    value={counterpartyForm.type}
                    onChange={(event) =>
                      setCounterpartyForm((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    {COUNTERPARTY_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Email <span className="text-black/30">optional</span>
                  </span>
                  <input
                    type="email"
                    value={counterpartyForm.email}
                    onChange={(event) =>
                      setCounterpartyForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="contact@company.com"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    VAT number <span className="text-black/30">optional</span>
                  </span>
                  <input
                    value={counterpartyForm.vatNumber}
                    onChange={(event) =>
                      setCounterpartyForm((current) => ({
                        ...current,
                        vatNumber: event.target.value,
                      }))
                    }
                    placeholder="VAT number"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Country
                  </span>
                  <input
                    value={counterpartyForm.country}
                    onChange={(event) =>
                      setCounterpartyForm((current) => ({
                        ...current,
                        country: event.target.value.toUpperCase(),
                      }))
                    }
                    className={INPUT}
                  />
                </label>

                <div>
                  <button
                    type="submit"
                    disabled={addingCounterparty}
                    className={BUTTON_BLUE}
                  >
                    {addingCounterparty ? "Adding..." : "Add counterparty"}
                  </button>
                </div>
              </form>
            </div>
            )}

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="border-b border-black/5 px-5 py-4">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">
                  Counterparties
                </h2>
              </div>
              {!counterparties.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  No counterparties yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                      <tr>
                        <th className="px-5 py-3">Name</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-5 py-3">Country</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {counterparties.map((counterparty) => (
                        <tr className="transition hover:bg-black/[0.02]" key={counterparty.id}>
                          <td className="px-5 py-4 font-semibold">
                            {counterparty.name}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {counterparty.type}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {counterparty.email || "—"}
                          </td>
                          <td className="px-5 py-4 font-medium text-black/60">
                            {counterparty.country || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "documents" && (
          <section className="mt-4 grid gap-4">
            {entityDetail.permissions.canManageDocuments && (
            <div className={cn(CARD, "p-5")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Entity records
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                Upload document
              </h2>

              <form
                onSubmit={handleAddDocument}
                className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                <label className="md:col-span-2 xl:col-span-2">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    File
                  </span>
                  <input
                    key={documentFileInputKey}
                    required
                    type="file"
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        file: event.target.files?.[0] || null,
                      }))
                    }
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx,.doc,.docx,application/pdf,image/png,image/jpeg,image/webp,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className={INPUT}
                  />
                  <span className="mt-2 block text-xs font-medium text-black/40">
                    PDF, image, CSV, Excel or Word. Max 10 MB.
                  </span>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Type
                  </span>
                  <select
                    value={documentForm.type}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        type: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Title <span className="text-black/30">optional</span>
                  </span>
                  <input
                    value={documentForm.title}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Supplier invoice January 2026"
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Counterparty <span className="text-black/30">optional</span>
                  </span>
                  <select
                    value={documentForm.counterpartyId}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        counterpartyId: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    <option value="">No counterparty</option>
                    {counterparties.map((counterparty) => (
                      <option key={counterparty.id} value={counterparty.id}>
                        {counterparty.name} — {counterparty.type}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Transaction <span className="text-black/30">optional</span>
                  </span>
                  <select
                    value={documentForm.transactionId}
                    onChange={(event) =>
                      setDocumentForm((current) => ({
                        ...current,
                        transactionId: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    <option value="">No transaction</option>
                    {transactions.map((transaction) => (
                      <option key={transaction.id} value={transaction.id}>
                        {transaction.type} —{" "}
                        {formatAmount(transaction.amount, transaction.currency)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="xl:col-span-4">
                  <button
                    type="submit"
                    disabled={addingDocument}
                    className={BUTTON_BLUE}
                  >
                    {addingDocument ? "Uploading..." : "Upload document"}
                  </button>
                </div>
              </form>
            </div>
            )}

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">
                  Documents
                </h2>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
                    Pending {documentReviewSummary.pending}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                    Reviewed {documentReviewSummary.reviewed}
                  </span>
                  <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-600">
                    Exceptions {documentReviewSummary.exceptions}
                  </span>
                </div>
              </div>
              <div className="border-b border-black/5 px-5 py-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                      Operational queue
                    </p>
                    <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-black">
                      Review Queue
                    </h3>
                    <p className="mt-1 text-sm font-medium text-black/45">
                      Documents grouped by review status for faster operational follow-up.
                    </p>
                  </div>
                  {!entityDetail.permissions.canManageDocuments && (
                    <p className="text-sm font-medium text-black/45">
                      Read-only view. Status changes are limited to permitted internal users.
                    </p>
                  )}
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-3">
                  {REVIEW_QUEUE_GROUPS.map((group) => {
                    const groupDocuments =
                      group.id === "pending"
                        ? documentReviewQueue.pending
                        : group.id === "exceptions"
                          ? documentReviewQueue.exceptions
                          : documentReviewQueue.reviewed;

                    return (
                      <div key={group.id} className={cn(SUBCARD, "p-4")}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-black/80">
                              {group.title}
                            </p>
                            <p className="mt-1 text-xs font-medium leading-5 text-black/45">
                              {group.description}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                              group.badgeClass
                            )}
                          >
                            {groupDocuments.length}
                          </span>
                        </div>

                        {!groupDocuments.length ? (
                          <p className="mt-5 text-sm font-medium text-black/40">
                            No documents in this queue.
                          </p>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {groupDocuments.map((document) => (
                              <div
                                key={document.id}
                                className="rounded-[1rem] border border-black/8 bg-white px-4 py-3 shadow-[0_6px_20px_rgba(15,23,42,0.03)]"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-black/80">
                                      {documentDisplayName(document)}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-black/45">
                                      <span>{formatDate(document.createdAt)}</span>
                                      <span className="text-black/20">•</span>
                                      <span>{document.type}</span>
                                      {document.counterparty?.name && (
                                        <>
                                          <span className="text-black/20">•</span>
                                          <span>{document.counterparty.name}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={cn(
                                      "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                      documentStatusClass(document.status)
                                    )}
                                  >
                                    {document.status}
                                  </span>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <a
                                    href={documentDownloadUrl(document)}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    onClick={(event) => handleOpenDocument(event, document)}
                                    className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold transition hover:border-black hover:bg-black hover:text-white"
                                  >
                                    {openingDocumentId === document.id ? "Opening..." : "Open"}
                                  </a>

                                  {entityDetail.permissions.canManageDocuments &&
                                    documentQueueActions(document.status).map((action) => (
                                      <button
                                        key={`${document.id}-${action.status}`}
                                        type="button"
                                        disabled={activeDocumentId === document.id}
                                        onClick={() =>
                                          handleDocumentStatus(document, action.status)
                                        }
                                        className="rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/65 transition hover:border-blue-500 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {activeDocumentId === document.id
                                          ? "Updating..."
                                          : action.label}
                                      </button>
                                    ))}
                                  {entityDetail.permissions.canManageDocuments &&
                                    document.status === "REVIEWED" &&
                                    isInvoiceDocumentType(document.type) &&
                                    !invoiceCandidateDocumentIds.has(document.id) && (
                                      <button
                                        type="button"
                                        onClick={() => startInvoiceCandidate(document)}
                                        className="rounded-full border border-blue-500/20 bg-blue-50 px-3 py-2 text-[10px] font-semibold text-blue-700 transition hover:border-blue-500 hover:bg-blue-500 hover:text-white"
                                      >
                                        Create candidate
                                      </button>
                                    )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="border-b border-black/5 px-5 py-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                      Invoice loop
                    </p>
                    <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-black">
                      Invoice Candidates
                    </h3>
                    <p className="mt-1 text-sm font-medium text-black/45">
                      Structured draft invoices created from reviewed documents.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                    {invoiceCandidates.length} total
                  </span>
                </div>

                {!invoiceCandidates.length ? (
                  <p className="mt-5 text-sm font-medium text-black/45">
                    No invoice candidates yet.
                  </p>
                ) : (
                  <div className="mt-5 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                        <tr>
                          <th className="px-4 py-3">Invoice date</th>
                          <th className="px-4 py-3">Document</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Counterparty</th>
                          <th className="px-4 py-3">Number</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Total</th>
                          {entityDetail.permissions.canManageDocuments && (
                            <th className="px-5 py-3 text-right">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {invoiceCandidates.map((candidate) => (
                          <tr key={candidate.id} className="transition hover:bg-black/[0.02]">
                            <td className="px-4 py-4 font-medium text-black/60">
                              {formatDate(candidate.invoiceDate)}
                            </td>
                            <td className="px-4 py-4 font-semibold text-black/80">
                              {candidate.document
                                ? candidate.document.title ||
                                  candidate.document.originalFilename ||
                                  "Reviewed document"
                                : "Reviewed document"}
                            </td>
                            <td className="px-4 py-4 font-semibold text-black/80">
                              {candidate.type}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {candidate.counterparty?.name || "—"}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {candidate.invoiceNumber || "—"}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                  invoiceCandidateStatusClass(candidate.status)
                                )}
                              >
                                {invoiceCandidateStatusLabel(candidate.status)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right font-semibold text-black/80">
                              {formatAmount(candidate.totalAmount, candidate.currency)}
                            </td>
                            {entityDetail.permissions.canManageDocuments && (
                              <td className="px-5 py-4">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {candidate.status !== "ACCOUNTING_DRAFT_CREATED" && (
                                    <button
                                      type="button"
                                      onClick={() => startInvoiceCandidateEdit(candidate)}
                                      className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold text-black/65 transition hover:border-black hover:text-black"
                                    >
                                      Edit
                                    </button>
                                  )}
                                  {candidate.status === "DRAFT" ? (
                                    <button
                                      type="button"
                                      disabled={creatingInvoiceCandidate}
                                      onClick={() =>
                                        handleInvoiceCandidateStatus(
                                          candidate,
                                          "READY_FOR_ACCOUNTING_REVIEW"
                                        )
                                      }
                                      className="rounded-full border border-blue-500/20 bg-blue-50 px-3 py-2 text-[10px] font-semibold text-blue-700 transition hover:border-blue-500 hover:bg-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {creatingInvoiceCandidate &&
                                      activeInvoiceCandidateId === candidate.id
                                        ? "Updating..."
                                        : "Mark ready"}
                                    </button>
                                  ) : candidate.status === "READY_FOR_ACCOUNTING_REVIEW" ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={creatingInvoiceCandidate}
                                        onClick={() =>
                                          handleCreateInvoiceCandidateAccountingDraft(candidate)
                                        }
                                        className="rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700 transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {creatingInvoiceCandidate &&
                                        activeInvoiceCandidateId === candidate.id
                                          ? "Creating..."
                                          : "Create draft"}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={creatingInvoiceCandidate}
                                        onClick={() =>
                                          handleInvoiceCandidateStatus(candidate, "DRAFT")
                                        }
                                        className="rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/65 transition hover:border-black hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {creatingInvoiceCandidate &&
                                        activeInvoiceCandidateId === candidate.id
                                          ? "Updating..."
                                          : "Reopen"}
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          candidate.document?.transaction &&
                                          openDraftTransaction({
                                            id: candidate.document.transaction.id,
                                            date: candidate.document.transaction.date,
                                            type: candidate.document.transaction.type,
                                            amount: candidate.document.transaction.amount,
                                            currency: candidate.document.transaction.currency,
                                            status: candidate.document.transaction.status,
                                            description:
                                              candidate.document.transaction.description || undefined,
                                            counterparty: candidate.counterparty || undefined,
                                          })
                                        }
                                        className="rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-700 transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
                                      >
                                        Open draft
                                      </button>
                                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                        Draft created
                                      </span>
                                    </>
                                  )}
                                  {candidate.status !== "DRAFT" &&
                                  candidate.status !== "READY_FOR_ACCOUNTING_REVIEW" &&
                                  candidate.document?.transaction ? (
                                    <span className="text-[10px] font-medium text-black/50">
                                      {candidate.document.transaction.type}{" "}
                                      {formatAmount(
                                        candidate.document.transaction.amount,
                                        candidate.document.transaction.currency
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {!documents.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  No documents yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                      <tr>
                        <th className="px-5 py-3">Created</th>
                        <th className="px-4 py-3">Title</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">File</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Counterparty</th>
                        <th className="px-4 py-3">Transaction</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {documents.map((document) => (
                        <tr className="transition hover:bg-black/[0.02]" key={document.id}>
                          <td className="px-5 py-4 font-medium text-black/60">
                            {formatDate(document.createdAt)}
                          </td>
                          <td className="px-4 py-4 font-semibold text-black/80">
                            {documentDisplayName(document)}
                          </td>
                          <td className="px-4 py-4 font-semibold text-black/80">
                            {document.type}
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                documentStatusClass(document.status)
                              )}
                            >
                              {document.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {document.originalFilename || "Stored document"}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {formatFileSize(document.fileSize)}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {document.counterparty?.name || "—"}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {document.transaction?.type || "—"}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {entityDetail.permissions.canManageDocuments && (
                                <select
                                  value={document.status}
                                  disabled={activeDocumentId === document.id}
                                  onChange={(event) =>
                                    handleDocumentStatus(document, event.target.value)
                                  }
                                  className="rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/65 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {DOCUMENT_REVIEW_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <a
                                href={documentDownloadUrl(document)}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={(event) => handleOpenDocument(event, document)}
                                className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold transition hover:border-black hover:bg-black hover:text-white"
                              >
                                {openingDocumentId === document.id ? "Opening..." : "Open"}
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "reporting" && (
          <section className="mt-4 grid gap-4">
            <div className={cn(CARD, "p-5")}>
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                    Accounting reports
                  </p>
                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                    Reporting
                  </h2>
                  <p className="mt-1 text-sm font-medium text-black/45">
                    General ledger and trial balance based on posted entries
                    only.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={reportsLoading}
                  onClick={() => loadReports(reportFilters, true)}
                  className={BUTTON_DARK}
                >
                  {reportsLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              <form
                onSubmit={applyReportFilters}
                className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Accounting period
                  </span>
                  <select
                    value={reportFilters.periodId}
                    onChange={(event) =>
                      setReportFilters((current) => ({
                        ...current,
                        periodId: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    <option value="">Custom date range</option>
                    {periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name} · {period.status}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Start date
                  </span>
                  <input
                    type="date"
                    value={reportFilters.startDate}
                    onChange={(event) =>
                      setReportFilters((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    End date
                  </span>
                  <input
                    type="date"
                    value={reportFilters.endDate}
                    onChange={(event) =>
                      setReportFilters((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                    className={INPUT}
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    General ledger account filter
                  </span>
                  <select
                    value={reportFilters.accountId}
                    onChange={(event) =>
                      setReportFilters((current) => ({
                        ...current,
                        accountId: event.target.value,
                      }))
                    }
                    className={INPUT}
                  >
                    <option value="">All accounts</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} — {account.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="xl:col-span-4">
                  <button
                    type="submit"
                    disabled={reportsLoading}
                    className={BUTTON_BLUE}
                  >
                    {reportsLoading ? "Applying..." : "Apply filters"}
                  </button>
                </div>
              </form>
            </div>

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="border-b border-black/5 px-5 py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <h2 className="text-xl font-semibold tracking-[-0.03em]">
                    Trial Balance
                  </h2>
                  <span
                    className={cn(
                      "rounded-full px-3 py-2 text-[10px] font-semibold tracking-[0.12em]",
                      trialBalance?.totals.balanced
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    )}
                  >
                    {trialBalance?.totals.balanced ? "BALANCED" : "UNBALANCED"}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 border-b border-black/5 px-5 py-4 md:grid-cols-4">
                <div className={cn(SUBCARD, "px-4 py-4")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Total debit
                  </p>
                  <p className="mt-3 text-xl font-semibold">
                    {formatAmount(trialBalance?.totals.debit || "0")}
                  </p>
                </div>
                <div className={cn(SUBCARD, "px-4 py-4")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Total credit
                  </p>
                  <p className="mt-3 text-xl font-semibold">
                    {formatAmount(trialBalance?.totals.credit || "0")}
                  </p>
                </div>
                <div className={cn(SUBCARD, "px-4 py-4")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Difference
                  </p>
                  <p className="mt-3 text-xl font-semibold">
                    {formatAmount(trialBalance?.totals.difference || "0")}
                  </p>
                </div>
                <div className={cn(SUBCARD, "px-4 py-4")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Accounts
                  </p>
                  <p className="mt-3 text-xl font-semibold">
                    {trialBalance?.accounts.length || 0}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-b border-black/5 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <p className="text-sm font-medium text-black/50">
                  Showing{" "}
                  <span className="font-semibold text-black/75">
                    {visibleTrialBalanceRows.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-black/75">
                    {trialBalanceRows.length}
                  </span>{" "}
                  accounts
                </p>
                <label className="inline-flex w-fit cursor-pointer items-center gap-3 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/60 transition hover:border-black/20 hover:text-black">
                  <input
                    type="checkbox"
                    checked={showZeroBalanceAccounts}
                    onChange={(event) =>
                      setShowZeroBalanceAccounts(event.target.checked)
                    }
                    className="h-4 w-4 accent-blue-500"
                  />
                  Show all accounts
                </label>
              </div>

              {!visibleTrialBalanceRows.length ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm font-semibold text-black/70">
                    No account activity for this period.
                  </p>
                  <p className="mt-2 text-sm font-medium text-black/45">
                    Use “Show all accounts” to display the full chart of
                    accounts returned by the report.
                  </p>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    <tr>
                      <th className="px-5 py-3">Account</th>
                      <th className="px-4 py-3">Label</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                      <th className="px-5 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {visibleTrialBalanceRows.map((account) => (
                      <tr className="transition hover:bg-black/[0.02]" key={account.accountId}>
                        <td className="px-5 py-4 font-mono font-bold">
                          {account.accountCode}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/75">
                          {account.accountLabel}
                        </td>
                        <td className="px-4 py-4 font-medium text-black/60">
                          {account.accountType}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                          {formatAmount(account.debit)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                          {formatAmount(account.credit)}
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-xs font-bold">
                          {formatAmount(account.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>

            <div className={cn(CARD, "overflow-hidden")}>
              <div className="border-b border-black/5 px-5 py-4">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">
                  General Ledger
                </h2>
              </div>
              {!generalLedger?.lines.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  No posted ledger lines match the current filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                      <tr>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-4 py-3">Account</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Counterparty</th>
                        <th className="px-4 py-3">Project</th>
                        <th className="px-4 py-3 text-right">Debit</th>
                        <th className="px-5 py-3 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {generalLedger.lines.map((line, index) => (
                        <tr className="transition hover:bg-black/[0.02]" key={`${line.journalEntryId}-${line.accountId}-${index}`}>
                          <td className="px-5 py-4 font-medium text-black/60">
                            {formatDate(line.journalEntryDate)}
                          </td>
                          <td className="px-4 py-4 font-mono text-xs font-bold">
                            {line.accountCode}
                          </td>
                          <td className="min-w-[240px] px-4 py-4 font-medium text-black/75">
                            {line.lineDescription ||
                              line.journalEntryDescription ||
                              line.accountLabel}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {line.counterpartyName || "—"}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {line.projectName || "—"}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                            {formatAmount(line.debit, line.currency)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs font-bold">
                            {formatAmount(line.credit, line.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "audit" && (
          <section className="mt-4">
            <div className={cn(CARD, "overflow-hidden")}>
              <div className="border-b border-black/5 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                  Internal control
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                  Audit Trail
                </h2>
                <p className="mt-1 text-sm font-medium text-black/45">
                  Latest financial and administrative events for this entity.
                </p>
              </div>
              {!auditLogs.length ? (
                <p className="px-5 py-10 text-sm font-medium text-black/45">
                  No audit events yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                      <tr>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Resource</th>
                        <th className="px-4 py-3">User</th>
                        <th className="px-5 py-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {auditLogs.map((auditLog) => (
                        <tr className="transition hover:bg-black/[0.02]" key={auditLog.id}>
                          <td className="whitespace-nowrap px-5 py-4 font-medium text-black/60">
                            {formatDate(auditLog.createdAt)}
                          </td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-blue-50 px-3 py-2 text-[10px] font-medium text-blue-700">
                              {auditLog.action}
                            </span>
                          </td>
                          <td className="px-4 py-4 font-semibold text-black/80">
                            {auditLog.resourceType}
                            {auditLog.resourceId ? (
                              <span className="ml-2 font-mono text-[10px] font-semibold text-black/35">
                                {auditLog.resourceId}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 font-medium text-black/60">
                            {auditLog.user?.email || "System"}
                          </td>
                          <td className="max-w-[520px] px-5 py-4 font-mono text-[11px] text-black/50">
                            {auditLog.metadata
                              ? JSON.stringify(auditLog.metadata)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "setup" && (
          <section className="mt-4 space-y-4">
            <div className={cn(CARD, "p-5")}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                Accounting setup
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                Accounting Setup
              </h2>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-black/55">
                Manage chart of accounts and rule-based journal generation.
              </p>
            </div>

            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-3">
                {SETUP_TABS.map((tab) => (
                  <TabButton
                    key={tab.id}
                    label={tab.label}
                    active={setupSubTab === tab.id}
                    onClick={() => setSetupSubTab(tab.id)}
                  />
                ))}
              </div>
            </div>

            {setupSubTab === "initialization" && (
            <div className={cn(CARD, "p-5")}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                    Accounting initialization
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                    Apply a controlled template
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-black/55">
                    Start from a Proliquid-managed accounting baseline, then keep
                    managing entity-specific accounts and rules below.
                  </p>
                </div>
                <span
                  className={cn(
                    "w-fit rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]",
                    entityDetail?.entity.accountingInitializedAt
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  )}
                >
                  {entityDetail?.entity.accountingInitializedAt
                    ? "Initialized"
                    : "Not initialized"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className={cn(SUBCARD, "p-4")}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Applied template
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {entityDetail?.entity.accountingTemplate
                      ? `${entityDetail.entity.accountingTemplate.name} v${entityDetail.entity.accountingTemplate.version}`
                      : "—"}
                  </p>
                </div>
                <div className={cn(SUBCARD, "p-4")}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Initialized
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {entityDetail?.entity.accountingInitializedAt
                      ? formatDate(entityDetail.entity.accountingInitializedAt)
                      : "—"}
                  </p>
                </div>
                <div className={cn(SUBCARD, "p-4")}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Accounts
                  </p>
                  <p className="mt-2 text-xl font-semibold">{accounts.length}</p>
                </div>
                <div className={cn(SUBCARD, "p-4")}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    Rules
                  </p>
                  <p className="mt-2 text-xl font-semibold">{rules.length}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                    Accounting template
                  </span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    className={INPUT}
                  >
                    <option value="">Select template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} v{template.version} · {template.standard} ·{" "}
                        {template.accountsCount} accounts · {template.rulesCount} rules
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!selectedTemplateId || applyingTemplate}
                  onClick={handleApplyTemplate}
                  className={BUTTON_BLUE}
                >
                  {applyingTemplate ? "Applying..." : "Apply accounting template"}
                </button>
              </div>

              <p className="mt-3 text-xs font-semibold leading-5 text-black/45">
                Applying a template is idempotent. Existing accounts and rules
                will not be deleted.
              </p>

              {applyTemplateResult && (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  Applied template: {applyTemplateResult.accountsCreated} accounts
                  created, {applyTemplateResult.accountsSkipped} skipped,{" "}
                  {applyTemplateResult.rulesCreated} rules created,{" "}
                  {applyTemplateResult.rulesSkipped} skipped
                  {applyTemplateResult.skippedRules?.length
                    ? ` (${applyTemplateResult.skippedRules.length} unresolved)`
                    : ""}
                  .
                </div>
              )}
            </div>
            )}

            {setupSubTab === "accounts" && (
            <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
              <div className={cn(CARD, "p-5")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiCard label="Total accounts" value={accountKpis.total} accent />
                  <KpiCard label="Active accounts" value={accountKpis.active} />
                  <KpiCard label="Inactive accounts" value={accountKpis.inactive} />
                  <KpiCard label="System accounts" value={accountKpis.system} />
                  <KpiCard label="Custom accounts" value={accountKpis.custom} />
                </div>

                <div className="mt-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                    Chart of accounts
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                    Add account
                  </h3>
                </div>

                <form onSubmit={handleAddAccount} className="mt-5 grid gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                      Code
                    </span>
                    <input
                      required
                      value={accountForm.code}
                      onChange={(event) =>
                        {
                          setAccountPreview(null);
                          setAccountForm((current) => ({
                            ...current,
                            code: event.target.value,
                            accountClass: event.target.value.trim().charAt(0),
                          }));
                        }
                      }
                      placeholder="411000"
                      className={INPUT}
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                      Class
                    </span>
                    <input
                      value={accountForm.accountClass}
                      onChange={(event) =>
                        {
                          setAccountPreview(null);
                          setAccountForm((current) => ({
                            ...current,
                            accountClass: event.target.value,
                          }));
                        }
                      }
                      placeholder="4"
                      className={INPUT}
                    />
                  </label>

                  <label className="md:col-span-2">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                      Label
                    </span>
                    <input
                      required
                      value={accountForm.label}
                      onChange={(event) =>
                        {
                          setAccountPreview(null);
                          setAccountForm((current) => ({
                            ...current,
                            label: event.target.value,
                          }));
                        }
                      }
                      placeholder="Customers"
                      className={INPUT}
                    />
                  </label>

                  <label className="md:col-span-2">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                      Type
                    </span>
                    <select
                      value={accountForm.type}
                      onChange={(event) =>
                        {
                          setAccountPreview(null);
                          setAccountForm((current) => ({
                            ...current,
                            type: event.target.value,
                          }));
                        }
                      }
                      className={INPUT}
                    >
                      <option value="">Auto infer</option>
                      {["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"].map(
                        (type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <div className="flex flex-wrap gap-3 md:col-span-2">
                    <button
                      type="button"
                      disabled={previewingAccount}
                      onClick={handlePreviewAccount}
                      className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-black transition hover:border-black hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {previewingAccount ? "Previewing..." : "Preview classification"}
                    </button>
                    <button
                      type="submit"
                      disabled={addingAccount}
                      className={BUTTON_BLUE}
                    >
                      {addingAccount ? "Creating..." : "Create account"}
                    </button>
                  </div>

                  {accountPreview && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 md:col-span-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                          {accountPreview.confidence}
                        </span>
                        <span className="text-xs font-medium text-blue-950">
                          Class {accountPreview.accountClass}
                          {accountPreview.suggestedType
                            ? ` · ${accountPreview.suggestedType}`
                            : " · Manual type required"}
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-medium text-blue-950/70">
                        {accountPreview.parentAccount
                          ? `Parent: ${accountPreview.parentAccount.code} — ${accountPreview.parentAccount.label}`
                          : accountPreview.confidence === "MANUAL_REQUIRED"
                          ? "Type could not be inferred safely. Select type manually."
                          : "No parent account found. Type inferred from code and label."}
                      </p>
                      {accountPreview.warnings.map((warning) => (
                        <p
                          key={warning}
                          className="mt-2 text-xs font-medium text-amber-700"
                        >
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                </form>
              </div>

              <div className={cn(CARD, "overflow-hidden")}>
                <div className="flex flex-col gap-4 border-b border-black/5 px-5 py-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">
                      Accounts
                    </h3>
                    <p className="mt-1 text-sm font-medium text-black/45">
                      Search and manage active or inactive accounts.
                    </p>
                  </div>
                  <div className="w-full md:max-w-sm">
                    <input
                      value={accountSearch}
                      onChange={(event) => {
                        setAccountSearch(event.target.value);
                        setShowAllAccounts(false);
                      }}
                      placeholder="Search by code or label"
                      className={INPUT}
                    />
                  </div>
                </div>

                {!filteredAccounts.length ? (
                  <p className="px-5 py-10 text-sm font-medium text-black/45">
                    No accounts configured yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                        <tr>
                          <th className="px-5 py-3">Code</th>
                          <th className="px-4 py-3">Label</th>
                          <th className="px-4 py-3">Class</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Origin</th>
                          <th className="px-4 py-3">Active</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {visibleAccounts.map((account) => (
                          <tr className="transition hover:bg-black/[0.02]" key={account.id}>
                            <td className="px-5 py-4 font-mono text-xs font-bold">
                              {account.code}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/75">{account.label}</td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {account.accountClass}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {account.type}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                                  account.isSystem
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-slate-100 text-slate-600"
                                )}
                              >
                                {account.isSystem ? "PCN" : "Custom"}
                              </span>
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {account.isActive ? "Yes" : "No"}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                disabled={activeAccountId === account.id}
                                onClick={() => handleToggleAccount(account)}
                                className="rounded-full bg-black px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-slate-800"
                              >
                                {activeAccountId === account.id
                                  ? "Saving..."
                                  : account.isActive
                                  ? "Deactivate"
                                  : "Activate"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {filteredAccounts.length > DEFAULT_VISIBLE_ACCOUNTS && (
                  <div className="border-t border-black/5 px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setShowAllAccounts((current) => !current)}
                      className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-black transition hover:border-black hover:bg-black hover:text-white"
                    >
                      {showAllAccounts
                        ? "View less"
                        : `View more (${filteredAccounts.length - visibleAccounts.length} remaining)`}
                    </button>
                  </div>
                )}
              </div>
            </div>
            )}

            {setupSubTab === "rules" && (
            <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
              <div className={cn(CARD, "p-5")}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                  Accounting rules
                </p>
                <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                  Add rule
                </h3>

                {!activeAccounts.length ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                    Create accounts before defining rules.
                  </div>
                ) : (
                  <form onSubmit={handleAddRule} className="mt-5 grid gap-4">
                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                        Transaction type
                      </span>
                      <select
                        value={ruleForm.transactionType}
                        onChange={(event) =>
                          setRuleForm((current) => ({
                            ...current,
                            transactionType: event.target.value,
                          }))
                        }
                        className={INPUT}
                      >
                        {RULE_TRANSACTION_TYPES.map((transactionType) => (
                          <option key={transactionType} value={transactionType}>
                            {transactionType}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                        Debit account
                      </span>
                      <select
                        value={ruleForm.debitAccountId}
                        onChange={(event) =>
                          setRuleForm((current) => ({
                            ...current,
                            debitAccountId: event.target.value,
                          }))
                        }
                        className={INPUT}
                      >
                        <option value="">Select account</option>
                        {activeAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                        Credit account
                      </span>
                      <select
                        value={ruleForm.creditAccountId}
                        onChange={(event) =>
                          setRuleForm((current) => ({
                            ...current,
                            creditAccountId: event.target.value,
                          }))
                        }
                        className={INPUT}
                      >
                        <option value="">Select account</option>
                        {activeAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                        Description template <span className="text-black/30">optional</span>
                      </span>
                      <input
                        value={ruleForm.descriptionTemplate}
                        onChange={(event) =>
                          setRuleForm((current) => ({
                            ...current,
                            descriptionTemplate: event.target.value,
                          }))
                        }
                        placeholder="Customer invoice - {description}"
                        className={INPUT}
                      />
                    </label>

                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">
                        Priority
                      </span>
                      <input
                        type="number"
                        value={ruleForm.priority}
                        onChange={(event) =>
                          setRuleForm((current) => ({
                            ...current,
                            priority: event.target.value,
                          }))
                        }
                        className={INPUT}
                      />
                    </label>

                    <div>
                      <button
                        type="submit"
                        disabled={
                          addingRule ||
                          !ruleForm.transactionType ||
                          !ruleForm.debitAccountId ||
                          !ruleForm.creditAccountId ||
                          ruleForm.debitAccountId === ruleForm.creditAccountId
                        }
                        className={BUTTON_BLUE}
                      >
                        {addingRule ? "Creating..." : "Create rule"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className={cn(CARD, "overflow-hidden")}>
                <div className="flex flex-col gap-4 border-b border-black/5 px-5 py-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">
                      Accounting rules
                    </h3>
                    <p className="mt-1 text-sm font-medium text-black/45">
                      Active rules drive draft journal generation.
                    </p>
                  </div>
                  <div className="w-full md:max-w-sm">
                    <input
                      value={ruleSearch}
                      onChange={(event) => {
                        setRuleSearch(event.target.value);
                        setShowAllRules(false);
                      }}
                      placeholder="Search rules"
                      className={INPUT}
                    />
                  </div>
                </div>

                {!filteredRules.length ? (
                  <p className="px-5 py-10 text-sm font-medium text-black/45">
                    No accounting rules yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                        <tr>
                          <th className="px-5 py-3">Transaction type</th>
                          <th className="px-4 py-3">Debit account</th>
                          <th className="px-4 py-3">Credit account</th>
                          <th className="px-4 py-3">Template</th>
                          <th className="px-4 py-3 text-right">Priority</th>
                          <th className="px-4 py-3">Active</th>
                          <th className="px-5 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {visibleRules.map((rule) => (
                          <tr className="transition hover:bg-black/[0.02]" key={rule.id}>
                            <td className="px-5 py-4 font-semibold text-black/80">
                              {rule.transactionType}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {rule.debitAccount.code} — {rule.debitAccount.label}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {rule.creditAccount.code} — {rule.creditAccount.label}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {rule.descriptionTemplate || "—"}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs font-bold">
                              {rule.priority}
                            </td>
                            <td className="px-4 py-4 font-medium text-black/60">
                              {rule.isActive ? "Yes" : "No"}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                disabled={activeRuleId === rule.id}
                                onClick={() => handleToggleRule(rule)}
                                className="rounded-full bg-black px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-slate-800"
                              >
                                {activeRuleId === rule.id
                                  ? "Saving..."
                                  : rule.isActive
                                  ? "Deactivate"
                                  : "Activate"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {filteredRules.length > DEFAULT_VISIBLE_RULES && (
                  <div className="border-t border-black/5 px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setShowAllRules((current) => !current)}
                      className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold text-black transition hover:border-black hover:bg-black hover:text-white"
                    >
                      {showAllRules
                        ? "View less"
                        : `View more (${filteredRules.length - visibleRules.length} remaining)`}
                    </button>
                  </div>
                )}
              </div>
            </div>
            )}

            {setupSubTab === "periods" && (
              <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                <div className={cn(CARD, "p-5")}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-500">
                    Closing control
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                    Create period
                  </h3>
                  <p className="mt-2 text-sm font-medium text-black/45">
                    Journal entries can only be posted into open periods.
                  </p>
                  <form onSubmit={handleAddPeriod} className="mt-5 grid gap-4">
                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">Name</span>
                      <input required value={periodForm.name} onChange={(event) => setPeriodForm((current) => ({ ...current, name: event.target.value }))} placeholder="January 2026" className={INPUT} />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">Start date</span>
                      <input required type="date" value={periodForm.startDate} onChange={(event) => setPeriodForm((current) => ({ ...current, startDate: event.target.value }))} className={INPUT} />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">End date</span>
                      <input required type="date" value={periodForm.endDate} onChange={(event) => setPeriodForm((current) => ({ ...current, endDate: event.target.value }))} className={INPUT} />
                    </label>
                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-black/50">Initial status</span>
                      <select value={periodForm.status} onChange={(event) => setPeriodForm((current) => ({ ...current, status: event.target.value as PeriodForm["status"] }))} className={INPUT}>
                        {["OPEN", "CLOSED", "LOCKED"].map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </label>
                    <button type="submit" disabled={addingPeriod} className={BUTTON_BLUE}>
                      {addingPeriod ? "Creating..." : "Create period"}
                    </button>
                  </form>
                </div>
                <div className={cn(CARD, "overflow-hidden")}>
                  <div className="border-b border-black/5 px-5 py-4">
                    <h3 className="text-xl font-semibold tracking-[-0.03em]">Accounting periods</h3>
                  </div>
                  {!periods.length ? (
                    <p className="px-5 py-10 text-sm font-medium text-black/45">No accounting periods yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[#f7f7f9] text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
                          <tr><th className="px-5 py-3">Name</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">End</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {periods.map((period) => (
                            <tr className="transition hover:bg-black/[0.02]" key={period.id}>
                              <td className="px-5 py-4 font-semibold text-black/80">{period.name}</td>
                              <td className="px-4 py-4 font-medium text-black/60">{formatAccountingPeriodDate(period.startDate)}</td>
                              <td className="px-4 py-4 font-medium text-black/60">{formatAccountingPeriodDate(period.endDate)}</td>
                              <td className="px-4 py-4"><span className={cn("rounded-full px-3 py-2 text-[10px] font-semibold", period.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : period.status === "LOCKED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>{period.status}</span></td>
                              <td className="px-5 py-4"><div className="flex justify-end gap-2">
                                {period.status !== "OPEN" && <button type="button" disabled={activePeriodId === period.id} onClick={() => handlePeriodStatus(period, "OPEN")} className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold">Reopen</button>}
                                {period.status === "OPEN" && <button type="button" disabled={activePeriodId === period.id} onClick={() => handlePeriodStatus(period, "CLOSED")} className="rounded-full border border-black/10 px-3 py-2 text-[10px] font-semibold">Close</button>}
                                {period.status !== "LOCKED" && <button type="button" disabled={activePeriodId === period.id} onClick={() => handlePeriodStatus(period, "LOCKED")} className="rounded-full bg-black px-3 py-2 text-[10px] font-semibold text-white">Lock</button>}
                              </div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={cn(CARD, "p-5")}>
              <p className="text-sm font-medium text-black/45">
                Full Luxembourg PCN template import will be added in a later
                step.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
