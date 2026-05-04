
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Home, 
  PlusCircle, 
  LayoutGrid, 
  Target, 
  Settings as SettingsIcon,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Wallet,
  Building2,
  Trash2,
  Download,
  Repeat,
  RefreshCcw,
  ArrowRightLeft,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  format, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth,
  isWithinInterval,
  subDays,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  isBefore
} from 'date-fns';

import { 
  getDB, 
  Transaction, 
  TransactionType, 
  TransactionSource, 
  DailyBudget, 
  Settings,
  RecurringTransaction,
  RecurrenceInterval
} from './lib/db';
import { cn, formatCurrency } from './lib/utils';

// --- Components ---

const BottomNav = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'categories', icon: LayoutGrid, label: 'Categories' },
    { id: 'add', icon: PlusCircle, label: 'Add', primary: true },
    { id: 'limit', icon: Target, label: 'Limit' },
    { id: 'settings', icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-vault-surface border-t border-vault-border pb-safe">
      <div className="flex justify-around items-center h-20 max-w-lg mx-auto px-4">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative flex flex-col items-center">
            {tab.primary ? (
              <div className="relative -top-6">
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className="w-16 h-16 bg-vault-primary rounded-[22px] text-white flex items-center justify-center shadow-xl shadow-blue-200 border-4 border-white active:scale-95 transition-transform"
                >
                  <PlusCircle className="w-8 h-8" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center gap-1 transition-colors",
                  activeTab === tab.id ? "text-vault-primary" : "text-vault-text-dim"
                )}
              >
                <tab.icon className="w-6 h-6" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
};

// --- Main App Logic ---

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dailyBudget, setDailyBudget] = useState<DailyBudget | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [appSettings, setAppSettings] = useState<Settings | null>(null);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const processRecurring = async () => {
    const db = await getDB();
    const recurring = await db.getAll('recurring_transactions');
    const now = Date.now();
    let updated = false;

    for (const rt of recurring) {
      let nextDate = rt.lastProcessedDate;
      const newTransactions: Transaction[] = [];

      while (true) {
        let candidate: number;
        switch (rt.interval) {
          case RecurrenceInterval.DAILY: candidate = addDays(nextDate, 1).getTime(); break;
          case RecurrenceInterval.WEEKLY: candidate = addWeeks(nextDate, 1).getTime(); break;
          case RecurrenceInterval.MONTHLY: candidate = addMonths(nextDate, 1).getTime(); break;
          case RecurrenceInterval.YEARLY: candidate = addYears(nextDate, 1).getTime(); break;
          default: candidate = now + 1;
        }

        if (candidate > now) break;

        newTransactions.push({
          id: crypto.randomUUID(),
          amount: rt.amount,
          type: rt.type,
          category: rt.category,
          source: rt.source,
          dateMillis: candidate,
          notes: `${rt.notes} (Recurring)`
        });
        nextDate = candidate;
      }

      if (newTransactions.length > 0) {
        const tx = db.transaction(['transactions', 'recurring_transactions'], 'readwrite');
        for (const nt of newTransactions) {
          await tx.objectStore('transactions').put(nt);
        }
        await tx.objectStore('recurring_transactions').put({
          ...rt,
          lastProcessedDate: nextDate
        });
        updated = true;
      }
    }
    return updated;
  };

  const refreshData = async () => {
    const db = await getDB();
    
    // Process recurring items first
    const updated = await processRecurring();
    
    const txs = await db.getAll('transactions');
    const budget = await db.get('budgets', '1');
    const settings = await db.get('settings', '1');
    const cats = await db.getAll('categories');
    const recs = await db.getAll('recurring_transactions');

    setTransactions(txs.sort((a, b) => b.dateMillis - a.dateMillis));
    setDailyBudget(budget || { id: '1', amount: 50, resetHour: 0 });
    setAppSettings(settings || { id: '1', currency: 'USD', themeMode: 'SYSTEM' });
    setCategories(cats.map(c => c.name));
    setRecurringTransactions(recs);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // --- Calculations ---

  const balances = useMemo(() => {
    let cash = 0;
    let bank = 0;
    let bkash = 0;
    transactions.forEach(t => {
      const amount = t.type === TransactionType.INCOME ? t.amount : -t.amount;
      if (t.source === TransactionSource.CASH) cash += amount;
      else if (t.source === TransactionSource.BANK) bank += amount;
      else if (t.source === TransactionSource.BKASH) bkash += amount;
    });
    return { cash, bank, bkash, total: cash + bank + bkash };
  }, [transactions]);

  const todaySpending = useMemo(() => {
    const today = new Date();
    // Simplified daily reset logic
    const start = startOfDay(today).getTime();
    const end = endOfDay(today).getTime();
    
    return transactions
      .filter(t => t.type === TransactionType.EXPENSE && t.dateMillis >= start && t.dateMillis <= end)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const budgetPercent = dailyBudget ? (todaySpending / dailyBudget.amount) * 100 : 0;

  // --- Screen Switcher ---

  const renderScreen = () => {
    switch (activeTab) {
      case 'home': return (
        <HomeScreen 
          balances={balances} 
          todaySpending={todaySpending} 
          limit={dailyBudget?.amount || 0} 
          recentTransactions={transactions.slice(0, 10)}
          currency={appSettings?.currency || 'USD'}
          onOpenTransfer={() => setShowTransferModal(true)}
        />
      );
      case 'categories': return (
        <CategoriesScreen 
          transactions={transactions} 
          categories={categories}
          currency={appSettings?.currency || 'USD'}
          onAddCategory={async (name) => {
             const db = await getDB();
             await db.put('categories', { name });
             refreshData();
          }}
          onDeleteCategory={async (name) => {
             const db = await getDB();
             await db.delete('categories', name);
             refreshData();
          }}
          recurringTransactions={recurringTransactions}
          onDeleteRecurring={async (id) => {
             const db = await getDB();
             await db.delete('recurring_transactions', id);
             refreshData();
          }}
        />
      );
      case 'add': return (
        <AddScreen 
          categories={categories} 
          onSave={async (tx: any, isRecurring: boolean, interval: RecurrenceInterval) => {
            const db = await getDB();
            if (isRecurring) {
              await db.put('recurring_transactions', {
                id: crypto.randomUUID(),
                ...tx,
                interval,
                startDate: tx.dateMillis,
                lastProcessedDate: tx.dateMillis
              });
              // Also add the first one
              await db.put('transactions', { ...tx, id: crypto.randomUUID(), notes: `${tx.notes} (Recurring Start)` });
            } else {
              await db.put('transactions', tx);
            }
            await refreshData();
            setActiveTab('home');
          }}
        />
      );
      case 'limit': return (
        <LimitScreen 
          dailyBudget={dailyBudget} 
          transactions={transactions}
          onSave={async (budget) => {
            const db = await getDB();
            await db.put('budgets', budget);
            refreshData();
            setActiveTab('home');
          }}
          currency={appSettings?.currency || 'USD'}
        />
      );
      case 'settings': return (
        <SettingsScreen 
          settings={appSettings}
          onSave={async (s) => {
            const db = await getDB();
            await db.put('settings', s);
            refreshData();
          }}
          onClearAll={async () => {
            const db = await getDB();
            await db.clear('transactions');
            refreshData();
          }}
          transactions={transactions}
        />
      );
      default: return null;
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  return (
    <div className="max-w-lg mx-auto bg-vault-bg min-h-screen pb-32 shadow-2xl overflow-x-hidden border-x border-vault-border">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {showTransferModal && (
        <TransferModal 
          balances={balances}
          currency={appSettings?.currency || 'USD'}
          onClose={() => setShowTransferModal(false)}
          onTransfer={async (from: TransactionSource, to: TransactionSource, amount: number) => {
            const db = await getDB();
            const id1 = crypto.randomUUID();
            const id2 = crypto.randomUUID();
            const now = Date.now();
            await db.put('transactions', {
              id: id1,
              amount,
              type: TransactionType.EXPENSE,
              source: from,
              category: 'Transfer',
              dateMillis: now,
              notes: `Transfer to ${to}`
            });
            await db.put('transactions', {
              id: id2,
              amount,
              type: TransactionType.INCOME,
              source: to,
              category: 'Transfer',
              dateMillis: now,
              notes: `Transfer from ${from}`
            });
            setShowTransferModal(false);
            refreshData();
          }}
        />
      )}
    </div>
  );
}

function TransferModal({ balances, currency, onClose, onTransfer }: any) {
  const [from, setFrom] = useState<TransactionSource>(TransactionSource.CASH);
  const [to, setTo] = useState<TransactionSource>(TransactionSource.BANK);
  const [amount, setAmount] = useState('');

  const sources = [
    { id: TransactionSource.CASH, label: 'Cash', balance: balances.cash },
    { id: TransactionSource.BANK, label: 'Bank', balance: balances.bank },
    { id: TransactionSource.BKASH, label: 'bKash', balance: balances.bkash },
  ];

  const handleTransfer = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0 || from === to) return;
    onTransfer(from, to, val);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center">
      <motion.div 
        initial={{ y: "100%" }} animate={{ y: 0 }}
        className="bg-vault-surface w-full max-w-lg rounded-t-[32px] p-8 space-y-6"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-vault-primary">Transfer Funds</h2>
          <button onClick={onClose} className="p-2 bg-vault-bg rounded-full"><PlusCircle className="rotate-45 text-vault-text-dim" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-vault-text-dim uppercase mb-2">From</label>
              <select value={from} onChange={(e) => setFrom(e.target.value as any)} className="w-full bg-vault-bg p-4 rounded-2xl font-bold outline-none border border-vault-border">
                {sources.map(s => <option key={s.id} value={s.id}>{s.label} ({formatCurrency(s.balance, currency)})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-vault-text-dim uppercase mb-2">To</label>
              <select value={to} onChange={(e) => setTo(e.target.value as any)} className="w-full bg-vault-bg p-4 rounded-2xl font-bold outline-none border border-vault-border">
                {sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-vault-text-dim uppercase mb-2 ml-1">Amount</label>
            <input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-vault-bg border border-vault-border rounded-2xl px-4 py-4 text-2xl font-black text-vault-text focus:outline-none"
              placeholder="0.00"
            />
          </div>
        </div>

        <button 
          onClick={handleTransfer}
          className="w-full bg-vault-primary text-white py-5 rounded-[24px] font-black uppercase tracking-widest shadow-xl"
        >Execute Transfer</button>
      </motion.div>
    </div>
  );
}

// --- Specific Screens ---

function HomeScreen({ balances, todaySpending, limit, recentTransactions, currency, onOpenTransfer }: any) {
  const percent = Math.min((todaySpending / limit) * 100, 100);
  const color = percent >= 100 ? 'stroke-vault-red' : percent >= 80 ? 'stroke-amber-500' : 'stroke-vault-primary';

  return (
    <div className="flex flex-col min-h-screen">
      <header className="flex items-center justify-between px-6 py-6 bg-vault-surface border-b border-vault-border">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-vault-primary rounded-xl flex items-center justify-center">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-vault-primary">VAULT</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={onOpenTransfer}
            className="p-2 bg-vault-bg rounded-lg text-vault-primary hover:bg-blue-50 transition-colors"
          >
            <ArrowRightLeft className="w-5 h-5" />
          </button>
          <div className="text-right">
            <p className="text-[10px] font-bold text-vault-text-dim uppercase tracking-widest">{format(new Date(), 'EEEE, MMM d')}</p>
            <p className="text-sm font-medium">Welcome back</p>
          </div>
        </div>
      </header>

      <div className="px-6 py-8 space-y-8">
        {/* Total Balance Card */}
        <div className="space-y-4">
          <div className="bg-vault-primary text-white p-8 rounded-[28px] shadow-lg shadow-blue-100">
            <p className="text-xs font-semibold opacity-80 uppercase tracking-widest mb-1">Total Balance</p>
            <h2 className="text-4xl font-bold">{formatCurrency(balances.total, currency)}</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-vault-surface p-4 rounded-[24px] border border-vault-border">
              <p className="text-[8px] font-bold text-vault-text-dim uppercase tracking-widest mb-1">Cash</p>
              <h3 className="text-base font-bold truncate">{formatCurrency(balances.cash, currency)}</h3>
            </div>
            <div className="bg-vault-surface p-4 rounded-[24px] border border-vault-border">
              <p className="text-[8px] font-bold text-vault-text-dim uppercase tracking-widest mb-1">Bank</p>
              <h3 className="text-base font-bold text-vault-primary truncate">{formatCurrency(balances.bank, currency)}</h3>
            </div>
            <div className="bg-vault-surface p-4 rounded-[24px] border border-vault-border">
              <p className="text-[8px] font-bold text-vault-text-dim uppercase tracking-widest mb-1">bKash</p>
              <h3 className="text-base font-bold text-vault-primary truncate">{formatCurrency(balances.bkash, currency)}</h3>
            </div>
          </div>
        </div>

        {/* Daily Spending Card */}
        <div className="bg-white p-8 rounded-[28px] border border-vault-border flex flex-col sm:flex-row items-center gap-8 shadow-sm">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="80" cy="80" r="68" stroke="#E1E2E9" strokeWidth="12" fill="transparent" />
              <circle 
                cx="80" cy="80" r="68" 
                stroke="currentColor" 
                strokeWidth="12" 
                strokeDasharray={427} 
                strokeDashoffset={427 - (427 * percent) / 100}
                className={cn("transition-all duration-700", color.replace('stroke-', 'text-'))}
                strokeLinecap="round" 
                fill="transparent" 
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black">{Math.round(percent)}%</span>
              <span className="text-[10px] font-bold text-vault-text-dim uppercase">Used</span>
            </div>
          </div>
          <div className="flex-1 space-y-4 text-center sm:text-left">
            <div>
              <h4 className="text-xl font-bold mb-1">Daily Budget</h4>
              <p className="text-vault-text-dim text-xs leading-relaxed">
                {percent >= 100 
                  ? "Daily limit exceeded! Control your spending." 
                  : percent >= 80 
                    ? "Warning: Almost at your limit." 
                    : "You're doing great with your budget today!"
                }
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-vault-bg p-3 rounded-2xl">
                <p className="text-[8px] font-bold text-vault-text-dim uppercase mb-0.5">Budget</p>
                <p className="text-sm font-bold">{formatCurrency(limit, currency)}</p>
              </div>
              <div className="bg-vault-bg p-3 rounded-2xl border border-blue-100">
                <p className="text-[8px] font-bold text-vault-primary uppercase mb-0.5">Spent</p>
                <p className="text-sm font-bold text-vault-primary">{formatCurrency(todaySpending, currency)}</p>
              </div>
              <div className="bg-vault-bg p-3 rounded-2xl">
                <p className="text-[8px] font-bold text-vault-text-dim uppercase mb-0.5">Left</p>
                <p className="text-sm font-bold">{formatCurrency(Math.max(0, limit - todaySpending), currency)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions List */}
        <section className="bg-vault-surface rounded-[28px] border border-vault-border flex flex-col overflow-hidden shadow-sm">
          <div className="p-6 border-b border-vault-bg flex justify-between items-center">
            <h4 className="font-bold text-lg">Recent Activity</h4>
            <span className="text-xs text-vault-primary font-bold cursor-pointer uppercase tracking-wider">Historical Log</span>
          </div>
          <div className="px-2 py-4 space-y-1">
            {recentTransactions.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between p-4 bg-transparent hover:bg-vault-bg rounded-2xl transition-colors group">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm border border-black/5",
                    tx.type === TransactionType.INCOME ? "bg-emerald-50" : "bg-rose-50"
                  )}>
                    {tx.type === TransactionType.INCOME ? '💰' : '💸'}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-vault-text">{tx.category}</p>
                    <p className="text-xs text-vault-text-dim leading-none mt-1">
                      {tx.notes || format(tx.dateMillis, 'MMM d, yyyy')} • {tx.source}
                    </p>
                  </div>
                </div>
                <p className={cn(
                  "font-bold text-base",
                  tx.type === TransactionType.INCOME ? "text-vault-green" : "text-vault-red"
                )}>
                  {tx.type === TransactionType.INCOME ? '+' : '-'}{formatCurrency(tx.amount, currency)}
                </p>
              </div>
            ))}
            {recentTransactions.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-vault-bg rounded-full flex items-center justify-center mx-auto mb-4 border border-vault-border">
                  <TrendingUp className="w-8 h-8 text-vault-text-dim opacity-30" />
                </div>
                <p className="text-vault-text-dim text-sm italic">No recent activity detected.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function AddScreen({ categories, onSave }: any) {
  const [type, setType] = useState<TransactionType>(TransactionType.EXPENSE);
  const [source, setSource] = useState<TransactionSource>(TransactionSource.CASH);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(categories[0] || 'Food');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isRecurring, setIsRecurring] = useState(false);
  const [interval, setInterval] = useState<RecurrenceInterval>(RecurrenceInterval.MONTHLY);

  const handleSave = () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return;
    onSave({
      amount: val,
      type,
      source,
      category,
      notes,
      dateMillis: new Date(date).getTime()
    }, isRecurring, interval);
  };

  return (
    <div className="px-6 pt-8 space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-vault-primary">Add Entry</h2>
        <p className="text-vault-text-dim text-sm mt-1">Record a new financial movement</p>
      </div>
      
      <div className="flex bg-vault-surface border border-vault-border p-1 rounded-[20px]">
        <button 
          onClick={() => setType(TransactionType.EXPENSE)}
          className={cn(
            "flex-1 py-3 rounded-[16px] text-xs font-bold uppercase tracking-wider transition-all",
            type === TransactionType.EXPENSE ? "bg-vault-primary text-white shadow-md shadow-blue-100" : "text-vault-text-dim"
          )}
        >Expense</button>
        <button 
          onClick={() => setType(TransactionType.INCOME)}
          className={cn(
            "flex-1 py-3 rounded-[16px] text-xs font-bold uppercase tracking-wider transition-all",
            type === TransactionType.INCOME ? "bg-vault-primary text-white shadow-md shadow-blue-100" : "text-vault-text-dim"
          )}
        >Income</button>
      </div>

      <div className="space-y-6">
        <div className="bg-vault-surface p-6 rounded-[28px] border border-vault-border space-y-6 shadow-sm">
          <div>
            <label className="block text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-2 ml-1">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-vault-text-dim">$</span>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-vault-bg border border-vault-border rounded-2xl pl-10 pr-4 py-4 text-3xl font-black focus:outline-none focus:border-vault-primary transition-colors text-vault-text"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-2 ml-1">Category</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-vault-bg border border-vault-border rounded-2xl px-4 py-4 font-bold text-sm focus:outline-none appearance-none"
              >
                {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-2 ml-1">Date</label>
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-vault-bg border border-vault-border rounded-2xl px-4 py-4 font-bold text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-2 ml-1">Payment Method</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setSource(TransactionSource.CASH)}
                className={cn(
                  "flex-1 py-3 px-1 rounded-2xl border-2 text-[10px] font-bold transition-all flex items-center justify-center gap-1",
                  source === TransactionSource.CASH ? "bg-blue-50 border-vault-primary text-vault-primary" : "bg-vault-bg border-transparent text-vault-text-dim"
                )}
              >
                <Wallet className="w-3 h-3" /> Cash
              </button>
              <button 
                onClick={() => setSource(TransactionSource.BANK)}
                className={cn(
                  "flex-1 py-3 px-1 rounded-2xl border-2 text-[10px] font-bold transition-all flex items-center justify-center gap-1",
                  source === TransactionSource.BANK ? "bg-blue-50 border-vault-primary text-vault-primary" : "bg-vault-bg border-transparent text-vault-text-dim"
                )}
              >
                <Building2 className="w-3 h-3" /> Bank
              </button>
              <button 
                onClick={() => setSource(TransactionSource.BKASH)}
                className={cn(
                  "flex-1 py-3 px-1 rounded-2xl border-2 text-[10px] font-bold transition-all flex items-center justify-center gap-1",
                  source === TransactionSource.BKASH ? "bg-blue-50 border-vault-primary text-vault-primary" : "bg-vault-bg border-transparent text-vault-text-dim"
                )}
              >
                <Smartphone className="w-3 h-3" /> bKash
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-vault-bg">
            <button 
              onClick={() => setIsRecurring(!isRecurring)}
              className={cn(
                "flex items-center gap-2 text-xs font-bold transition-colors",
                isRecurring ? "text-vault-primary" : "text-vault-text-dim"
              )}
            >
              <RefreshCcw className={cn("w-4 h-4", isRecurring && "animate-spin-slow")} />
              {isRecurring ? 'Recurring Enabled' : 'Make Recurring'}
            </button>
            
            {isRecurring && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4">
                <select 
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as any)}
                  className="w-full bg-vault-bg border border-vault-border rounded-xl px-4 py-3 font-bold text-xs outline-none"
                >
                  <option value={RecurrenceInterval.DAILY}>Every Day</option>
                  <option value={RecurrenceInterval.WEEKLY}>Every Week</option>
                  <option value={RecurrenceInterval.MONTHLY}>Every Month</option>
                  <option value={RecurrenceInterval.YEARLY}>Every Year</option>
                </select>
              </motion.div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-2 ml-1">Notes</label>
            <input 
              type="text" 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was this for?"
              className="w-full bg-vault-bg border border-vault-border rounded-2xl px-4 py-4 text-sm font-medium focus:outline-none focus:border-vault-primary"
            />
          </div>
        </div>
      </div>

      <button 
        onClick={handleSave}
        className="w-full bg-vault-primary text-white py-5 rounded-[24px] font-black text-lg shadow-xl shadow-blue-200 active:scale-[0.98] transition-all uppercase tracking-widest"
      >
        Record Transaction
      </button>
    </div>
  );
}

function CategoriesScreen({ transactions, categories, currency, onAddCategory, onDeleteCategory, recurringTransactions, onDeleteRecurring }: any) {
  const [view, setView] = useState<'Categories' | 'Monthly' | 'Recurring'>('Categories');
  const [filter, setFilter] = useState('Month');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredTxs = useMemo(() => {
    const now = new Date();
    let start = 0;
    if (filter === 'Today') start = startOfDay(now).getTime();
    else if (filter === 'Week') start = startOfWeek(now).getTime();
    else if (filter === 'Month') start = startOfMonth(now).getTime();

    return transactions.filter((t: any) => t.type === TransactionType.EXPENSE && (filter === 'All' || t.dateMillis >= start));
  }, [transactions, filter]);

  const monthlyTotals = useMemo(() => {
    const months: Record<string, number> = {};
    transactions
      .filter((t: any) => t.type === TransactionType.EXPENSE)
      .forEach((t: any) => {
        const monthKey = format(t.dateMillis, 'MMM yyyy');
        months[monthKey] = (months[monthKey] || 0) + t.amount;
      });
    return Object.entries(months).sort((a, b) => {
      return new Date(b[0]).getTime() - new Date(a[0]).getTime();
    });
  }, [transactions]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    categories.forEach((cat: string) => totals[cat] = 0);
    filteredTxs.forEach((t: any) => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [filteredTxs, categories]);

  if (selectedCategory) {
    const catTxs = filteredTxs.filter((t: any) => t.category === selectedCategory);
    const total = catTxs.reduce((sum: number, t: any) => sum + t.amount, 0);
    
    return (
      <div className="px-6 pt-8 space-y-8 flex flex-col min-h-screen">
        <div className="flex justify-between items-center">
          <button onClick={() => setSelectedCategory(null)} className="inline-flex items-center gap-2 text-vault-primary font-bold text-xs uppercase tracking-widest w-fit hover:opacity-80 transition-opacity">
            <ChevronRight className="w-5 h-5 rotate-180" /> Return
          </button>
          <button 
            onClick={() => {
              if (confirm(`Delete category "${selectedCategory}"? Settings will be preserved for existing transactions.`)) {
                onDeleteCategory(selectedCategory);
                setSelectedCategory(null);
              }
            }}
            className="text-vault-red text-[10px] font-black uppercase tracking-widest p-2 bg-rose-50 rounded-lg"
          >Delete Category</button>
        </div>
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-vault-text tracking-tight">{selectedCategory}</h2>
          <p className="text-vault-text-dim text-sm">{catTxs.length} records identified in {filter.toLowerCase()}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-vault-primary text-white p-6 rounded-[28px] col-span-2 shadow-lg shadow-blue-100">
             <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-1">Total Allocated</p>
             <p className="text-4xl font-black tracking-tight">{formatCurrency(total, currency)}</p>
          </div>
          <div className="bg-vault-surface border border-vault-border p-5 rounded-[24px]">
             <p className="text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-1">Count</p>
             <p className="text-xl font-bold">{catTxs.length}</p>
          </div>
          <div className="bg-vault-surface border border-vault-border p-5 rounded-[24px]">
             <p className="text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-1">Average</p>
             <p className="text-xl font-bold">{formatCurrency(catTxs.length > 0 ? total / catTxs.length : 0, currency)}</p>
          </div>
        </div>

        <div className="space-y-2 pb-8">
          {catTxs.map((tx: any) => (
            <div key={tx.id} className="flex items-center justify-between p-4 bg-vault-surface rounded-2xl border border-vault-border hover:bg-vault-bg transition-colors">
               <div>
                  <p className="font-bold text-sm">{format(tx.dateMillis, 'MMM d, yyyy')}</p>
                  <p className="text-xs text-vault-text-dim mt-0.5">{tx.notes || 'Routine transaction'}</p>
               </div>
               <p className="font-black text-vault-red text-base">-{formatCurrency(tx.amount, currency)}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-8 space-y-8 pb-32">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-vault-primary">Analytics</h2>
        <p className="text-vault-text-dim text-sm mt-1">Deep dive into your spending patterns</p>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-vault-surface border border-vault-border p-1 rounded-2xl">
        <button 
          onClick={() => setView('Categories')}
          className={cn("py-2 flex items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", view === 'Categories' ? "bg-vault-primary text-white shadow-sm" : "text-vault-text-dim hover:text-vault-text")}
        >
          <LayoutGrid className="w-3 h-3" /> Groups
        </button>
        <button 
          onClick={() => setView('Monthly')}
          className={cn("py-2 flex items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", view === 'Monthly' ? "bg-vault-primary text-white shadow-sm" : "text-vault-text-dim hover:text-vault-text")}
        >
          <TrendingUp className="w-3 h-3" /> Months
        </button>
        <button 
          onClick={() => setView('Recurring')}
          className={cn("py-2 flex items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", view === 'Recurring' ? "bg-vault-primary text-white shadow-sm" : "text-vault-text-dim hover:text-vault-text")}
        >
          <RefreshCcw className="w-3 h-3" /> Auto
        </button>
      </div>

      {view === 'Categories' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-vault-surface p-2 rounded-xl border border-vault-border">
            <div className="flex gap-1 w-full">
              {['Week', 'Month', 'All'].map(f => (
                <button 
                  key={f} 
                  onClick={() => setFilter(f)}
                  className={cn("flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all", filter === f ? "bg-vault-primary text-white" : "text-vault-text-dim opacity-60 hover:opacity-100")}
                >{f}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {categoryTotals.map(([name, total]: [string, any]) => (
              <button 
                key={name}
                onClick={() => setSelectedCategory(name)}
                className="flex flex-col items-center p-6 bg-vault-surface rounded-[28px] border border-vault-border text-center active:scale-95 transition-all shadow-sm group hover:border-vault-primary"
              >
                <div className="w-12 h-12 bg-vault-bg rounded-2xl mb-4 flex items-center justify-center transition-colors group-hover:bg-blue-50">
                   <LayoutGrid className="w-5 h-5 text-vault-primary" />
                </div>
                <p className="font-bold text-[11px] text-vault-text mb-1 uppercase tracking-tight">{name}</p>
                <p className="text-lg font-black text-vault-primary tracking-tighter">{formatCurrency(total, currency)}</p>
              </button>
            ))}
          </div>
          
          <button 
            onClick={() => {
              const name = prompt('New category designation:');
              if (name) onAddCategory(name);
            }}
            className="w-full border-2 border-dashed border-vault-primary border-opacity-30 py-4 rounded-[28px] text-vault-primary text-xs font-bold flex items-center justify-center gap-2 bg-vault-primary bg-opacity-[0.02] hover:bg-opacity-[0.05] transition-all uppercase tracking-widest"
          >
            <PlusCircle className="w-4 h-4" /> Define New Group
          </button>
        </div>
      )}

      {view === 'Monthly' && (
        <div className="space-y-4">
          {monthlyTotals.map(([month, total]) => (
            <div key={month} className="bg-vault-surface border border-vault-border p-6 rounded-[28px] shadow-sm flex items-center justify-between group hover:border-vault-primary transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center bg-blue-50 text-vault-primary rounded-2xl">
                  <TrendingDown className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xl font-black text-vault-text tracking-tighter">{month}</p>
                  <p className="text-[10px] font-bold text-vault-text-dim uppercase tracking-widest">Monthly Expenditure</p>
                </div>
              </div>
              <p className="text-2xl font-black text-vault-red tracking-tight">{formatCurrency(total, currency)}</p>
            </div>
          ))}
          {monthlyTotals.length === 0 && (
            <div className="text-center py-20 bg-vault-bg rounded-[32px] border-2 border-dashed border-vault-border">
              <TrendingUp className="w-12 h-12 text-vault-text-dim opacity-20 mx-auto mb-4" />
              <p className="text-vault-text-dim font-bold uppercase text-[10px] tracking-widest">No historical data found</p>
            </div>
          )}
        </div>
      )}

      {view === 'Recurring' && (
        <div className="space-y-4">
          <div className="bg-vault-surface border border-vault-border p-6 rounded-[28px] mb-4">
             <p className="text-xs text-vault-text-dim leading-relaxed">
               Active autonomous schedules. These transactions will be automatically generated in your ledger.
             </p>
          </div>
          {recurringTransactions.map((rt: any) => (
            <div key={rt.id} className="bg-vault-surface border border-vault-border p-6 rounded-[28px] shadow-sm flex items-center justify-between group hover:border-vault-primary transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center bg-vault-bg text-vault-primary rounded-2xl">
                  <RefreshCcw className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-lg font-black text-vault-text tracking-tighter">{rt.category}</p>
                  <p className="text-[10px] font-bold text-vault-text-dim uppercase tracking-widest">
                    {rt.interval} • {formatCurrency(rt.amount, currency)}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => onDeleteRecurring(rt.id)}
                className="p-2 text-vault-red opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          {recurringTransactions.length === 0 && (
             <div className="text-center py-20 bg-vault-bg rounded-[32px] border-2 border-dashed border-vault-border">
                <RefreshCcw className="w-12 h-12 text-vault-text-dim opacity-20 mx-auto mb-4" />
                <p className="text-vault-text-dim font-bold uppercase text-[10px] tracking-widest">No recurring schedules active</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

function LimitScreen({ dailyBudget, transactions, onSave, currency }: any) {
  const [amount, setAmount] = useState(dailyBudget?.amount.toString() || '0');

  const historyData = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(new Date(), 6 - i);
      const start = startOfDay(date).getTime();
      const end = endOfDay(date).getTime();
      const total = transactions
        .filter((t: any) => t.type === TransactionType.EXPENSE && t.dateMillis >= start && t.dateMillis <= end)
        .reduce((sum: number, t: any) => sum + t.amount, 0);
      
      return {
        name: format(date, 'EEE'),
        spent: total,
      };
    });
  }, [transactions]);

  return (
    <div className="px-6 pt-8 space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-vault-primary">Spending Control</h2>
        <p className="text-vault-text-dim text-sm mt-1">Configure your fiscal boundaries</p>
      </div>
      
      <div className="bg-vault-surface p-8 rounded-[28px] shadow-sm border border-vault-border space-y-6">
         <div>
            <label className="block text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-3 ml-1">Daily Upper Limit ({currency})</label>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-5xl font-black bg-transparent border-b-4 border-vault-primary pb-4 focus:outline-none tracking-tighter"
            />
         </div>
         <button 
           onClick={() => onSave({ ...dailyBudget, amount: parseFloat(amount) })}
           className="w-full bg-vault-primary text-white py-4 rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-blue-100 active:scale-95 transition-all"
         >Update Threshold</button>
      </div>

      <section className="bg-vault-surface p-8 rounded-[28px] shadow-sm border border-vault-border h-72">
        <h3 className="text-[10px] font-black text-vault-text-dim uppercase tracking-widest mb-6">7-Day Expenditure Velocity</h3>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={historyData}>
            <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={10} fontWeight={700} stroke="#74777F" />
            <Tooltip 
              cursor={{ fill: '#F4F7FA' }}
              contentStyle={{ borderRadius: '16px', border: '1px solid #E1E2E9', boxShadow: 'none', fontWeight: 700 }}
            />
            <Bar dataKey="spent" radius={[6, 6, 0, 0]} barSize={24}>
              {historyData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.spent > (dailyBudget?.amount || 0) ? '#BA1A1A' : '#005AC1'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function SettingsScreen({ settings, onSave, onClearAll, transactions }: any) {
  const exportToCSV = () => {
    const headers = ['Date', 'Amount', 'Type', 'Category', 'Source', 'Notes'];
    const rows = transactions.map((t: any) => [
      format(t.dateMillis, 'yyyy-MM-dd HH:mm'),
      t.amount,
      t.type,
      t.category,
      t.source,
      t.notes
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map((e: any) => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "vault_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="px-6 pt-8 space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-vault-primary">System Config</h2>
        <p className="text-vault-text-dim text-sm mt-1">Manage your account and preferences</p>
      </div>
      
      <div className="bg-vault-surface rounded-[28px] overflow-hidden shadow-sm border border-vault-border">
         <div className="p-6 border-b border-vault-bg flex justify-between items-center bg-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-vault-bg rounded-lg"><TrendingUp className="w-4 h-4 text-vault-primary" /></div>
              <span className="font-bold text-sm">System Currency</span>
            </div>
            <select 
              value={settings.currency} 
              onChange={(e) => onSave({ ...settings, currency: e.target.value })}
              className="bg-vault-bg px-4 py-2 rounded-xl font-bold text-vault-primary outline-none text-sm transition-colors border border-transparent focus:border-vault-primary"
            >
               <option value="USD">USD ($)</option>
               <option value="EUR">EUR (€)</option>
               <option value="GBP">GBP (£)</option>
               <option value="JPY">JPY (¥)</option>
               <option value="INR">INR (₹)</option>
            </select>
         </div>
         <button 
           onClick={exportToCSV}
           className="w-full p-6 flex items-center justify-between border-b border-vault-bg hover:bg-vault-bg transition-colors"
         >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-vault-bg rounded-lg"><Download className="w-4 h-4 text-vault-primary" /></div>
              <span className="font-bold text-sm">Export Ledger to CSV</span>
            </div>
            <ChevronRight className="w-4 h-4 text-vault-text-dim" />
         </button>
         <button 
           onClick={() => {
             if (confirm('Irreversible Action: Are you sure you want to purge ALL ledger entries?')) {
               onClearAll();
             }
           }}
           className="w-full p-6 flex items-center justify-between text-vault-red hover:bg-red-50 transition-colors group"
         >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-50 rounded-lg group-hover:bg-white transition-colors"><Trash2 className="w-4 h-4" /></div>
              <span className="font-bold text-sm">Purge Databases</span>
            </div>
            <ChevronRight className="w-4 h-4 opacity-50" />
         </button>
      </div>

      <div className="text-center pt-8 border-t border-vault-border border-dashed">
         <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 bg-vault-green rounded-full"></div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-vault-text-dim">Vault Core v1.0.4-Geometric</p>
         </div>
         <p className="text-[10px] text-vault-text-dim opacity-50 leading-relaxed uppercase font-bold">
           Synchronized with local storage<br />
           Zero remote dependency enabled
         </p>
      </div>
    </div>
  );
}
