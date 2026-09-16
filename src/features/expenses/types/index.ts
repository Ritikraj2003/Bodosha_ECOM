export type ExpenseType = 'income' | 'expense';

export type DateFilterType = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom' | 'all';

export interface ExpenseTransaction {
  id: string;
  user_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  type: ExpenseType;
  note?: string | null;
  running_balance: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSettings {
  id: string;
  user_id: string;
  starting_balance: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSummary {
  startingBalance: number;
  overallAvailableBalance: number;
  totalIncome: number;
  totalExpenses: number;
  periodIncome: number;
  periodExpenses: number;
  periodNet: number;
  transactions: ExpenseTransaction[];
  filter: DateFilterType;
  customStart?: string;
  customEnd?: string;
}

export interface CreateExpenseInput {
  transaction_date: string;
  description: string;
  amount: number;
  type: ExpenseType;
  note?: string | null;
}

export interface UpdateExpenseInput {
  transaction_date?: string;
  description?: string;
  amount?: number;
  type?: ExpenseType;
  note?: string | null;
}
