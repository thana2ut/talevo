import type { FinanceSettings, FinanceTransaction } from "@/types";

export function toLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalMonthKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyToDate(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

export function getPreviousMonthKey(monthKey: string) {
  const date = monthKeyToDate(monthKey);
  return getLocalMonthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

export function getNextMonthKey(monthKey: string) {
  const date = monthKeyToDate(monthKey);
  return getLocalMonthKey(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

export function formatThaiMonthYear(monthKey: string) {
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(monthKeyToDate(monthKey));
}

export function isDateInMonth(dateKey: string, monthKey: string) {
  return dateKey.slice(0, 7) === monthKey;
}

export function getFinanceTransactionsForDate(transactions: FinanceTransaction[], referenceDate: Date) {
  const key = toLocalDateKey(referenceDate);
  return transactions.filter((item) => item.date === key);
}

export function getFinanceTransactionsForMonth(transactions: FinanceTransaction[], referenceDate: Date) {
  return getFinanceTransactionsForMonthKey(transactions, getLocalMonthKey(referenceDate));
}

export function getFinanceTransactionsForMonthKey(transactions: FinanceTransaction[], monthKey: string) {
  return transactions.filter((item) => isDateInMonth(item.date, monthKey));
}

export function getMonthlyFinanceSummary(transactions: FinanceTransaction[], referenceDate: Date) {
  return getMonthlyFinanceSummaryForMonth(transactions, getLocalMonthKey(referenceDate));
}

export function getMonthlyFinanceSummaryForMonth(transactions: FinanceTransaction[], monthKey: string) {
  const monthlyTransactions = getFinanceTransactionsForMonthKey(transactions, monthKey);
  const totalFor = (type: FinanceTransaction["type"]) => monthlyTransactions.filter((item) => item.type === type).reduce((sum, item) => sum + item.amount, 0);
  const income = totalFor("income");
  const expenses = totalFor("expense");
  const savingsTransfers = totalFor("saving");
  return { monthlyTransactions, income, expenses, savingsTransfers, remaining: getMonthlyRemaining(income, expenses, savingsTransfers) };
}

export function getMonthlyRemaining(income: number, expenses: number, savingsTransfers: number) {
  return income - expenses - savingsTransfers;
}

export function getTodayExpense(transactions: FinanceTransaction[], referenceDate: Date) {
  return getFinanceTransactionsForDate(transactions, referenceDate).filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
}

export function getDailyBudgetStatus(settings: FinanceSettings, transactions: FinanceTransaction[], referenceDate: Date) {
  const spent = getTodayExpense(transactions, referenceDate);
  const budget = Math.max(0, settings.dailyBudget);
  const remaining = budget - spent;
  const percent = budget === 0 ? 0 : Math.round((spent / budget) * 100);
  return { budget, spent, remaining, percent, visualPercent: Math.min(100, percent), isOverBudget: remaining < 0 };
}
