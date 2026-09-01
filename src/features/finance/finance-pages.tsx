"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, BookOpen, BriefcaseBusiness, BusFront, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, Gamepad2, Goal, HeartPulse, House, MoreVertical, Pencil, PiggyBank, Plus, ReceiptText, Search, ShoppingBag, Target, Trash2, Utensils, WalletCards } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { BottomSheet, Card, EmptyState, Field, Input, PageHeader, ProgressBar, Select, StatusPill, Textarea } from "@/components/ui";
import { formatThaiMonthYear, getDailyBudgetStatus, getFinanceTransactionsForDate, getLocalMonthKey, getMonthlyFinanceSummaryForMonth, getNextMonthKey, getPreviousMonthKey, monthKeyToDate, toLocalDateKey } from "@/lib/finance-utils";
import { useAppState } from "@/providers/app-state-provider";
import type { FinanceCategory, FinanceTransaction, FinanceTransactionType, NewFinanceTransactionInput, SubjectColor } from "@/types";

const formatMoney = (amount: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(amount);
const formatDate = (date: string) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));

function TypeIcon({ type }: { type: FinanceTransactionType }) {
  return <span className={`finance-type-icon finance-${type}`}>{type === "income" ? <ArrowDownLeft /> : type === "expense" ? <ArrowUpRight /> : <PiggyBank />}</span>;
}

const categoryIcons = { utensils: Utensils, bus: BusFront, book: BookOpen, house: House, gamepad: Gamepad2, heart: HeartPulse, bag: ShoppingBag, wallet: WalletCards, briefcase: BriefcaseBusiness, graduate: BookOpen, piggy: PiggyBank };
const iconOptions = Object.keys(categoryIcons) as Array<keyof typeof categoryIcons>;
function CategoryIcon({ category }: { category: FinanceCategory }) { const Icon = categoryIcons[category.icon as keyof typeof categoryIcons] ?? WalletCards; return <span className={`finance-category-icon color-${category.color}`}><Icon /></span>; }
const labelType = (type: FinanceTransactionType) => type === "income" ? "รายรับ" : type === "expense" ? "รายจ่าย" : "เงินออม";

function FinanceMonthPicker({ open, monthKey, onClose, onSelect }: { open: boolean; monthKey: string; onClose: () => void; onSelect: (month: string) => void }) {
  const [year, setYear] = useState(() => monthKeyToDate(monthKey).getFullYear());
  const currentMonth = getLocalMonthKey();
  const months = Array.from({ length: 12 }, (_, index) => new Date(year, index, 1));
  return <BottomSheet open={open} onClose={onClose} title="เลือกเดือน"><div className="finance-month-picker"><div className="finance-picker-year"><button type="button" aria-label="ปีก่อนหน้า" onClick={() => setYear((value) => value - 1)}><ChevronLeft /></button><strong>{year + 543}</strong><button type="button" aria-label="ปีถัดไป" onClick={() => setYear((value) => value + 1)}><ChevronRight /></button></div><div className="finance-picker-months">{months.map((date) => { const key = getLocalMonthKey(date); return <button type="button" key={key} className={`${key === monthKey ? "selected" : ""} ${key === currentMonth ? "current" : ""}`} onClick={() => { onSelect(key); onClose(); }}>{new Intl.DateTimeFormat("th-TH", { month: "short" }).format(date).replace(".", "")}</button>; })}</div>{monthKey !== currentMonth && <button type="button" className="secondary-button button-block" onClick={() => { onSelect(currentMonth); onClose(); }}>เดือนนี้</button>}</div></BottomSheet>;
}

function FinancePocketDetail({ category, transactions, savingGoals, monthKey, onEdit }: { category: FinanceCategory; transactions: FinanceTransaction[]; savingGoals: { id: string; title: string; targetAmount: number; savedAmount: number }[]; monthKey: string; onEdit: () => void }) {
  const sortedTransactions = [...transactions].sort((first, second) => second.date.localeCompare(first.date));
  const used = sortedTransactions.reduce((sum, item) => sum + item.amount, 0);
  const budget = category.monthlyBudget ?? 0;
  const percent = budget > 0 ? Math.round((used / budget) * 100) : 0;
  const remaining = budget - used;
  const latestTransaction = sortedTransactions[0];
  const savingTarget = savingGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const savedAmount = savingGoals.reduce((sum, goal) => sum + goal.savedAmount, 0);
  const savingPercent = savingTarget > 0 ? Math.round((savedAmount / savingTarget) * 100) : 0;
  const addHref = `/finance/new?type=${category.type}&categoryId=${encodeURIComponent(category.id)}&month=${monthKey}`;
  const isExpense = category.type === "expense";
  const isSaving = category.type === "saving";

  return <section className="finance-pocket-detail-content" aria-labelledby={`pocket-detail-${category.id}`}>
    <header className="finance-pocket-detail-header"><div><CategoryIcon category={category} /><span><h3 id={`pocket-detail-${category.id}`}>{category.name}</h3><small>{isExpense ? "งบประมาณเดือนนี้" : isSaving ? "เงินออมเดือนนี้" : "รายรับเดือนนี้"}</small></span></div><div className="finance-pocket-detail-actions"><Link className="secondary-button" href={addHref}><Plus /> เพิ่มรายการ</Link><button type="button" className="icon-button finance-detail-edit" aria-label={`แก้ไขหมวดหมู่ ${category.name}`} onClick={onEdit}><Pencil /></button></div></header>
    <div className="finance-pocket-detail-amount"><strong>{formatMoney(used)}</strong><small>{isExpense ? budget > 0 ? `ใช้ไปจากงบ ${formatMoney(budget)}` : "ยังไม่ได้ตั้งงบสำหรับหมวดนี้" : isSaving ? "ยอดที่ออมในเดือนที่เลือก" : `${transactions.length} รายการในเดือนที่เลือก`}</small></div>
    {isExpense && (budget > 0 ? <div className="finance-pocket-detail-progress"><div><span>คงเหลือ</span><strong>{formatMoney(remaining)}</strong><b>{percent}%</b></div><ProgressBar value={Math.min(100, percent)} color={percent > 100 ? "pink" : percent >= 80 ? "orange" : category.color} /></div> : <Link className="secondary-button finance-detail-budget-link" href="/finance/budgets"><CircleDollarSign /> ตั้งงบสำหรับหมวดนี้</Link>)}
    {isSaving && (savingTarget > 0 ? <div className="finance-pocket-detail-progress"><div><span>เป้าหมายออมทั้งหมด</span><strong>{formatMoney(savedAmount)} / {formatMoney(savingTarget)}</strong><b>{savingPercent}%</b></div><ProgressBar value={Math.min(100, savingPercent)} color="purple" /></div> : <Link className="secondary-button finance-detail-budget-link" href="/finance/savings"><Target /> สร้างเป้าหมายการออม</Link>)}
    {!isExpense && !isSaving && latestTransaction && <div className="finance-pocket-detail-meta"><span>ล่าสุด</span><strong>{formatDate(latestTransaction.date)}</strong><span>จำนวนรายการ</span><strong>{transactions.length} รายการ</strong></div>}
    <div className="finance-pocket-detail-transactions"><div className="finance-pocket-detail-section-heading"><h4>รายการในกระเป๋า</h4><span>{sortedTransactions.length} รายการ</span></div>{sortedTransactions.length > 0 ? sortedTransactions.map((transaction) => <Link className="finance-pocket-detail-row" key={transaction.id} href={`/finance/${transaction.id}`}><TypeIcon type={transaction.type} /><span><strong>{transaction.title}</strong><small>{formatDate(transaction.date)} · {labelType(transaction.type)}</small></span><b className={transaction.type === "income" ? "income-value" : transaction.type === "saving" ? "saving-value" : "expense-value"}>{transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)}</b></Link>) : <div className="finance-pocket-detail-empty"><p>ยังไม่มีรายการใน “{category.name}” เดือนนี้</p><Link className="primary-button" href={addHref}><Plus /> เพิ่มรายการแรก</Link></div>}</div>
  </section>;
}

export function FinancePage() {
  const { financeTransactions, financeCategories, savingGoals, financeSettings, updateFinanceSettings, selectedFinanceMonth, setSelectedFinanceMonth } = useAppState();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ทั้งหมด" | "วันนี้" | FinanceTransactionType>("ทั้งหมด");
  const [isDailyBudgetOpen, setIsDailyBudgetOpen] = useState(false);
  const [dailyBudgetDraft, setDailyBudgetDraft] = useState(financeSettings.dailyBudget);
  const [selectedPocketId, setSelectedPocketId] = useState<string | null>(null);
  const [showAllPockets, setShowAllPockets] = useState(false);
  const [isPocketDetailOpen, setIsPocketDetailOpen] = useState(false);
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FinanceCategory | null>(null);
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const referenceDate = new Date();
  const currentMonthKey = getLocalMonthKey(referenceDate);
  const isCurrentMonth = selectedFinanceMonth === currentMonthKey;
  const monthLabel = formatThaiMonthYear(selectedFinanceMonth);
  const summary = getMonthlyFinanceSummaryForMonth(financeTransactions, selectedFinanceMonth);
  const dailyBudget = getDailyBudgetStatus(financeSettings, financeTransactions, referenceDate);
  const todayTransactions = getFinanceTransactionsForDate(summary.monthlyTransactions, referenceDate);
  const searchableTransactions = filter === "วันนี้" && isCurrentMonth ? todayTransactions : summary.monthlyTransactions.filter((item) => filter === "ทั้งหมด" || item.type === filter);
  const transactions = searchableTransactions.filter((item) => `${item.title} ${item.category} ${item.note ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const filterOptions: Array<"ทั้งหมด" | "วันนี้" | FinanceTransactionType> = isCurrentMonth ? ["ทั้งหมด", "วันนี้", "income", "expense", "saving"] : ["ทั้งหมด", "income", "expense", "saving"];
  const selectMonth = (month: string) => { setSelectedFinanceMonth(month); if (month !== currentMonthKey && filter === "วันนี้") setFilter("ทั้งหมด"); };
  const addTransactionHref = `/finance/new?month=${selectedFinanceMonth}`;
  const budgetCategories = financeCategories.filter((category) => category.type === "expense" && category.monthlyBudget);
  const totalMonthlyBudget = budgetCategories.reduce((sum, category) => sum + (category.monthlyBudget ?? 0), 0);
  const budgetedExpenseSpent = summary.monthlyTransactions.filter((item) => item.type === "expense" && budgetCategories.some((category) => category.name === item.category)).reduce((sum, item) => sum + item.amount, 0);
  const budgetRemaining = totalMonthlyBudget - budgetedExpenseSpent;
  const budgetPercent = totalMonthlyBudget > 0 ? Math.round((budgetedExpenseSpent / totalMonthlyBudget) * 100) : 0;
  const budgetRemainingPercent = totalMonthlyBudget > 0 ? Math.max(0, Math.round((budgetRemaining / totalMonthlyBudget) * 100)) : 0;
  const savingGoalTarget = savingGoals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const savingGoalSaved = savingGoals.reduce((sum, goal) => sum + goal.savedAmount, 0);
  const savingGoalPercent = savingGoalTarget > 0 ? Math.round((savingGoalSaved / savingGoalTarget) * 100) : 0;
  const defaultPocket = financeCategories.find((category) => summary.monthlyTransactions.some((item) => item.category === category.name)) ?? financeCategories[0] ?? null;
  const selectedPocket = financeCategories.find((category) => category.id === selectedPocketId) ?? defaultPocket;
  const selectedPocketTransactions = selectedPocket ? summary.monthlyTransactions.filter((item) => item.category === selectedPocket.name) : [];
  const recentTransactions = [...transactions].sort((first, second) => second.date.localeCompare(first.date)).slice(0, 6);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 699px)");
    const closeMobileDetailOnDesktop = (event: MediaQueryListEvent) => { if (!event.matches) setIsPocketDetailOpen(false); };
    media.addEventListener("change", closeMobileDetailOnDesktop);
    return () => media.removeEventListener("change", closeMobileDetailOnDesktop);
  }, []);
  const selectPocket = (category: FinanceCategory) => {
    setSelectedPocketId(category.id);
    if (window.matchMedia("(max-width: 699px)").matches) setIsPocketDetailOpen(true);
  };
  const editPocket = (category: FinanceCategory) => { setIsPocketDetailOpen(false); setEditingCategory(category); setCategoryEditorOpen(true); };
  const saveDailyBudget = (event: FormEvent) => {
    event.preventDefault();
    updateFinanceSettings({ dailyBudget: Math.max(0, Number.isFinite(dailyBudgetDraft) ? dailyBudgetDraft : 0) });
    setIsDailyBudgetOpen(false);
  };
  return <div className="page finance-page">
    <header className="finance-heading">
      <div className="page-intro">
        <span className="finance-title-icon"><WalletCards aria-hidden="true" /></span>
        <div><h1>การเงิน</h1><p>จัดการรายรับ รายจ่าย เงินออม และวางแผนการใช้เงิน</p></div>
      </div>
      <div className="finance-heading-actions">
        <div className="finance-month-control">
          <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => selectMonth(getPreviousMonthKey(selectedFinanceMonth))}><ChevronLeft /></button>
          <button type="button" className="finance-month-label" aria-label="เลือกเดือน" onClick={() => setIsMonthPickerOpen(true)}><CalendarDays /> {monthLabel}</button>
          <button type="button" aria-label="เดือนถัดไป" onClick={() => selectMonth(getNextMonthKey(selectedFinanceMonth))}><ChevronRight /></button>
        </div>
        <button className="text-button finance-current-month" type="button" disabled={isCurrentMonth} onClick={() => selectMonth(currentMonthKey)}>เดือนนี้</button>
        <button className="secondary-button finance-category-manage" type="button" onClick={() => { setEditingCategory(null); setCategoryEditorOpen(true); }}>จัดการหมวดหมู่</button>
        <Link className="primary-button finance-header-add" href={addTransactionHref}><Plus /> เพิ่มรายการ</Link>
      </div>
    </header>

    <section className="finance-mini-dashboard" aria-labelledby="finance-mini-dashboard-title">
      <h2 id="finance-mini-dashboard-title" className="visually-hidden">สรุปงบประมาณและเงินออม {monthLabel}</h2>
      <div className="finance-mini-dashboard-grid">
        <Card className="finance-mini-stat budget"><CircleDollarSign aria-hidden="true" /><span><small>งบประมาณเดือนนี้</small>{totalMonthlyBudget > 0 ? <><strong>{formatMoney(totalMonthlyBudget)}</strong><em>รวมจากหมวดที่ตั้งงบ</em></> : <><strong className="finance-mini-empty">ยังไม่ได้ตั้งงบ</strong><Link href="/finance/budgets">ตั้งงบเดือนนี้</Link></>}</span></Card>
        <Card className="finance-mini-stat used"><ReceiptText aria-hidden="true" /><span><small>ใช้ไปแล้ว</small><strong>{formatMoney(budgetedExpenseSpent)}</strong><em>{totalMonthlyBudget > 0 ? `${budgetPercent}% ของงบที่ตั้งไว้` : "รอตั้งงบรายหมวด"}</em></span></Card>
        <Card className={`finance-mini-stat remaining ${budgetRemaining < 0 ? "negative" : ""}`}><WalletCards aria-hidden="true" /><span><small>เหลือใช้</small><strong>{formatMoney(budgetRemaining)}</strong><em>{totalMonthlyBudget > 0 ? `${budgetRemainingPercent}% ของงบที่ตั้งไว้` : "รอตั้งงบรายหมวด"}</em></span></Card>
        <Card className="finance-mini-stat saving-target"><Target aria-hidden="true" /><span><small>เป้าหมายออม</small>{savingGoalTarget > 0 ? <><strong>{formatMoney(savingGoalTarget)}</strong><em>{savingGoals.length} เป้าหมายที่กำลังติดตาม</em></> : <><strong className="finance-mini-empty">ยังไม่มีเป้าหมาย</strong><Link href="/finance/savings">สร้างเป้าหมาย</Link></>}</span></Card>
        <Card className="finance-mini-stat saving"><PiggyBank aria-hidden="true" /><span><small>ออมแล้ว</small><strong>{formatMoney(savingGoalSaved)}</strong><em>{savingGoalTarget > 0 ? `${savingGoalPercent}% ของเป้าหมายทั้งหมด` : `เดือนนี้โอนออม ${formatMoney(summary.savingsTransfers)}`}</em></span></Card>
      </div>
    </section>

    <Card className="finance-summary-strip" aria-labelledby="finance-summary-title">
      <div className="finance-summary-heading"><h2 id="finance-summary-title">ภาพรวมการเงิน</h2><small>{monthLabel}</small></div>
      <div className="finance-summary-grid">
        <div className={`finance-summary-balance ${summary.remaining < 0 ? "negative" : ""}`}><span className="finance-overview-icon"><WalletCards aria-hidden="true" /></span><span><small>คงเหลือสุทธิ</small><strong>{formatMoney(summary.remaining)}</strong><em>รายรับ − รายจ่าย − เงินออม</em></span></div>
        <div><TypeIcon type="income" /><span><small>รายรับ</small><strong>{formatMoney(summary.income)}</strong><em>{summary.monthlyTransactions.filter((item) => item.type === "income").length} รายการ</em></span></div>
        <div><TypeIcon type="expense" /><span><small>รายจ่าย</small><strong>{formatMoney(summary.expenses)}</strong><em>{summary.monthlyTransactions.filter((item) => item.type === "expense").length} รายการ</em></span></div>
        <div><TypeIcon type="saving" /><span><small>เงินออมเดือนนี้</small><strong>{formatMoney(summary.savingsTransfers)}</strong><em>{summary.monthlyTransactions.filter((item) => item.type === "saving").length} รายการ</em></span></div>
      </div>
    </Card>

    <section className="finance-quick-actions" aria-label="คำสั่งด่วน">
      <Link className="finance-action-income" href={`/finance/new?type=income&month=${selectedFinanceMonth}`}><ArrowDownLeft /><span>เพิ่มรายรับ</span></Link>
      <Link className="finance-action-expense" href={`/finance/new?type=expense&month=${selectedFinanceMonth}`}><ArrowUpRight /><span>เพิ่มรายจ่าย</span></Link>
      <Link className="finance-action-saving" href={`/finance/new?type=saving&month=${selectedFinanceMonth}`}><Goal /><span>ออมเงิน</span></Link>
      <Link className="finance-action-budget" href="/finance/budgets"><CircleDollarSign /><span>ตั้งงบ</span></Link>
    </section>

    <section className="finance-pockets" aria-labelledby="finance-pockets-title">
      <div className="section-header finance-pocket-heading"><div><h2 id="finance-pockets-title">กระเป๋าเงินของฉัน</h2><p>เลือกกระเป๋าเพื่อดูรายละเอียดและรายการภายใน</p></div><span>{financeCategories.length} กระเป๋า</span></div>
      <div className="finance-pocket-layout">
      <div className={`finance-pocket-grid ${showAllPockets ? "is-expanded" : ""}`}>
        {financeCategories.map((category) => {
          const pocketTransactions = summary.monthlyTransactions.filter((item) => item.category === category.name);
          const used = pocketTransactions.reduce((sum, item) => sum + item.amount, 0);
          const budget = category.monthlyBudget;
          const percent = budget ? Math.round((used / budget) * 100) : 0;
          const latestTransaction = [...pocketTransactions].sort((first, second) => second.date.localeCompare(first.date))[0];
          const isActive = selectedPocket?.id === category.id;
          const empty = pocketTransactions.length === 0;
          const pocketMeta = category.type === "expense"
            ? budget ? `จากงบ ${formatMoney(budget)}` : empty ? "ยังไม่มีรายการ" : "รายจ่ายในเดือนนี้"
            : category.type === "income" ? empty ? "ยังไม่มีรายการ" : `รับล่าสุด ${formatDate(latestTransaction.date)}`
            : empty ? "ยังไม่มีรายการ" : "เงินออมในเดือนนี้";
          return <Card className={`finance-pocket-card finance-pocket-${category.color} ${empty ? "is-empty" : ""} ${isActive ? "is-active" : ""}`} key={category.id}>
            <button type="button" className="finance-pocket-select" aria-pressed={isActive} aria-controls="finance-pocket-detail-panel" onClick={() => selectPocket(category)}>
              <span className="finance-pocket-icon-wrap"><CategoryIcon category={category} />{isActive && <span className="finance-pocket-selected-mark" aria-hidden="true"><Check /></span>}</span>
              <span className="finance-pocket-copy"><strong>{category.name}</strong><b>{formatMoney(used)}</b><small>{pocketMeta}</small></span>
              {budget && <span className="finance-pocket-progress"><ProgressBar value={Math.min(100, percent)} color={percent > 100 ? "pink" : percent >= 80 ? "orange" : category.color} /><small>{percent}%</small></span>}
              {!budget && <span className="finance-pocket-status">{empty ? "เพิ่มรายการ" : `${pocketTransactions.length} รายการ`}</span>}
            </button>
            <button type="button" className="finance-pocket-more" aria-label={`แก้ไขหมวดหมู่ ${category.name}`} onClick={() => editPocket(category)}><MoreVertical /></button>
          </Card>;
        })}
        {financeCategories.length === 0 && <div className="finance-pocket-grid-empty"><WalletCards aria-hidden="true" /><strong>ยังไม่มีกระเป๋าเงิน</strong><p>สร้างหมวดหมู่แรกเพื่อเริ่มจัดการรายรับ รายจ่าย และเงินออม</p><button type="button" className="secondary-button" onClick={() => { setEditingCategory(null); setCategoryEditorOpen(true); }}>สร้างหมวดหมู่แรก</button></div>}
      </div>
      <Card id="finance-pocket-detail-panel" className="finance-pocket-detail-panel" aria-live="polite">
        {selectedPocket ? <FinancePocketDetail category={selectedPocket} transactions={selectedPocketTransactions} savingGoals={savingGoals} monthKey={selectedFinanceMonth} onEdit={() => editPocket(selectedPocket)} /> : <div className="finance-pocket-detail-placeholder"><WalletCards aria-hidden="true" /><strong>เลือกกระเป๋าเพื่อดูรายละเอียด</strong><p>ดูยอด รายการย่อย และเพิ่มรายการจากกระเป๋าได้ที่นี่</p></div>}
      </Card>
      </div>
      {financeCategories.length > 6 && <button type="button" className="finance-pocket-expand" aria-expanded={showAllPockets} onClick={() => setShowAllPockets((current) => !current)}>{showAllPockets ? "แสดงกระเป๋าแบบย่อ" : `ดูกระเป๋าทั้งหมด (${financeCategories.length})`}</button>}
    </section>

    <div className={`finance-content-grid ${isCurrentMonth ? "" : "is-single"}`}>
      <section className="finance-transactions" id="finance-transactions">
        <div className="section-header"><div><h2 className="finance-section-title"><ReceiptText /> รายการล่าสุด</h2><small>{monthLabel}</small></div><Link href={addTransactionHref}>เพิ่มรายการ</Link></div>
        <div className="finance-filter"><label><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหารายการ โน้ต หรือหมวดหมู่" aria-label="ค้นหารายการการเงิน" /></label><div className="finance-tabs" role="tablist" aria-label="กรองรายการการเงิน">{filterOptions.map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "ทั้งหมด" || item === "วันนี้" ? item : labelType(item)}</button>)}</div></div>
        {summary.monthlyTransactions.length === 0 && <div className="finance-empty-state"><div><strong>ยังไม่มีรายการในเดือนนี้</strong><small>เริ่มบันทึกรายรับ รายจ่าย หรือเงินออมของคุณได้เลย</small></div><Link className="secondary-button" href={addTransactionHref}><Plus /> เพิ่มรายการแรก</Link></div>}
        <div className="finance-recent-list">{recentTransactions.map((transaction) => { const category = financeCategories.find((item) => item.name === transaction.category); return <Link key={transaction.id} href={`/finance/${transaction.id}`}><TypeIcon type={transaction.type} /><span className="finance-transaction-copy"><strong>{transaction.title}</strong><small>{formatDate(transaction.date)} · {transaction.category}</small></span>{category && <CategoryIcon category={category} />}<b className={transaction.type === "income" ? "income-value" : transaction.type === "saving" ? "saving-value" : "expense-value"}>{transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)}</b></Link>; })}{summary.monthlyTransactions.length > 0 && recentTransactions.length === 0 && <EmptyState title="ไม่พบรายการที่ตรงกับตัวกรอง" description="ลองล้างคำค้นหาหรือเปลี่ยนตัวกรอง" />}</div>
      </section>

      {isCurrentMonth && <aside className="finance-side"><Card className="finance-daily-budget-card"><div className="section-header finance-side-title"><h2><CircleDollarSign /> งบรายวัน</h2><button type="button" className="text-button" onClick={() => { setDailyBudgetDraft(financeSettings.dailyBudget); setIsDailyBudgetOpen(true); }}>{dailyBudget.budget === 0 ? "ตั้งงบ" : "แก้ไข"}</button></div><strong>{dailyBudget.budget === 0 ? "ยังไม่ได้ตั้งงบ" : formatMoney(dailyBudget.budget)}</strong><small>{dailyBudget.budget === 0 ? "กำหนดงบต่อวันเพื่อดูการใช้จ่ายของวันนี้" : `วันนี้ใช้ไป ${formatMoney(dailyBudget.spent)}${dailyBudget.isOverBudget ? ` · เกินงบ ${formatMoney(Math.abs(dailyBudget.remaining))}` : ` · เหลือ ${formatMoney(dailyBudget.remaining)}`}`}</small>{dailyBudget.budget > 0 && <ProgressBar value={dailyBudget.visualPercent} color={dailyBudget.isOverBudget ? "pink" : dailyBudget.percent >= 80 ? "orange" : "purple"} />}</Card></aside>}
    </div>
    <BottomSheet open={isDailyBudgetOpen} onClose={() => setIsDailyBudgetOpen(false)} title="ตั้งงบรายวัน"><form className="finance-daily-budget-form" onSubmit={saveDailyBudget}><Field label="งบใช้จ่ายต่อวัน (บาท)"><Input autoFocus type="number" min="0" step="1" value={dailyBudgetDraft || ""} onChange={(event) => setDailyBudgetDraft(Math.max(0, Number(event.target.value)))} placeholder="0" /></Field><p>TALEVO จะใช้จำนวนนี้ช่วยคำนวณเงินที่เหลือใช้ในแต่ละวัน</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setIsDailyBudgetOpen(false)}>ยกเลิก</button><button className="primary-button" type="submit">บันทึก</button></div></form></BottomSheet>
    <FinanceMonthPicker key={`${isMonthPickerOpen}-${selectedFinanceMonth}`} open={isMonthPickerOpen} monthKey={selectedFinanceMonth} onClose={() => setIsMonthPickerOpen(false)} onSelect={selectMonth} />
    <FinanceCategoryEditor key={`${categoryEditorOpen}-${editingCategory?.id ?? "manager"}`} open={categoryEditorOpen} category={editingCategory} onClose={() => setCategoryEditorOpen(false)} />
    {selectedPocket && <BottomSheet open={isPocketDetailOpen} onClose={() => setIsPocketDetailOpen(false)} title="รายละเอียดกระเป๋า" className="finance-pocket-detail-sheet"><FinancePocketDetail category={selectedPocket} transactions={selectedPocketTransactions} savingGoals={savingGoals} monthKey={selectedFinanceMonth} onEdit={() => editPocket(selectedPocket)} /></BottomSheet>}
  </div>;
}

const categoryColorOptions: Array<{ value: SubjectColor; label: string }> = [
  { value: "purple", label: "ม่วง" }, { value: "blue", label: "ฟ้า" }, { value: "green", label: "เขียว" }, { value: "orange", label: "ส้ม" }, { value: "pink", label: "ชมพู" }, { value: "magenta", label: "บานเย็น" }, { value: "cyan", label: "ฟ้าน้ำทะเล" }, { value: "yellow", label: "เหลือง" },
];

function FinanceCategoryEditor({ open, category, onClose }: { open: boolean; category: FinanceCategory | null; onClose: () => void }) {
  const { financeCategories, financeTransactions, addFinanceCategory, updateFinanceCategory, deleteFinanceCategory } = useAppState();
  const [editing, setEditing] = useState<FinanceCategory | null>(category);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<FinanceCategory, "id">>(() => category ? { name: category.name, type: category.type, icon: category.icon, color: category.color, monthlyBudget: category.monthlyBudget, isDefault: category.isDefault } : { name: "", type: "expense", icon: "wallet", color: "purple", monthlyBudget: undefined });
  const [error, setError] = useState("");
  const isUsed = editing ? financeTransactions.some((item) => item.category === editing.name) : false;
  const save = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (name.length < 2) return setError("กรุณาระบุชื่อหมวดหมู่อย่างน้อย 2 ตัวอักษร");
    if (financeCategories.some((item) => item.id !== editing?.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return setError("มีหมวดหมู่ชื่อนี้อยู่แล้ว");
    const next = { ...draft, name, monthlyBudget: draft.type === "expense" && draft.monthlyBudget && draft.monthlyBudget > 0 ? Math.round(draft.monthlyBudget) : undefined };
    if (editing) updateFinanceCategory(editing.id, next); else addFinanceCategory(next);
    onClose();
  };
  const remove = () => {
    if (!editing || !deleteFinanceCategory(editing.id)) return setError(editing?.isDefault ? "หมวดหมู่เริ่มต้นยังลบไม่ได้" : "หมวดหมู่นี้มีรายการใช้งานอยู่ จึงลบไม่ได้");
    onClose();
  };
  const startNew = () => { setEditing(null); setIsCreating(true); setError(""); setDraft({ name: "", type: "expense", icon: "wallet", color: "purple", monthlyBudget: undefined }); };
  if (!editing && !isCreating && category === null) return <BottomSheet open={open} onClose={onClose} title="จัดการหมวดหมู่"><div className="finance-category-manager"><p>หมวดหมู่ทั้งหมดเป็นแหล่งข้อมูลเดียวสำหรับบันทึกรายการและงบประมาณ</p>{(["expense", "income", "saving"] as const).map((type) => <section key={type}><h3>{labelType(type)}</h3>{financeCategories.filter((item) => item.type === type).map((item) => <button type="button" className="finance-category-manager-row" key={item.id} onClick={() => { setEditing(item); setDraft({ name: item.name, type: item.type, icon: item.icon, color: item.color, monthlyBudget: item.monthlyBudget, isDefault: item.isDefault }); }}><CategoryIcon category={item} /><span><strong>{item.name}</strong><small>{item.type === "expense" && item.monthlyBudget ? `งบ ${formatMoney(item.monthlyBudget)} ต่อเดือน` : labelType(item.type)}</small></span><Pencil /></button>)}</section>)}<button className="primary-button button-block" type="button" onClick={startNew}><Plus /> เพิ่มหมวดหมู่</button></div></BottomSheet>;
  return <BottomSheet open={open} onClose={onClose} title={editing ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}><form className="finance-category-form" onSubmit={save}><Field label="ชื่อหมวดหมู่"><Input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="เช่น ค่าอินเทอร์เน็ต" /></Field><Field label="ประเภท"><Select value={draft.type} disabled={isUsed} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as FinanceTransactionType }))}>{(["expense", "income", "saving"] as const).map((type) => <option key={type} value={type}>{labelType(type)}</option>)}</Select></Field>{isUsed && <p className="finance-form-hint">เปลี่ยนประเภทไม่ได้เพราะหมวดหมู่นี้มีรายการใช้งานแล้ว</p>}<div className="finance-category-form-grid"><Field label="ไอคอน"><Select value={draft.icon} onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))}>{iconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</Select></Field><Field label="สี"><Select value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value as SubjectColor }))}>{categoryColorOptions.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}</Select></Field></div>{draft.type === "expense" && <Field label="งบต่อเดือน (ไม่บังคับ)"><Input type="number" min="0" step="1" value={draft.monthlyBudget || ""} onChange={(event) => setDraft((current) => ({ ...current, monthlyBudget: Number(event.target.value) || undefined }))} placeholder="เช่น 1500" /></Field>}{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions">{editing && <button className="text-danger-button" type="button" disabled={editing.isDefault || isUsed} onClick={remove}><Trash2 /> ลบ</button>}<span /><button className="secondary-button" type="button" onClick={onClose}>ยกเลิก</button><button className="primary-button" type="submit">บันทึก</button></div></form></BottomSheet>;
}

export function NewFinancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addFinanceTransaction, financeCategories } = useAppState();
  const requestedType = searchParams.get("type");
  const requestedMonth = searchParams.get("month");
  const requestedCategoryId = searchParams.get("categoryId");
  const requestedCategory = searchParams.get("category");
  const defaultType: FinanceTransactionType = requestedType === "income" || requestedType === "saving" ? requestedType : "expense";
  const getFirstCategory = (type: FinanceTransactionType) => financeCategories.find((category) => category.type === type)?.name ?? "";
  const requestedPocket = financeCategories.find((category) => category.type === defaultType && (category.id === requestedCategoryId || category.name === requestedCategory))?.name;
  const [form, setForm] = useState<NewFinanceTransactionInput>(() => ({ type: defaultType, title: "", amount: 0, category: requestedPocket ?? getFirstCategory(defaultType), date: /^\d{4}-\d{2}$/.test(requestedMonth ?? "") ? `${requestedMonth}-01` : toLocalDateKey(new Date()), note: "" }));
  const [error, setError] = useState("");
  const categories = financeCategories.filter((category) => category.type === form.type);
  const save = (event: FormEvent) => { event.preventDefault(); if (form.title.trim().length < 2) return setError("กรุณากรอกชื่อรายการอย่างน้อย 2 ตัวอักษร"); if (!Number.isFinite(form.amount) || form.amount <= 0) return setError("กรุณากรอกจำนวนเงินมากกว่า 0 บาท"); const id = addFinanceTransaction({ ...form, title: form.title.trim(), note: form.note?.trim() }); router.push(`/finance/${id}`); };
  const setType = (type: FinanceTransactionType) => setForm((current) => ({ ...current, type, category: getFirstCategory(type) }));
  return <div className="page form-page"><PageHeader title="เพิ่มรายการ" backHref="/finance" /><Card className="form-card"><div className="form-decor finance-decor"><WalletCards /><div><strong>บันทึกทุกการใช้จ่าย</strong><span>เห็นภาพการเงินชัดขึ้นในไม่กี่วินาที</span></div></div><form className="form-grid" onSubmit={save}><div className="finance-type-picker" role="radiogroup" aria-label="ประเภทรายการ">{(["income", "expense", "saving"] as const).map((type) => <button type="button" role="radio" aria-checked={form.type === type} className={form.type === type ? "active" : ""} key={type} onClick={() => setType(type)}><TypeIcon type={type} />{labelType(type)}</button>)}</div><Field label="จำนวนเงิน (บาท)"><Input type="number" min="1" step="1" value={form.amount || ""} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} placeholder="0" /></Field><Field label="ชื่อรายการ"><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="เช่น ค่าอาหารกลางวัน" /></Field><Field label="หมวดหมู่"><Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</Select></Field><Field label="วันที่"><Input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="หมายเหตุ (ไม่บังคับ)"><Textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="รายละเอียดเพิ่มเติม" /></Field>{categories.length === 0 && <p className="form-error" role="alert">ยังไม่มีหมวดหมู่ประเภทนี้ กรุณาเพิ่มหมวดหมู่จากหน้าการเงินก่อน</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button button-block" type="submit" disabled={!form.category}>บันทึกรายการ</button></form></Card></div>;
}

export function FinanceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { financeTransactions, financeCategories, deleteFinanceTransaction, updateFinanceTransaction } = useAppState();
  const transaction = financeTransactions.find((item) => item.id === params.id);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState<NewFinanceTransactionInput | null>(null);
  const [editError, setEditError] = useState("");
  if (!transaction) return <div className="page"><PageHeader title="รายละเอียดรายการ" backHref="/finance" /><EmptyState title="ไม่พบรายการนี้" description="รายการอาจถูกลบหรืออยู่คนละ browser session" /></div>;
  const label = transaction.type === "income" ? "รายรับ" : transaction.type === "expense" ? "รายจ่าย" : "เงินออม";
  const categories = financeCategories.filter((category) => category.type === transaction.type);
  const openEditor = () => { setDraft({ type: transaction.type, title: transaction.title, amount: transaction.amount, category: transaction.category, date: transaction.date, note: transaction.note ?? "" }); setEditError(""); setIsEditing(true); };
  const save = (event: FormEvent) => { event.preventDefault(); if (!draft || draft.title.trim().length < 2) { setEditError("กรุณากรอกชื่อรายการอย่างน้อย 2 ตัวอักษร"); return; } if (!Number.isFinite(draft.amount) || draft.amount <= 0) { setEditError("กรุณากรอกจำนวนเงินมากกว่า 0 บาท"); return; } updateFinanceTransaction(transaction.id, { ...draft, title: draft.title.trim(), note: draft.note?.trim() }); setIsEditing(false); };
  const remove = () => { deleteFinanceTransaction(transaction.id); setDeleteOpen(false); router.push("/finance"); };
  return <div className="page finance-detail-page"><PageHeader title="รายละเอียดรายการ" backHref="/finance" /><Card className="finance-detail-card"><TypeIcon type={transaction.type} /><StatusPill tone={transaction.type === "income" ? "green" : transaction.type === "expense" ? "orange" : "purple"}>{label}</StatusPill><h1>{transaction.title}</h1><strong className={transaction.type === "income" ? "income-value" : transaction.type === "saving" ? "saving-value" : "expense-value"}>{transaction.type === "income" ? "+" : "−"}{formatMoney(transaction.amount)}</strong><div><span>หมวดหมู่</span><b>{transaction.category}</b><span>วันที่</span><b>{formatDate(transaction.date)}</b>{transaction.note && <><span>หมายเหตุ</span><b>{transaction.note}</b></>}</div><button className="secondary-button" type="button" onClick={openEditor}><Pencil /> แก้ไขรายการ</button><button className="text-danger-button" type="button" onClick={() => setDeleteOpen(true)}><Trash2 /> ลบรายการนี้</button></Card><BottomSheet open={isEditing} onClose={() => setIsEditing(false)} title="แก้ไขรายการ">{draft && <form className="finance-category-form" onSubmit={save}><Field label="จำนวนเงิน (บาท)"><Input type="number" min="1" value={draft.amount || ""} onChange={(event) => { setDraft({ ...draft, amount: Number(event.target.value) }); setEditError(""); }} /></Field><Field label="ชื่อรายการ"><Input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setEditError(""); }} /></Field><Field label="หมวดหมู่"><Select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</Select></Field><Field label="วันที่"><Input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field><Field label="หมายเหตุ"><Textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></Field>{editError && <p className="form-error" role="alert">{editError}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setIsEditing(false)}>ยกเลิก</button><button className="primary-button" type="submit">บันทึก</button></div></form>}</BottomSheet><BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="ลบรายการนี้"><div className="submission-dialog"><p>ต้องการลบ “{transaction.title}” ใช่หรือไม่?</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setDeleteOpen(false)}>ยกเลิก</button><button className="danger-button" type="button" onClick={remove}><Trash2 />ลบรายการ</button></div></div></BottomSheet></div>;
}

export function FinanceBudgetsPage() {
  const { financeCategories, financeTransactions, updateFinanceCategory, selectedFinanceMonth } = useAppState();
  const expenseCategories = financeCategories.filter((category) => category.type === "expense");
  const monthlyTransactions = getMonthlyFinanceSummaryForMonth(financeTransactions, selectedFinanceMonth).monthlyTransactions;
  return <div className="page finance-subpage"><PageHeader title="งบประมาณ" backHref="/finance" /><p className="goals-intro">งบรายหมวดสำหรับ {formatThaiMonthYear(selectedFinanceMonth)}</p><div className="finance-budget-list">{expenseCategories.map((category) => { const used = monthlyTransactions.filter((item) => item.type === "expense" && item.category === category.name).reduce((sum, item) => sum + item.amount, 0); const limit = category.monthlyBudget ?? 0; const percent = limit ? Math.round((used / limit) * 100) : 0; return <Card key={category.id} className="finance-budget-card"><div><span><CategoryIcon category={category} /><strong>{category.name}</strong></span><StatusPill tone={!limit ? "purple" : percent > 100 ? "red" : percent >= 80 ? "orange" : "green"}>{!limit ? "ยังไม่ตั้งงบ" : percent > 100 ? "เกินงบ" : "อยู่ในงบ"}</StatusPill></div><b>{limit ? `${formatMoney(Math.max(0, limit - used))} เหลือ` : "กำหนดงบต่อเดือน"}</b>{limit > 0 && <><ProgressBar value={Math.min(100, percent)} color={percent > 100 ? "pink" : percent >= 80 ? "orange" : category.color} /><small>ใช้ไป {formatMoney(used)} จาก {formatMoney(limit)}</small></>}<label className="finance-budget-edit"><span>งบต่อเดือน</span><Input aria-label={`งบต่อเดือน ${category.name}`} type="number" min="0" step="1" value={limit || ""} onChange={(event) => updateFinanceCategory(category.id, { monthlyBudget: Number(event.target.value) || undefined })} placeholder="ยังไม่ตั้งงบ" /></label></Card>; })}</div></div>;
}

export function FinanceSavingsPage() {
  const { savingGoals, addSavingGoal, contributeToSavingGoal } = useAppState(); const [title, setTitle] = useState(""); const [target, setTarget] = useState(0); const [contribution, setContribution] = useState<Record<string, number>>({}); const [error, setError] = useState(""); const [contributionError, setContributionError] = useState<Record<string, string>>({});
  const saveGoal = (event: FormEvent) => { event.preventDefault(); if (title.trim().length < 2) { setError("กรุณาตั้งชื่อเป้าหมายอย่างน้อย 2 ตัวอักษร"); return; } if (target <= 0) { setError("กรุณาระบุยอดเป้าหมายมากกว่า 0 บาท"); return; } addSavingGoal(title.trim(), target); setTitle(""); setTarget(0); setError(""); };
  const saveContribution = (goalId: string, amount: number) => { if (amount <= 0) { setContributionError((current) => ({ ...current, [goalId]: "กรุณาระบุจำนวนเงินมากกว่า 0 บาท" })); return; } contributeToSavingGoal(goalId, amount); setContribution((current) => ({ ...current, [goalId]: 0 })); setContributionError((current) => ({ ...current, [goalId]: "" })); };
  return <div className="page finance-subpage"><PageHeader title="เป้าหมายออมเงิน" backHref="/finance" /><p className="goals-intro">ค่อย ๆ เก็บตามเป้าหมายที่อยากทำให้สำเร็จ</p><div className="finance-savings-list">{savingGoals.map((goal) => { const percent = Math.round((goal.savedAmount / goal.targetAmount) * 100); const amount = contribution[goal.id] ?? 0; return <Card key={goal.id} className="saving-goal-card"><div><span className="finance-type-icon finance-saving"><Goal /></span><div><h2>{goal.title}</h2><p>{formatMoney(goal.savedAmount)} จาก {formatMoney(goal.targetAmount)}</p></div></div><ProgressBar value={percent} color="green" /><form onSubmit={(event) => { event.preventDefault(); saveContribution(goal.id, amount); }}><Input required type="number" min="1" value={amount || ""} onChange={(event) => { setContribution((current) => ({ ...current, [goal.id]: Number(event.target.value) })); setContributionError((current) => ({ ...current, [goal.id]: "" })); }} placeholder="เพิ่มเงินออม" /><button className="secondary-button" type="submit">เพิ่มเงิน</button>{contributionError[goal.id] && <p className="form-error" role="alert">{contributionError[goal.id]}</p>}</form></Card>; })}</div><Card className="finance-inline-form"><h2>สร้างเป้าหมายใหม่</h2><form onSubmit={saveGoal}><Input required value={title} onChange={(event) => { setTitle(event.target.value); setError(""); }} placeholder="เช่น ค่าเทอมเทอมหน้า" /><Input required type="number" min="1" value={target || ""} onChange={(event) => { setTarget(Number(event.target.value)); setError(""); }} placeholder="ยอดเป้าหมาย (บาท)" />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit">สร้างเป้าหมาย</button></form></Card></div>;
}
