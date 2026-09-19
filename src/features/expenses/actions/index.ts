'use server';

import { query } from '@/infrastructure/db';
import { getServerSession } from '@/features/auth/actions';
import { getAdminEmails, getOwnerEmail } from '@/lib/settings';
import { isAdminEmail, isOwnerEmail } from '@/config/auth-access';
import { hasPermission, PERMISSION_CODES } from '@/lib/permissions';
import {
  expenseTransactionSchema,
  updateExpenseTransactionSchema,
  startingBalanceSchema,
} from '../schemas';
import type {
  ExpenseSummary,
  DateFilterType,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseTransaction,
} from '../types';

async function authorizeAdmin(requiredActionPerm?: string | string[]) {
  const { user } = await getServerSession();
  if (!user) return { authorized: false, error: 'Not authenticated', userId: null };

  const adminEmails = await getAdminEmails();
  const isAdminByEmail = isAdminEmail(user.email, adminEmails);

  const profileRes = await query('SELECT role FROM public.profiles WHERE id = $1', [user.id]);
  const profileRole = profileRes.rows[0]?.role;
  const effectiveRole = profileRole || user.role;

  const isUserAdmin =
    user.role === 'admin' ||
    user.role === 'super_admin' ||
    profileRole === 'admin' ||
    profileRole === 'super_admin' ||
    isAdminByEmail;

  const required = requiredActionPerm || [
    PERMISSION_CODES.EXPENSES,
    PERMISSION_CODES.EXP_ADD,
    PERMISSION_CODES.EXP_INVEST,
    'EXP_MANAGE',
    'expenses.manage',
  ];

  const hasExpensePerm = hasPermission(
    user.permissions,
    required,
    effectiveRole
  );

  if (!isUserAdmin && !hasExpensePerm) {
    return { authorized: false, error: 'Forbidden. Admin access required.', userId: null };
  }

  return { authorized: true, userId: user.id };
}

async function authorizeAdminOrOwner() {
  const { user } = await getServerSession();
  if (!user) return { authorized: false, error: 'Not authenticated', userId: null, isOwner: false };

  const [adminEmails, ownerEmail] = await Promise.all([
    getAdminEmails(),
    getOwnerEmail(),
  ]);

  const isAdminByEmail = isAdminEmail(user.email, adminEmails);
  const isOwner = isOwnerEmail(user.email, ownerEmail);

  const profileRes = await query('SELECT role FROM public.profiles WHERE id = $1', [user.id]);
  const profileRole = profileRes.rows[0]?.role;
  const effectiveRole = profileRole || user.role;

  const isUserAdmin =
    user.role === 'admin' ||
    user.role === 'super_admin' ||
    profileRole === 'admin' ||
    profileRole === 'super_admin' ||
    isAdminByEmail;

  const hasExpensePerm = hasPermission(
    user.permissions,
    [
      PERMISSION_CODES.EXPENSES,
      PERMISSION_CODES.EXP_ADD,
      PERMISSION_CODES.EXP_INVEST,
      'EXP_MANAGE',
      'expenses.manage',
    ],
    effectiveRole
  );

  if (!isUserAdmin && !isOwner && !hasExpensePerm) {
    return { authorized: false, error: 'Forbidden. Access required.', userId: null, isOwner: false };
  }

  return { authorized: true, userId: user.id, isOwner };
}

function formatExpenseError(err: unknown, defaultMessage: string): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : typeof err === 'string'
      ? err
      : defaultMessage;

  return msg || defaultMessage;
}

function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(
  filter: DateFilterType,
  customStart?: string,
  customEnd?: string
): { startDate?: string; endDate?: string } {
  const now = new Date();
  const todayStr = formatDateISO(now);

  switch (filter) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = formatDateISO(y);
      return { startDate: yStr, endDate: yStr };
    }
    case 'this_week': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startDate: formatDateISO(monday), endDate: formatDateISO(sunday) };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: formatDateISO(firstDay), endDate: formatDateISO(lastDay) };
    }
    case 'custom':
      return { startDate: customStart, endDate: customEnd };
    case 'all':
    default:
      return {};
  }
}

/**
 * Fetch complete expense summary, starting balance, period metrics, and running balances
 */
export async function getExpenseSummary(
  filter: DateFilterType = 'all',
  customStart?: string,
  customEnd?: string
): Promise<{ success: boolean; data?: ExpenseSummary; error?: string }> {
  const auth = await authorizeAdminOrOwner();
  if (!auth.authorized || !auth.userId) {
    return { success: false, error: auth.error };
  }

  try {
    // 1. Fetch starting balance
    let startingBalance = 0;
    try {
      const settingsRes = await query(
        `SELECT starting_balance FROM public.expense_settings ORDER BY created_at DESC LIMIT 1`
      );
      if (settingsRes.rows.length > 0) {
        startingBalance = Number(settingsRes.rows[0].starting_balance) || 0;
      }
    } catch (e) {
      console.error('Error fetching starting_balance:', e);
    }

    // 2. Fetch ALL transactions sorted chronologically (ASC) to calculate running balance
    const txRes = await query(
      `SELECT id, user_id, transaction_date::text, description, amount, type, note, created_at, updated_at
       FROM public.expense_transactions
       ORDER BY transaction_date ASC, created_at ASC`
    );

    let running = startingBalance;
    let totalIncome = 0;
    let totalExpenses = 0;

    const allCalculated: ExpenseTransaction[] = (txRes.rows || []).map((raw: any) => {
      const amount = Number(raw.amount) || 0;
      const type = raw.type as 'income' | 'expense';

      if (type === 'income') {
        running += amount;
        totalIncome += amount;
      } else {
        running -= amount;
        totalExpenses += amount;
      }

      return {
        id: raw.id,
        user_id: raw.user_id,
        transaction_date: raw.transaction_date,
        description: raw.description,
        amount,
        type,
        note: raw.note ?? null,
        running_balance: running,
        created_at: new Date(raw.created_at).toISOString(),
        updated_at: new Date(raw.updated_at).toISOString(),
      };
    });

    const overallAvailableBalance = running;

    // 3. Apply date filter
    const { startDate, endDate } = getDateRange(filter, customStart, customEnd);

    const filteredTransactions = allCalculated.filter((tx) => {
      if (startDate && tx.transaction_date < startDate) return false;
      if (endDate && tx.transaction_date > endDate) return false;
      return true;
    });

    // 4. Calculate period totals
    let periodIncome = 0;
    let periodExpenses = 0;

    filteredTransactions.forEach((tx) => {
      if (tx.type === 'income') {
        periodIncome += tx.amount;
      } else {
        periodExpenses += tx.amount;
      }
    });

    const periodNet = periodIncome - periodExpenses;

    // 5. Sort display transactions DESC (most recent first)
    const sortedFiltered = [...filteredTransactions].sort((a, b) => {
      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      return b.created_at.localeCompare(a.created_at);
    });

    return {
      success: true,
      data: {
        startingBalance,
        overallAvailableBalance,
        totalIncome,
        totalExpenses,
        periodIncome,
        periodExpenses,
        periodNet,
        transactions: sortedFiltered,
        filter,
        customStart,
        customEnd,
      },
    };
  } catch (err: unknown) {
    console.error('getExpenseSummary error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch expense summary',
    };
  }
}

/**
 * Set or update store initial starting balance
 */
export async function updateStartingBalance(
  startingBalance: number
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizeAdmin();
  if (!auth.authorized || !auth.userId) {
    return { success: false, error: auth.error };
  }
  const { userId } = auth;

  const parsed = startingBalanceSchema.safeParse({ starting_balance: startingBalance });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid starting balance' };
  }

  try {
    const existing = await query(`SELECT id FROM public.expense_settings LIMIT 1`);
    if (existing.rows.length > 0) {
      await query(
        `UPDATE public.expense_settings SET starting_balance = $1, user_id = $2, updated_at = NOW() WHERE id = $3`,
        [parsed.data.starting_balance, userId, existing.rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO public.expense_settings (user_id, starting_balance) VALUES ($1, $2)`,
        [userId, parsed.data.starting_balance]
      );
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('updateStartingBalance error:', err);
    return {
      success: false,
      error: formatExpenseError(err, 'Failed to update starting balance'),
    };
  }
}

/**
 * Add a new income or expense transaction
 */
export async function addExpenseTransaction(
  input: CreateExpenseInput
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizeAdmin();
  if (!auth.authorized || !auth.userId) {
    return { success: false, error: auth.error };
  }
  const { userId } = auth;

  const parsed = expenseTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid transaction data' };
  }

  try {
    await query(
      `INSERT INTO public.expense_transactions (user_id, transaction_date, description, amount, type, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        parsed.data.transaction_date,
        parsed.data.description,
        parsed.data.amount,
        parsed.data.type,
        parsed.data.note ?? null,
      ]
    );

    return { success: true };
  } catch (err: unknown) {
    console.error('addExpenseTransaction insert error:', err);
    return {
      success: false,
      error: formatExpenseError(err, 'Failed to add transaction'),
    };
  }
}

/**
 * Edit an existing transaction
 */
export async function updateExpenseTransaction(
  id: string,
  input: UpdateExpenseInput
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizeAdmin();
  if (!auth.authorized || !auth.userId) {
    return { success: false, error: auth.error };
  }

  if (!id) return { success: false, error: 'Transaction ID is required' };

  const parsed = updateExpenseTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid transaction update data' };
  }

  try {
    const existing = await query(`SELECT * FROM public.expense_transactions WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return { success: false, error: 'Transaction not found' };
    }

    const current = existing.rows[0];
    const newDate = parsed.data.transaction_date ?? current.transaction_date;
    const newDesc = parsed.data.description ?? current.description;
    const newAmount = parsed.data.amount ?? current.amount;
    const newType = parsed.data.type ?? current.type;
    const newNote = parsed.data.note !== undefined ? parsed.data.note : current.note;

    await query(
      `UPDATE public.expense_transactions
       SET transaction_date = $1, description = $2, amount = $3, type = $4, note = $5, updated_at = NOW()
       WHERE id = $6`,
      [newDate, newDesc, newAmount, newType, newNote, id]
    );

    return { success: true };
  } catch (err: unknown) {
    console.error('updateExpenseTransaction error:', err);
    return {
      success: false,
      error: formatExpenseError(err, 'Failed to update transaction'),
    };
  }
}

/**
 * Delete a transaction
 */
export async function deleteExpenseTransaction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizeAdmin();
  if (!auth.authorized || !auth.userId) {
    return { success: false, error: auth.error };
  }

  if (!id) return { success: false, error: 'Transaction ID is required' };

  try {
    await query(`DELETE FROM public.expense_transactions WHERE id = $1`, [id]);
    return { success: true };
  } catch (err: unknown) {
    console.error('deleteExpenseTransaction error:', err);
    return {
      success: false,
      error: formatExpenseError(err, 'Failed to delete transaction'),
    };
  }
}
