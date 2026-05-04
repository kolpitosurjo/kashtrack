
import { openDB, DBSchema, IDBPDatabase } from 'idb';

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
}

export enum TransactionSource {
  CASH = 'CASH',
  BANK = 'BANK',
  BKASH = 'BKASH',
}

export enum RecurrenceInterval {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: string;
  source: TransactionSource;
  dateMillis: number;
  notes: string;
}

export interface RecurringTransaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: string;
  source: TransactionSource;
  interval: RecurrenceInterval;
  notes: string;
  startDate: number;
  lastProcessedDate: number;
}

export interface DailyBudget {
  id: string;
  amount: number;
  resetHour: number;
}

export interface Settings {
  id: string;
  currency: string;
  themeMode: 'LIGHT' | 'DARK' | 'SYSTEM';
}

interface BudgetDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: { 'by-date': number; 'by-category': string };
  };
  budgets: {
    key: string;
    value: DailyBudget;
  };
  settings: {
    key: string;
    value: Settings;
  };
  categories: {
    key: string;
    value: { name: string };
  };
  recurring_transactions: {
    key: string;
    value: RecurringTransaction;
  };
}

let dbPromise: Promise<IDBPDatabase<BudgetDB>>;

export const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<BudgetDB>('BudgetDB', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
          txStore.createIndex('by-date', 'dateMillis');
          txStore.createIndex('by-category', 'category');

          db.createObjectStore('budgets', { keyPath: 'id' });
          db.createObjectStore('settings', { keyPath: 'id' });
          const catStore = db.createObjectStore('categories', { keyPath: 'name' });

          const defaultCategories = ['Food', 'Dorm/Rent', 'University', 'Transport', 'Entertainment', 'Utilities', 'Income', 'Other'];
          defaultCategories.forEach(cat => catStore.put({ name: cat }));
        }
        
        if (oldVersion < 2) {
          db.createObjectStore('recurring_transactions', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};
