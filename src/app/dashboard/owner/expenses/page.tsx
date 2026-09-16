'use client';

import ExpenseTracker from '@/features/expenses/components/ExpenseTracker';

export default function OwnerExpensesPage() {
  return <ExpenseTracker readOnly={true} />;
}
