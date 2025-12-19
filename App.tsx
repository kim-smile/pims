import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { processChat } from './services/hybridService';
import type { ProcessedData, CategorizedData, HistoryItem, View, Expense, Contact, ScheduleItem, DiaryEntry, ChatMessage, ChatSession, ScheduleCategory, DataModification, DataDeletion, AppNotification, NotificationSettings, TrashItem } from './types';
import { HistoryList, ChatHistoryList } from './components/HistoryList';
import { CalendarView } from './components/CalendarView';
import { ContactsList } from './components/ContactsList';
import { ScheduleList } from './components/ScheduleList';
import { ExpensesList } from './components/ExpensesList';
import { DiaryList } from './components/DiaryList';
import { HistoryDetailModal } from './components/HistoryDetailModal';
import { ConflictModal } from './components/ConflictModal';
import { MonthYearPicker } from './components/MonthYearPicker';
import { ExpensesCalendarView } from './components/ExpensesCalendarView';
import { ChatInterface } from './components/ChatInterface';
import { ExpensesStatsView } from './components/ExpensesStatsView';
import { NotificationsView } from './components/NotificationsView';
import { MenuIcon, FilterIcon } from './components/icons';
import { ConfirmationModal } from './components/ConfirmationModal';
import { TrashView } from './components/TrashView';
import { DataSelectionModal } from './components/DataSelectionModal';

// A simple ID generator
const generateId = () => Math.random().toString(36).substring(2, 9);

const LOCAL_STORAGE_KEY = 'lifeone-app-state';
const VIEW_TRANSITION_DURATION = 300; // In milliseconds, matches CSS duration

const getRandomColor = () => {
    const letters = '89ABCDEF'.split(''); // Brighter colors
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * letters.length)];
    }
    return color;
};

const getInitialState = () => {
  try {
    const item = localStorage.getItem(LOCAL_STORAGE_KEY);
    return item ? JSON.parse(item) : {};
  } catch (error) {
    console.error("Error reading from local storage", error);
    return {};
  }
};

// Helper to format phone numbers consistently
const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
         // Seoul landline (02) vs others
         if (cleaned.startsWith('02')) {
             return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
         }
         // 010-xxx-xxxx (old) or 031-xxx-xxxx
         return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 9 && cleaned.startsWith('02')) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`;
    }
    if (cleaned.length === 8) { // 1588-xxxx
         return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
    }
    // If it doesn't match standard lengths, return as is (or original if present)
    return phone;
};

const App: React.FC = () => {
  const initialStateRef = useRef(getInitialState());
  const initialState = initialStateRef.current;

  const [hasInteracted, setHasInteracted] = useState(initialState.hasInteracted || false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // FIX: Renamed `history` to `historyItems` to avoid conflict with `window.history`.
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(initialState.history || []);
  const [contacts, setContacts] = useState<Contact[]>(initialState.contacts || []);
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initialState.schedule || []);
  const [scheduleCategories, setScheduleCategories] = useState<ScheduleCategory[]>(initialState.scheduleCategories || [
    { id: 'default-uncategorized', name: '비어있음', color: '#a1a1aa' } // zinc-400
  ]);
  const [expenses, setExpenses] = useState<Expense[]>(initialState.expenses || []);
  const [diary, setDiary] = useState<DiaryEntry[]>(initialState.diary || []);
  const [trash, setTrash] = useState<TrashItem[]>(initialState.trash || []);
  
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(initialState.chatSessions || []);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | 'new'>(initialState.activeChatSessionId || 'new');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>('ALL');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [selectedIncomeMonth, setSelectedIncomeMonth] = useState(new Date());
  const [selectedExpenseMonth, setSelectedExpenseMonth] = useState(new Date());
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Filter state for Income View
  const [incomeFilterCategory, setIncomeFilterCategory] = useState<string | null>(null);
  const [isIncomeFilterOpen, setIsIncomeFilterOpen] = useState(false);

  // Filter state for Expense View
  const [expenseFilterCategory, setExpenseFilterCategory] = useState<string | null>(null);
  const [isExpenseFilterOpen, setIsExpenseFilterOpen] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>(initialState.notifications || []);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(initialState.notificationSettings || {
      calendar: { enabled: true, dDayAlerts: true, todayEventAlerts: true },
      budget: { enabled: false, monthlyLimit: 0 }
  });
  const [lastDailyCheckDate, setLastDailyCheckDate] = useState<string>(initialState.lastDailyCheckDate || '');
  // budgetAlertHistory tracks which percentage thresholds have been triggered for the current month. e.g. { "2023-10": [30, 50] }
  const [budgetAlertHistory, setBudgetAlertHistory] = useState<Record<string, number[]>>(initialState.budgetAlertHistory || {});

  // State for specific deep links / navigation requests
  const [calendarNavigationRequest, setCalendarNavigationRequest] = useState<{date: string} | null>(null);


  // State to hold the original user input when AI asks for clarification
  const [pendingClarificationInput, setPendingClarificationInput] = useState<HistoryItem['input'] | null>(null);

  // State to hold pending data extraction when clarification is needed
  const [pendingDataExtraction, setPendingDataExtraction] = useState<ProcessedData | null>(null);

  // State for the custom confirmation modal
  const [confirmation, setConfirmation] = useState<{
    message: string;
    description?: string;
    onConfirm: () => void;
    confirmText?: string;
    confirmButtonClass?: string;
  } | null>(null);

  // State for Data Selection Modal (Shared for Kakao & VCF)
  const [importSelectionData, setImportSelectionData] = useState<CategorizedData | null>(null);
  const [importModalTitle, setImportModalTitle] = useState<string>("");
  
  const importFileRef = useRef<HTMLInputElement>(null);
  const kakaoFileRef = useRef<HTMLInputElement>(null);
  const vcfFileRef = useRef<HTMLInputElement>(null);


  // State to manage the conflict resolution modal
  const [conflictData, setConflictData] = useState<{
    conflicts: {
      contacts: Contact[];
      schedule: ScheduleItem[];
      expenses: Expense[];
    };
    categorizedResult: CategorizedData;
    conflictingOriginalIds: {
      contacts: string[];
      schedule: string[];
      expenses: string[];
    };
    newHistoryItem: HistoryItem;
  } | null>(null);

  // --- Trash Auto-Cleanup Logic (30 Days) ---
  useEffect(() => {
    const cleanupTrash = () => {
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const now = new Date().getTime();

        setTrash(prevTrash => {
            const validTrash = prevTrash.filter(item => {
                const deletedTime = new Date(item.deletedAt).getTime();
                // Keep item if it's newer than 30 days
                return (now - deletedTime) < THIRTY_DAYS_MS;
            });

            // Only update state if items were actually removed
            if (validTrash.length !== prevTrash.length) {
                return validTrash;
            }
            return prevTrash;
        });
    };
    
    cleanupTrash();
  }, []);

  useEffect(() => {
    try {
      const stateToSave = {
        hasInteracted,
        // FIX: Use `historyItems` for state, but keep `history` key for localStorage compatibility.
        history: historyItems,
        contacts,
        schedule,
        scheduleCategories,
        expenses,
        diary,
        trash,
        chatSessions,
        activeChatSessionId,
        notifications,
        notificationSettings,
        lastDailyCheckDate,
        budgetAlertHistory
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
      // FIX: Renamed `error` to `e` to avoid scope confusion with the global `error` property or `Error` type.
    } catch (e) {
      console.error("Error saving state to local storage", e);
    }
    // FIX: Updated dependency array to use `historyItems`.
  }, [hasInteracted, historyItems, contacts, schedule, scheduleCategories, expenses, diary, trash, chatSessions, activeChatSessionId, notifications, notificationSettings, lastDailyCheckDate, budgetAlertHistory]);

  // --- NOTIFICATION LOGIC ---

  const addNotification = (title: string, message: string, type: AppNotification['type'], relatedData?: AppNotification['relatedData']) => {
      setNotifications(prev => [{
          id: generateId(),
          title,
          message,
          timestamp: new Date().toISOString(),
          type,
          relatedData
      }, ...prev]);
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
  };

  // Calendar Alerts Check (Once per day)
  useEffect(() => {
      if (!notificationSettings.calendar.enabled) return;
      
      const todayStr = new Date().toISOString().split('T')[0];
      if (lastDailyCheckDate === todayStr) return;

      // Run Checks
      let newNotifs: AppNotification[] = [];
      
      if (notificationSettings.calendar.todayEventAlerts) {
          const todayEvents = schedule.filter(s => s.date === todayStr);
          todayEvents.forEach(event => {
              newNotifs.push({
                  id: generateId(),
                  title: '오늘의 일정',
                  message: `오늘 '${event.title}' 일정이 있습니다. ${event.time ? `(${event.time})` : ''}`,
                  timestamp: new Date().toISOString(),
                  type: 'calendar',
                  relatedData: { view: 'CALENDAR', date: event.date }
              });
          });
      }

      if (notificationSettings.calendar.dDayAlerts) {
          schedule.filter(s => s.isDday).forEach(event => {
              const eventDate = new Date(event.date);
              const todayDate = new Date(todayStr);
              const diffTime = eventDate.getTime() - todayDate.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

              // Logic: 1, 10, 50, 100, 200, 300...
              let shouldAlert = false;
              if (diffDays === 1 || diffDays === 10 || diffDays === 50) shouldAlert = true;
              if (diffDays > 0 && diffDays % 100 === 0) shouldAlert = true;

              if (shouldAlert) {
                   newNotifs.push({
                      id: generateId(),
                      title: 'D-Day 알림',
                      message: `'${event.title}'까지 ${diffDays}일 남았습니다.`,
                      timestamp: new Date().toISOString(),
                      type: 'calendar',
                      relatedData: { view: 'CALENDAR', date: event.date }
                  });
              }
          });
      }

      if (newNotifs.length > 0) {
          setNotifications(prev => [...newNotifs, ...prev]);
      }
      setLastDailyCheckDate(todayStr);

  }, [schedule, notificationSettings.calendar, lastDailyCheckDate]);

  // Budget Alerts Check (Whenever expenses change)
  useEffect(() => {
      if (!notificationSettings.budget.enabled || notificationSettings.budget.monthlyLimit <= 0) return;

      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      // Calculate total expense for this month
      const totalExpense = expenses
        .filter(e => e.type === 'expense' && e.date.startsWith(currentMonthKey))
        .reduce((sum, e) => sum + e.amount, 0);
      
      const ratio = (totalExpense / notificationSettings.budget.monthlyLimit) * 100;
      const thresholds = [30, 50, 90, 100];
      const triggered = budgetAlertHistory[currentMonthKey] || [];
      const newTriggered = [...triggered];
      let alertGenerated = false;

      thresholds.forEach(th => {
          if (ratio >= th && !triggered.includes(th)) {
              addNotification(
                  '지출 한도 경고', 
                  `이번 달 지출이 설정 한도의 ${th}%에 도달했습니다. (현재: ${totalExpense.toLocaleString()}원 / 한도: ${notificationSettings.budget.monthlyLimit.toLocaleString()}원)`,
                  'budget',
                  { view: 'EXPENSES_EXPENSE', date: `${currentMonthKey}-01` }
              );
              newTriggered.push(th);
              alertGenerated = true;
          }
      });

      if (alertGenerated) {
          setBudgetAlertHistory(prev => ({ ...prev, [currentMonthKey]: newTriggered }));
      }

  }, [expenses, notificationSettings.budget]);

  // --- END NOTIFICATION LOGIC ---

  const initialMessages: ChatMessage[] = [];

  const addIdsToData = (data: ProcessedData): CategorizedData => {
    return {
      contacts: data.contacts.map(c => ({ 
          ...c, 
          id: generateId(), 
          group: c.group || '기타',
          phone: c.phone ? formatPhoneNumber(c.phone) : undefined
      })),
      schedule: data.schedule.map(s => ({ ...s, id: generateId() })),
      expenses: data.expenses.map(e => ({ ...e, id: generateId() })),
      diary: data.diary.map(d => ({
        ...d,
        id: generateId(),
        group: d.group || '기타',
        checklistItems: d.checklistItems?.map(item => ({
          ...item,
          id: generateId(),
        }))
      })),
    };
  };
  
  const handleRequestConfirmation = (message: string, onConfirm: () => void, description?: string, confirmText?: string, confirmButtonClass?: string) => {
    setConfirmation({
        message,
        description,
        onConfirm: () => {
            onConfirm();
            setConfirmation(null);
        },
        confirmText,
        confirmButtonClass,
    });
  };

  const handleCancelConfirmation = () => {
      setConfirmation(null);
  };

  const addDataToState = (categorizedResult: CategorizedData, input: HistoryItem['input']) => {
      // Make a mutable copy to process
      const finalCategorizedResult: CategorizedData = JSON.parse(JSON.stringify(categorizedResult));

      // --- NEW LOGIC for handling schedule categories ---
      if (finalCategorizedResult.schedule.length > 0) {
        finalCategorizedResult.schedule = finalCategorizedResult.schedule.map(item => {
            if (item.category) { // The AI returned a category name
                const categoryName = item.category;
                let foundCategory = scheduleCategories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
                
                if (!foundCategory) {
                    // Create new category
                    const newCategory = handleAddScheduleCategory({ name: categoryName, color: getRandomColor() });
                    foundCategory = newCategory;
                }

                const { category, ...restOfItem } = item; // Remove temporary 'category' property
                return { ...restOfItem, categoryId: foundCategory.id };
            }
            return item;
        });
      }

      // --- DUPLICATION CHECK LOGIC ---
      const conflicts = {
        contacts: [] as Contact[],
        schedule: [] as ScheduleItem[],
        expenses: [] as Expense[],
      };
      const conflictingOriginalIds = {
        contacts: [] as string[],
        schedule: [] as string[],
        expenses: [] as string[],
      };

      const normalizePhone = (phone?: string) => phone ? phone.replace(/\D/g, '') : '';

      finalCategorizedResult.contacts.forEach(newContact => {
        const newPhoneNormalized = normalizePhone(newContact.phone);
        if (newPhoneNormalized) {
          const existing = contacts.find(c => normalizePhone(c.phone) === newPhoneNormalized);
          if (existing) {
            conflicts.contacts.push(newContact);
            conflictingOriginalIds.contacts.push(existing.id);
          }
        }
      });

      finalCategorizedResult.schedule.forEach(newSchedule => {
        const existing = schedule.find(s => 
          s.title.trim().toLowerCase() === newSchedule.title.trim().toLowerCase() && 
          s.date === newSchedule.date
        );
        if (existing) {
          conflicts.schedule.push(newSchedule);
          conflictingOriginalIds.schedule.push(existing.id);
        }
      });

      finalCategorizedResult.expenses.forEach(newExpense => {
        const existing = expenses.find(e => 
          e.item.trim().toLowerCase() === newExpense.item.trim().toLowerCase() && 
          e.date === newExpense.date &&
          e.amount === newExpense.amount &&
          e.type === newExpense.type
        );
        if (existing) {
          conflicts.expenses.push(newExpense);
          conflictingOriginalIds.expenses.push(existing.id);
        }
      });

      const hasConflicts = conflicts.contacts.length > 0 || conflicts.schedule.length > 0 || conflicts.expenses.length > 0;
      
      const newHistoryItem: HistoryItem = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        input,
        output: finalCategorizedResult,
      };

      if (hasConflicts) {
        setConflictData({
          conflicts,
          categorizedResult: finalCategorizedResult,
          conflictingOriginalIds,
          newHistoryItem,
        });
        return; // Stop processing, let the modal handle the next step
      }
      
      // If no conflicts, update state directly
      // FIX: Use `setHistoryItems` setter.
      setHistoryItems(prevHistory => [newHistoryItem, ...prevHistory]);
      setContacts(prev => [...prev, ...finalCategorizedResult.contacts]);
      setSchedule(prev => [...prev, ...finalCategorizedResult.schedule].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.time || '').localeCompare(b.time || '')));
      setExpenses(prev => [...prev, ...finalCategorizedResult.expenses]);
      setDiary(prev => [...prev, ...finalCategorizedResult.diary]);
  };

  const getPrunedContextData = () => {
    const MAX_CONTACTS_LITE = 200;
    const MAX_SCHEDULE_ITEMS = 50; // Will be split between past and future
    const MAX_EXPENSE_ITEMS = 100;
    const MAX_DIARY_ENTRIES = 30;

    // Prune contacts: send id, name, and group to reduce token size but allow for modification.
    // UPDATED: Include phone and email so AI can answer questions about contacts.
    const liteContacts = contacts.slice(0, MAX_CONTACTS_LITE).map(c => ({ 
        id: c.id, 
        name: c.name, 
        phone: c.phone, 
        email: c.email, 
        group: c.group 
    }));

    // Prune schedule: provide a mix of recent past and upcoming events.
    const todayStr = new Date().toISOString().split('T')[0];
    const pastSchedule = schedule.filter(s => s.date < todayStr).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // descending from recent past
    const futureSchedule = schedule.filter(s => s.date >= todayStr).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // ascending from today

    const prunedSchedule = [
        ...futureSchedule.slice(0, Math.ceil(MAX_SCHEDULE_ITEMS / 2)),
        ...pastSchedule.slice(0, Math.floor(MAX_SCHEDULE_ITEMS / 2))
    ];

    // Prune expenses: sort by date descending and take the most recent items.
    const sortedExpenses = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const prunedExpenses = sortedExpenses.slice(0, MAX_EXPENSE_ITEMS);

    // Prune diary: sort by date descending and take the most recent items, but truncate long entries.
    const sortedDiary = [...diary].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const prunedDiary = sortedDiary.slice(0, MAX_DIARY_ENTRIES).map(d => ({
        ...d,
        entry: d.entry.substring(0, 150) + (d.entry.length > 150 ? '...' : '')
    }));

    // Prioritize returning contacts that match words in the chat history, to ensure they are in context.
    // This helps when the AI needs to find a specific contact details that might have been pruned.
    return {
        contacts: liteContacts,
        schedule: prunedSchedule,
        expenses: prunedExpenses,
        diary: prunedDiary,
    };
  };
  
  const applyModifications = (modifications: DataModification) => {
    // Contacts
    if (modifications.contacts.length > 0) {
        setContacts(prevContacts => {
            const contactsMap = new Map(prevContacts.map(c => [c.id, c]));
            modifications.contacts.forEach(mod => {
                const existing = contactsMap.get(mod.id);
                if (existing) {
                    const updates = { ...mod.fieldsToUpdate };
                    if (updates.phone) {
                        updates.phone = formatPhoneNumber(updates.phone);
                    }
                    // Use Object.assign to avoid spread type error
                    contactsMap.set(mod.id, Object.assign({}, existing, updates));
                }
            });
            return Array.from(contactsMap.values());
        });
    }

    // Schedule
    if (modifications.schedule.length > 0) {
        setSchedule(prevSchedule => {
            const scheduleMap = new Map(prevSchedule.map(s => [s.id, s]));
            modifications.schedule.forEach(mod => {
                const existing = scheduleMap.get(mod.id);
                if (existing) {
                    // Use Object.assign to avoid spread type error
                    scheduleMap.set(mod.id, Object.assign({}, existing, mod.fieldsToUpdate));
                }
            });
            // FIX: Explicitly type sort callback parameters to resolve 'unknown' type error.
            return Array.from(scheduleMap.values()).sort((a: ScheduleItem, b: ScheduleItem) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.time || '').localeCompare(b.time || ''));
        });
    }

    // Expenses
    if (modifications.expenses.length > 0) {
        setExpenses(prevExpenses => {
            const expensesMap = new Map(prevExpenses.map(e => [e.id, e]));
            modifications.expenses.forEach(mod => {
                const existing = expensesMap.get(mod.id);
                if (existing) {
                    // Use Object.assign to avoid spread type error
                    expensesMap.set(mod.id, Object.assign({}, existing, mod.fieldsToUpdate));
                }
            });
            // FIX: Explicitly type sort callback parameters to resolve 'unknown' type error.
            return Array.from(expensesMap.values()).sort((a: Expense, b: Expense) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
    }
    
    // Diary
    if (modifications.diary.length > 0) {
        setDiary(prevDiary => {
            const diaryMap = new Map(prevDiary.map(d => [d.id, d]));
            modifications.diary.forEach(mod => {
                const existing = diaryMap.get(mod.id);
                if (existing) {
                     // Use Object.assign to avoid spread type error
                    diaryMap.set(mod.id, Object.assign({}, existing, mod.fieldsToUpdate));
                }
            });
            return Array.from(diaryMap.values());
        });
    }
  };

  const applyDeletions = (deletions: DataDeletion) => {
    const newTrashItems: TrashItem[] = [];
    const deletedAt = new Date().toISOString();

    // Contacts
    if (deletions.contacts.length > 0) {
        const idsToDelete = new Set(deletions.contacts);
        contacts.forEach(c => {
            if (idsToDelete.has(c.id)) {
                newTrashItems.push({
                    id: generateId(),
                    originalId: c.id,
                    type: 'contact',
                    data: c,
                    deletedAt,
                    title: c.name
                });
            }
        });
        setContacts(prev => prev.filter(c => !idsToDelete.has(c.id)));
    }
    // Schedule
    if (deletions.schedule.length > 0) {
        const idsToDelete = new Set(deletions.schedule);
        schedule.forEach(s => {
             if (idsToDelete.has(s.id)) {
                newTrashItems.push({
                    id: generateId(),
                    originalId: s.id,
                    type: 'schedule',
                    data: s,
                    deletedAt,
                    title: s.title
                });
            }
        });
        setSchedule(prev => prev.filter(s => !idsToDelete.has(s.id)));
    }
    // Expenses
    if (deletions.expenses.length > 0) {
        const idsToDelete = new Set(deletions.expenses);
        expenses.forEach(e => {
             if (idsToDelete.has(e.id)) {
                newTrashItems.push({
                    id: generateId(),
                    originalId: e.id,
                    type: 'expense',
                    data: e,
                    deletedAt,
                    title: e.item
                });
            }
        });
        setExpenses(prev => prev.filter(e => !idsToDelete.has(e.id)));
    }
    // Diary
    if (deletions.diary.length > 0) {
        const idsToDelete = new Set(deletions.diary);
        diary.forEach(d => {
             if (idsToDelete.has(d.id)) {
                newTrashItems.push({
                    id: generateId(),
                    originalId: d.id,
                    type: 'diary',
                    data: d,
                    deletedAt,
                    title: d.entry.substring(0, 20) + (d.entry.length > 20 ? '...' : '')
                });
            }
        });
        setDiary(prev => prev.filter(d => !idsToDelete.has(d.id)));
    }

    if (newTrashItems.length > 0) {
        setTrash(prev => [...prev, ...newTrashItems]);
    }
  };


  const handleSendMessage = async (text: string, image: File | null) => {
    // If sending from the home screen (hasInteracted is false), treat as a NEW chat session.
    const isStartingFromHome = !hasInteracted;

    if (!hasInteracted) {
      setHasInteracted(true);
    }
    setIsLoading(true);
    setError(null);

    // Handle clarification responses
    if (pendingDataExtraction) {
      const trimmedText = text.trim();

      // 1. Time clarification (오전/오후 selection)
      if (trimmedText === '오전' || trimmedText === '오후') {
        const modifiedData = { ...pendingDataExtraction };
        let confirmationMessage = '';

        // Modify schedule time based on selection
        if (modifiedData.schedule && modifiedData.schedule.length > 0) {
          modifiedData.schedule = modifiedData.schedule.map(sch => {
            if (sch.time) {
              const [hourStr, minute] = sch.time.split(':');
              let hour = parseInt(hourStr);
              const originalHour = hour;

              if (hour >= 1 && hour <= 12) {
                if (trimmedText === '오후' && hour !== 12) {
                  hour += 12;
                } else if (trimmedText === '오전' && hour === 12) {
                  hour = 0;
                }
                const newTime = `${hour.toString().padStart(2, '0')}:${minute || '00'}`;
                confirmationMessage = `"${sch.title}" 일정이 ${trimmedText} ${originalHour}시 (${newTime})로 저장되었습니다.`;
                return { ...sch, time: newTime };
              }
            }
            return sch;
          });
        }

        // Add the modified data to state
        const categorizedResult = addIdsToData(modifiedData);
        addDataToState(categorizedResult, pendingClarificationInput!);

        // Add confirmation message to chat
        const currentSessionId = activeChatSessionId || chatSessions[0]?.id;
        if (currentSessionId && confirmationMessage) {
          const modelMessage: ChatMessage = {
            id: generateId(),
            role: 'model',
            text: confirmationMessage,
          };
          setChatSessions(prev => prev.map(s =>
            s.id === currentSessionId ? { ...s, messages: [...s.messages, modelMessage] } : s
          ));
        }

        // Clear pending states
        setPendingClarificationInput(null);
        setPendingDataExtraction(null);
        setIsLoading(false);

        return; // Don't proceed with server call
      }

      // 2. Category clarification (연락처/일정/가계부/메모 selection)
      if (['연락처', '일정', '가계부', '메모'].includes(trimmedText)) {
        const filteredData: ProcessedData = {
          contacts: [],
          schedule: [],
          expenses: [],
          diary: []
        };

        // Keep only the selected category
        if (trimmedText === '연락처') {
          filteredData.contacts = pendingDataExtraction.contacts || [];
        } else if (trimmedText === '일정') {
          filteredData.schedule = pendingDataExtraction.schedule || [];
        } else if (trimmedText === '가계부') {
          filteredData.expenses = pendingDataExtraction.expenses || [];
        } else if (trimmedText === '메모') {
          filteredData.diary = pendingDataExtraction.diary || [];
        }

        // Add the filtered data to state
        const categorizedResult = addIdsToData(filteredData);
        addDataToState(categorizedResult, pendingClarificationInput!);

        // Add confirmation message to chat
        const currentSessionId = activeChatSessionId || chatSessions[0]?.id;
        if (currentSessionId) {
          const modelMessage: ChatMessage = {
            id: generateId(),
            role: 'model',
            text: `${trimmedText}에 저장했습니다.`,
          };
          setChatSessions(prev => prev.map(s =>
            s.id === currentSessionId ? { ...s, messages: [...s.messages, modelMessage] } : s
          ));
        }

        // Clear pending states
        setPendingClarificationInput(null);
        setPendingDataExtraction(null);
        setIsLoading(false);

        return; // Don't proceed with server call
      }
    }

    let imageUrl: string | null = null;
    if (image) {
      imageUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(image);
      });
    }
    
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      text,
      imageUrl,
    };

    // This is the original input that will be logged to history
    const userInputLog: HistoryItem['input'] = {
        text,
        imageName: image?.name || null,
        imageUrl,
    };
    
    // Force 'new' if starting from home screen, otherwise use current state
    let currentSessionId = isStartingFromHome ? 'new' : activeChatSessionId;
    let chatHistoryForApi: ChatMessage[] = [];

    if (currentSessionId === 'new') {
        const newSessionId = generateId();
        const newSession: ChatSession = {
            id: newSessionId,
            title: text.substring(0, 30) || image?.name || "새 대화",
            messages: [userMessage],
        };
        setChatSessions(prev => [newSession, ...prev]);
        setActiveChatSessionId(newSessionId);
        currentSessionId = newSessionId;
    } else {
        const session = chatSessions.find(s => s.id === currentSessionId)!;
        chatHistoryForApi = [...session.messages];
        const updatedSession = { ...session, messages: [...session.messages, userMessage] };
        setChatSessions(prev => prev.map(s => s.id === currentSessionId ? updatedSession : s));
    }


    try {
      const contextData = getPrunedContextData();
      const result = await processChat(chatHistoryForApi, text, image, contextData);
      
      // Handle clarification query from AI
      if (result.clarificationNeeded) {
        const modelMessage: ChatMessage = {
            id: generateId(),
            role: 'model',
            text: result.answer,
            clarificationOptions: result.clarificationOptions,
        };

        // Don't save the user's clarification *reply* to history, save the original input.
        // So if there's no pending input, this is the original ambiguous one.
        if (!pendingClarificationInput) {
            setPendingClarificationInput(userInputLog);
            // Save the pending data extraction for later modification
            setPendingDataExtraction(result.dataExtraction);
        }

        setChatSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, modelMessage] } : s));
        return; // Stop processing, wait for user's clarifying response
      }

      let modelMessage: ChatMessage | null = null;
      if (result.answer) {
        modelMessage = {
          id: generateId(),
          role: 'model',
          text: result.answer,
          webSearchSources: result.webSearchSources, // Add web search sources
        };
      }

      setChatSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
            const newMessages = [...s.messages];
            if (modelMessage) {
                newMessages.push(modelMessage);
            }
            return { ...s, messages: newMessages };
        }
        return s;
      }));

      const extractedData = result.dataExtraction;
      const hasExtractedData = 
        extractedData.contacts.length > 0 ||
        extractedData.schedule.length > 0 ||
        extractedData.expenses.length > 0 ||
        extractedData.diary.length > 0;

      if (hasExtractedData) {
        const categorizedResult = addIdsToData(extractedData);
        
        // If there was a pending clarification, use its image for the result
        const finalImageUrl = pendingClarificationInput?.imageUrl || imageUrl;

        if (finalImageUrl && categorizedResult.expenses.length > 0) {
          categorizedResult.expenses.forEach(expense => {
            expense.imageUrl = finalImageUrl;
          });
        }
        
        // If this was a result of a clarification, use the original input for the history log.
        const inputForHistory = pendingClarificationInput || userInputLog;
        
        addDataToState(categorizedResult, inputForHistory);
      }

      // Handle modifications and deletions
      const hasModifications = 
        result.dataModification.contacts.length > 0 ||
        result.dataModification.schedule.length > 0 ||
        result.dataModification.expenses.length > 0 ||
        result.dataModification.diary.length > 0;

      const hasDeletions = 
        result.dataDeletion.contacts.length > 0 ||
        result.dataDeletion.schedule.length > 0 ||
        result.dataDeletion.expenses.length > 0 ||
        result.dataDeletion.diary.length > 0;

      if (hasModifications) {
          applyModifications(result.dataModification);
      }
      if (hasDeletions) {
          applyDeletions(result.dataDeletion);
      }
      
      // After any successful operation that came from a clarification, clear the pending state.
      if (pendingClarificationInput) {
        setPendingClarificationInput(null);
      }


    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage);
      const errorMessageItem: ChatMessage = {
        id: generateId(),
        role: 'model',
        text: `오류가 발생했습니다: ${errorMessage}`,
      };
      setChatSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
            return { ...s, messages: [...s.messages, errorMessageItem] };
        }
        return s;
      }));
      setPendingClarificationInput(null); // Clear on error too
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoHome = () => {
    if (!hasInteracted) {
        setIsSidebarOpen(false);
        return;
    }

    setIsTransitioning(true);
    setIsSidebarOpen(false);

    setTimeout(() => {
        setHasInteracted(false);
        setActiveChatSessionId('new');
        setPendingClarificationInput(null);
        setActiveView('ALL');
        setIsTransitioning(false); 
    }, VIEW_TRANSITION_DURATION);
  };

  const handleNewChat = () => {
    if (activeView === 'ALL' && activeChatSessionId === 'new') return;

    setIsTransitioning(true);
    setTimeout(() => {
        setHasInteracted(true);
        setActiveView('ALL');
        setActiveChatSessionId('new');
        setPendingClarificationInput(null);
        setIsTransitioning(false);
    }, VIEW_TRANSITION_DURATION);
  };

  const handleSelectChat = (sessionId: string) => {
    if (activeChatSessionId === sessionId && activeView === 'ALL') return;

    setIsTransitioning(true);
    setTimeout(() => {
        setActiveView('ALL');
        setActiveChatSessionId(sessionId);
        setPendingClarificationInput(null);
        setIsTransitioning(false);
    }, VIEW_TRANSITION_DURATION);
  };

  const handleNotificationClick = (notification: AppNotification) => {
    // Dismiss
    setNotifications(prev => prev.filter(n => n.id !== notification.id));

    // Navigate if deep link exists
    if (notification.relatedData) {
        const { view, date } = notification.relatedData;
        
        if (activeView !== view) {
             setIsTransitioning(true);
             setTimeout(() => {
                 setActiveView(view);
                 setIsTransitioning(false);
             }, VIEW_TRANSITION_DURATION);
        } else {
             setActiveView(view);
        }

        if (!hasInteracted) setHasInteracted(true);

        if (date) {
            const targetDate = new Date(date);
            if (view === 'CALENDAR') {
                setCalendarNavigationRequest({ date });
            } else if (view === 'EXPENSES_EXPENSE' || view === 'EXPENSES_DASHBOARD') {
                setSelectedExpenseMonth(targetDate);
            } else if (view === 'EXPENSES_INCOME') {
                setSelectedIncomeMonth(targetDate);
            }
        }
    }
  };


  const handleConflictConfirm = () => {
    if (!conflictData) return;

    const { categorizedResult, conflictingOriginalIds, newHistoryItem } = conflictData;

    // FIX: Use `setHistoryItems` setter.
    setHistoryItems(prev => [newHistoryItem, ...prev]);

    setContacts(prev => [
      ...prev.filter(c => !conflictingOriginalIds.contacts.includes(c.id)), 
      ...categorizedResult.contacts
    ]);
    setSchedule(prev => [
      ...prev.filter(s => !conflictingOriginalIds.schedule.includes(s.id)), 
      ...categorizedResult.schedule
    ]);
    setExpenses(prev => [
      ...prev.filter(e => !conflictingOriginalIds.expenses.includes(e.id)), 
      ...categorizedResult.expenses
    ]);
    setDiary(prev => [...prev.filter(d => !categorizedResult.diary.some(nd => nd.id === d.id)), ...categorizedResult.diary]);

    setConflictData(null);
  };

  const handleConflictCancel = () => {
    setConflictData(null);
  };

  const handleConflictIgnoreAndAdd = () => {
    if (!conflictData) return;
    const { categorizedResult, newHistoryItem } = conflictData;

    // Add new items without removing duplicates, effectively creating duplicate entries
    // FIX: Use `setHistoryItems` setter.
    setHistoryItems(prevHistory => [newHistoryItem, ...prevHistory]);
    setContacts(prev => [...prev, ...categorizedResult.contacts]);
    setSchedule(prev => [...prev, ...categorizedResult.schedule]);
    setExpenses(prev => [...prev, ...categorizedResult.expenses]);
    setDiary(prev => [...prev, ...categorizedResult.diary]);

    setConflictData(null);
  };
  
  // CRUD Handlers for Contacts
  const handleAddContact = (contact: Omit<Contact, 'id'>) => {
    const newContact = { ...contact, id: generateId(), group: contact.group || '기타' };
    setContacts(prev => [newContact, ...prev]);
  };

  const handleUpdateContact = (updatedContact: Contact) => {
    setContacts(prev => prev.map(c => (c.id === updatedContact.id ? { ...updatedContact, group: updatedContact.group || '기타' } : c)));
  };

  const handleDeleteContact = (contactId: string) => {
    handleRequestConfirmation(
        '이 연락처를 삭제하시겠습니까?',
        () => {
            const contact = contacts.find(c => c.id === contactId);
            if (contact) {
                setTrash(prev => [...prev, {
                    id: generateId(),
                    originalId: contact.id,
                    type: 'contact',
                    data: contact,
                    deletedAt: new Date().toISOString(),
                    title: contact.name
                }]);
                setContacts(prev => prev.filter(c => c.id !== contactId));
            }
        },
        '삭제된 항목은 휴지통으로 이동됩니다.'
    );
  };

  // CRUD Handlers for Schedule Categories
  const handleAddScheduleCategory = (category: Omit<ScheduleCategory, 'id'>): ScheduleCategory => {
    const newCategory = { ...category, id: generateId() };
    setScheduleCategories(prev => [...prev, newCategory]);
    return newCategory;
  };

  const handleUpdateScheduleCategory = (updatedCategory: ScheduleCategory) => {
    setScheduleCategories(prev => prev.map(c => c.id === updatedCategory.id ? updatedCategory : c));
  };

  const handleDeleteScheduleCategory = (categoryId: string) => {
    const category = scheduleCategories.find(c => c.id === categoryId);
    if (!category) return;

    handleRequestConfirmation(
      `'${category.name}' 카테고리를 삭제하시겠습니까?`,
      () => {
        // Before deleting, update schedule items that use this category to 'uncategorized'
        setSchedule(prev => prev.map(item => 
          item.categoryId === categoryId ? { ...item, categoryId: 'default-uncategorized' } : item
        ));
        setScheduleCategories(prev => prev.filter(c => c.id !== categoryId));
      },
      "이 카테고리의 모든 일정은 '비어있음'으로 변경됩니다."
    );
  };

  // CRUD Handlers for Schedule
  const handleAddSchedule = (item: Omit<ScheduleItem, 'id'>) => {
    const newScheduleItem = { ...item, id: generateId() };
    setSchedule(prev => [...prev, newScheduleItem].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.time || '').localeCompare(b.time || '')));
  };

  const handleUpdateSchedule = (updatedItem: ScheduleItem) => {
    setSchedule(prev => prev.map(s => (s.id === updatedItem.id ? updatedItem : s)));
  };

  const handleDeleteSchedule = (itemId: string) => {
    handleRequestConfirmation(
      '이 일정을 삭제하시겠습니까?',
      () => {
          const item = schedule.find(s => s.id === itemId);
          if (item) {
              setTrash(prev => [...prev, {
                  id: generateId(),
                  originalId: item.id,
                  type: 'schedule',
                  data: item,
                  deletedAt: new Date().toISOString(),
                  title: item.title
              }]);
              setSchedule(prev => prev.filter(s => s.id !== itemId));
          }
      },
      '삭제된 항목은 휴지통으로 이동됩니다.'
    );
  };

  // CRUD Handlers for Expenses
  const handleAddExpense = (expense: Omit<Expense, 'id' | 'imageUrl'>) => {
    const newExpense = { ...expense, id: generateId(), imageUrl: null };
    setExpenses(prev => [...prev, newExpense].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handleUpdateExpense = (updatedExpense: Expense) => {
    setExpenses(prev => prev.map(e => (e.id === updatedExpense.id ? updatedExpense : e)));
  };

  const handleDeleteExpense = (expenseId: string) => {
    handleRequestConfirmation(
        '이 내역을 삭제하시겠습니까?',
        () => {
            const item = expenses.find(e => e.id === expenseId);
            if (item) {
                 setTrash(prev => [...prev, {
                    id: generateId(),
                    originalId: item.id,
                    type: 'expense',
                    data: item,
                    deletedAt: new Date().toISOString(),
                    title: item.item
                }]);
                setExpenses(prev => prev.filter(e => e.id !== expenseId));
            }
        },
        '삭제된 항목은 휴지통으로 이동됩니다.'
    );
  };
  
  // CRUD Handlers for Diary
  const handleAddDiary = (entry: Omit<DiaryEntry, 'id'>) => {
    const newEntry = { ...entry, id: generateId(), group: entry.group || '기타' };
    setDiary(prev => [newEntry, ...prev]);
  };

  const handleUpdateDiary = (updatedEntry: DiaryEntry) => {
    setDiary(prev => prev.map(d => (d.id === updatedEntry.id ? { ...updatedEntry, group: updatedEntry.group || '기타' } : d)));
  };

  const handleDeleteDiary = (diaryId: string) => {
    handleRequestConfirmation(
        '이 메모를 삭제하시겠습니까?',
        () => {
            const item = diary.find(d => d.id === diaryId);
            if (item) {
                 setTrash(prev => [...prev, {
                    id: generateId(),
                    originalId: item.id,
                    type: 'diary',
                    data: item,
                    deletedAt: new Date().toISOString(),
                    title: item.entry.substring(0, 20)
                }]);
                setDiary(prev => prev.filter(d => d.id !== diaryId));
            }
        },
        '삭제된 항목은 휴지통으로 이동됩니다.'
    );
  };

  // Trash Handlers
  const handleRestoreItem = (item: TrashItem) => {
      handleRequestConfirmation(
          "해당 데이터를 복원 하시겠습니까?",
          () => {
              // 1. Restore item to respective state
              switch (item.type) {
                  case 'contact':
                      setContacts(prev => [...prev, item.data as Contact]);
                      break;
                  case 'schedule':
                      setSchedule(prev => [...prev, item.data as ScheduleItem]);
                      break;
                  case 'expense':
                      setExpenses(prev => [...prev, item.data as Expense]);
                      break;
                  case 'diary':
                      setDiary(prev => [...prev, item.data as DiaryEntry]);
                      break;
              }
              // 2. Remove from trash
              setTrash(prev => prev.filter(t => t.id !== item.id));
          },
          "삭제되기 전의 상태로 복구됩니다.",
          "복원",
          "px-4 py-2 bg-cyan-500 text-white rounded-md hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-cyan-500"
      );
  };

  const handlePermanentDelete = (trashId: string) => {
      handleRequestConfirmation(
          "해당 데이터를 영구 삭제하시겠습니까?",
          () => {
              setTrash(prev => prev.filter(t => t.id !== trashId));
          },
          "이 작업은 되돌릴 수 없습니다.",
          "영구 삭제",
           "px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-red-500"
      );
  };

  const handleEmptyTrash = () => {
      handleRequestConfirmation(
          "휴지통에 있는 모든 데이터를 영구 삭제하시겠습니까?",
          () => {
              setTrash([]);
          },
          "이 작업은 되돌릴 수 없습니다.",
          "비우기",
           "px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-red-500"
      );
  };
  
  const handleUpdateChatTitle = (sessionId: string, newTitle: string) => {
    setChatSessions(prevSessions =>
      prevSessions.map(session =>
        session.id === sessionId ? { ...session, title: newTitle } : session
      )
    );
  };

  const handleDeleteChatSession = (sessionId: string) => {
    handleRequestConfirmation(
        '이 대화를 삭제하시겠습니까?',
        () => {
            setChatSessions(prevSessions => prevSessions.filter(session => session.id !== sessionId));
            // If the deleted session was the active one...
            if (activeChatSessionId === sessionId) {
              // If we are currently in the main chat view, deleting the active chat should transition to a new chat.
              // Otherwise (e.g., in CHAT_HISTORY view), just reset the active session ID without changing the view.
              if (activeView === 'ALL') {
                setActiveChatSessionId('new');
                handleNewChat();
              } else {
                setActiveChatSessionId('new');
              }
            }
        },
        '이 작업은 되돌릴 수 없습니다.'
    );
  };

  const handleUpdateNotificationSettings = (newSettings: NotificationSettings) => {
      setNotificationSettings(newSettings);
  };
  
    // --- DATA IMPORT/EXPORT ---
    const triggerImport = () => {
        importFileRef.current?.click();
    };

    const handleExportData = () => {
        try {
            const stateToSave = {
                hasInteracted, history: historyItems, contacts, schedule, scheduleCategories, expenses, diary, trash, chatSessions, activeChatSessionId, notifications, notificationSettings
            };
            const blob = new Blob([JSON.stringify(stateToSave, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().split('T')[0];
            a.download = `lifeone_backup_${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error exporting data:", error);
            setError("데이터를 내보내는 데 실패했습니다.");
        }
    };

    const mergeImportedData = (importedState: any) => {
        if (typeof importedState !== 'object' || importedState === null) {
            throw new Error("잘못된 파일 형식입니다.");
        }

        const normalizePhone = (phone?: string) => phone ? phone.replace(/\D/g, '') : '';

        // Contacts merge
        const mergedContacts = [...contacts];
        const existingContactKeys = new Set(contacts.map(c => (normalizePhone(c.phone) || c.name.trim().toLowerCase())));
        (importedState.contacts || []).forEach((c: Contact) => {
            const key = normalizePhone(c.phone) || c.name.trim().toLowerCase();
            if (key && !existingContactKeys.has(key)) {
                mergedContacts.push(c);
                existingContactKeys.add(key);
            }
        });

        // Categories merge
        const mergedCategories = [...scheduleCategories];
        const existingCategoryNames = new Set(scheduleCategories.map(c => c.name.trim().toLowerCase()));
        (importedState.scheduleCategories || []).forEach((c: ScheduleCategory) => {
            const key = c.name.trim().toLowerCase();
            if (key && !existingCategoryNames.has(key)) {
                mergedCategories.push(c);
                existingCategoryNames.add(key);
            }
        });

        // Schedule merge
        const mergedSchedule = [...schedule];
        const existingScheduleKeys = new Set(schedule.map(s => `${s.title.trim()}|${s.date}`));
        (importedState.schedule || []).forEach((s: ScheduleItem) => {
            const key = `${s.title.trim()}|${s.date}`;
            if (!existingScheduleKeys.has(key)) {
                mergedSchedule.push(s);
                existingScheduleKeys.add(key);
            }
        });

        // Expenses merge
        const mergedExpenses = [...expenses];
        const existingExpenseKeys = new Set(expenses.map(e => `${e.item.trim()}|${e.date}|${e.amount}|${e.type}`));
        (importedState.expenses || []).forEach((e: Expense) => {
            const key = `${e.item.trim()}|${e.date}|${e.amount}|${e.type}`;
            if (!existingExpenseKeys.has(key)) {
                mergedExpenses.push(e);
                existingExpenseKeys.add(key);
            }
        });
        
        // Diary merge
        const mergedDiary = [...diary];
        const existingDiaryKeys = new Set(diary.map(d => `${d.date}|${d.entry.substring(0, 50).trim()}`));
        (importedState.diary || []).forEach((d: DiaryEntry) => {
            const key = `${d.date}|${d.entry.substring(0, 50).trim()}`;
            if (!existingDiaryKeys.has(key)) {
                mergedDiary.push(d);
                existingDiaryKeys.add(key);
            }
        });

        // Trash merge
        const mergedTrash = [...trash];
        const existingTrashIds = new Set(trash.map(t => t.id));
        (importedState.trash || []).forEach((t: TrashItem) => {
            if(!existingTrashIds.has(t.id)) {
                mergedTrash.push(t);
                existingTrashIds.add(t.id);
            }
        });

        // History merge by ID
        // FIX: Use `historyItems` for current state data.
        const mergedHistory = [...historyItems];
        const existingHistoryIds = new Set(historyItems.map(h => h.id));
        (importedState.history || []).forEach((h: HistoryItem) => {
            if (!existingHistoryIds.has(h.id)) {
                mergedHistory.push(h);
                existingHistoryIds.add(h.id);
            }
        });

        // Chat Sessions merge by ID
        const mergedSessions = [...chatSessions];
        const existingSessionIds = new Set(chatSessions.map(s => s.id));
        (importedState.chatSessions || []).forEach((s: ChatSession) => {
            if (!existingSessionIds.has(s.id)) {
                mergedSessions.push(s);
                existingSessionIds.add(s.id);
            }
        });

        // Update state & sort
        setContacts(mergedContacts);
        setScheduleCategories(mergedCategories);
        setSchedule(mergedSchedule.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.time || '').localeCompare(b.time || '')));
        setExpenses(mergedExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setDiary(mergedDiary);
        setTrash(mergedTrash);
        // FIX: Use `setHistoryItems` setter.
        setHistoryItems(mergedHistory.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        setChatSessions(mergedSessions);
        
        if (importedState.hasInteracted && !hasInteracted) {
            setHasInteracted(true);
        }
        
        setError(null);
    };

    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("파일을 읽을 수 없습니다.");
                const importedState = JSON.parse(text);
                
                handleRequestConfirmation(
                    "데이터를 병합하시겠습니까?",
                    () => mergeImportedData(importedState),
                    "기존 데이터에 가져온 데이터를 추가합니다. 내용이 동일한 항목은 자동으로 건너뜁니다. 이 작업은 되돌릴 수 없습니다.",
                    "확인", // Confirm button text
                    "px-4 py-2 bg-cyan-500 text-white rounded-md hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-cyan-500" // Confirm button class
                );

            } catch (err) {
                console.error("Error importing data:", err);
                const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
                setError(`데이터를 가져오는 데 실패했습니다: ${errorMessage}. 파일 형식이 올바른지 확인해주세요.`);
            } finally {
                if (event.target) event.target.value = '';
            }
        };
        reader.onerror = () => {
            setError("파일을 읽는 데 실패했습니다.");
            if (event.target) event.target.value = '';
        };
        reader.readAsText(file);
    };

    // --- KAKAO TALK IMPORT ---
    const triggerKakaoImport = () => {
        kakaoFileRef.current?.click();
    };

    const parseKakaoTalkExport = (text: string) => {
        // Simple parser for common KakaoTalk export formats.
        // It tries to clean up the conversation to make it easier for Gemini.
        // It looks for date lines to separate days.
        
        const lines = text.split('\n');
        let processedText = "KakaoTalk Export Data:\n";
        let currentDate = "";

        // Heuristic: Limit total text sent to Gemini to prevent token overflow.
        // We'll take the last ~2000 lines or ~50000 characters if it's huge.
        const SLICE_SIZE = 2000;
        const slicedLines = lines.length > SLICE_SIZE ? lines.slice(lines.length - SLICE_SIZE) : lines;

        slicedLines.forEach(line => {
             line = line.trim();
             if (!line) return;

             // Check for Date separators (Various formats depending on OS/Version)
             // e.g. "--------------- 2024년 5월 1일 수요일 ---------------"
             // e.g. "2024년 5월 1일 수요일"
             if (line.includes('---------------') && line.includes('년') && line.includes('월')) {
                 currentDate = line.replace(/-/g, '').trim();
                 processedText += `\n[Date: ${currentDate}]\n`;
                 return;
             }

             // Check for Message pattern: [Name] [Time] Message
             const messageMatch = line.match(/^\[(.*?)\] \[(.*?)\] (.*)/);
             if (messageMatch) {
                 const name = messageMatch[1];
                 const time = messageMatch[2];
                 const msg = messageMatch[3];
                 processedText += `${name} (${time}): ${msg}\n`;
             } else {
                 // Continuation of previous message or system message
                 processedText += `${line}\n`;
             }
        });

        return processedText;
    };

    const handleKakaoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("파일을 읽을 수 없습니다.");

                const processedChat = parseKakaoTalkExport(text);
                const prompt = `
                I have uploaded a chat log from KakaoTalk. Please analyze this log and extract any contacts, schedule items (appointments, events), expenses (transactions), or important memos/diary entries found in the conversation.
                
                The log contains dates in headers (e.g., [Date: ...]) and messages in the format "Name (Time): Message".
                
                Extract ALL relevant information into the JSON format provided in the schema.
                For schedules, assume the year is the current year if not specified, but prefer the date context from the log.
                For contacts, infer phone numbers or emails if mentioned.
                
                Chat Log:
                ${processedChat}
                `;

                // Reuse processChat but with our constructed prompt as the user message.
                // We pass empty context to avoid confusion, or we can pass existing context if we want to check for duplicates (optional).
                // Here we just want raw extraction first.
                const contextData = getPrunedContextData();
                const result = await processChat([], prompt, null, contextData);
                
                const hasExtractedData = 
                    result.dataExtraction.contacts.length > 0 ||
                    result.dataExtraction.schedule.length > 0 ||
                    result.dataExtraction.expenses.length > 0 ||
                    result.dataExtraction.diary.length > 0;

                if (hasExtractedData) {
                    const categorizedResult = addIdsToData(result.dataExtraction);
                    setImportSelectionData(categorizedResult);
                    setImportModalTitle("카카오톡 대화 분석 결과");
                } else {
                    alert("대화 내용에서 저장할 만한 데이터(일정, 연락처 등)를 찾지 못했습니다.");
                }

            } catch (err) {
                console.error("Error processing Kakao log:", err);
                setError("카카오톡 대화 분석 중 오류가 발생했습니다.");
            } finally {
                setIsLoading(false);
                if (event.target) event.target.value = '';
            }
        };
        reader.onerror = () => {
            setError("파일을 읽는 데 실패했습니다.");
            setIsLoading(false);
            if (event.target) event.target.value = '';
        };
        reader.readAsText(file);
    };

    // --- VCF IMPORT ---
    const triggerVcfImport = () => {
        vcfFileRef.current?.click();
    };

    const parseVcfString = (vcfContent: string): CategorizedData => {
        const contacts: Contact[] = [];
        const lines = vcfContent.split(/\r\n|\r|\n/);
        let currentContact: Partial<Contact> = {};
        let inCard = false;

        const decodeQP = (str: string) => {
            try {
                return decodeURIComponent(str.replace(/=([0-9A-F]{2})/g, '%$1').replace(/=\r?\n/g, ''));
            } catch (e) {
                return str;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            // Unfold lines
            while (i + 1 < lines.length && lines[i + 1].startsWith(' ')) {
                line += lines[i + 1].substring(1);
                i++;
            }

            if (line.startsWith('BEGIN:VCARD')) {
                inCard = true;
                currentContact = { id: generateId(), group: '기타' };
                continue;
            }
            if (line.startsWith('END:VCARD')) {
                if (currentContact.name || currentContact.phone) {
                    contacts.push({
                        id: currentContact.id || generateId(),
                        name: currentContact.name || '이름 없음',
                        phone: currentContact.phone,
                        email: currentContact.email,
                        group: currentContact.group || '기타',
                    } as Contact);
                }
                inCard = false;
                continue;
            }

            if (!inCard) continue;

            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;

            const left = line.substring(0, colonIdx);
            let right = line.substring(colonIdx + 1);

            const parts = left.split(';');
            const key = parts[0].toUpperCase();
            const params = parts.slice(1);

            const isQP = params.some(p => p.toUpperCase().includes('QUOTED-PRINTABLE'));

            if (isQP) {
                right = decodeQP(right);
            }

            if (key === 'FN') {
                currentContact.name = right;
            } else if (key === 'N' && !currentContact.name) {
                const nParts = right.split(';');
                const family = nParts[0] || '';
                const given = nParts[1] || '';
                currentContact.name = (family + given).trim();
            } else if (key === 'TEL' && !currentContact.phone) {
                currentContact.phone = formatPhoneNumber(right);
            } else if (key === 'EMAIL' && !currentContact.email) {
                currentContact.email = right;
            } else if ((key === 'ORG' || key === 'TITLE') && !currentContact.group) {
                currentContact.group = right.split(';')[0];
            }
        }

        return { contacts, schedule: [], expenses: [], diary: [] };
    };

    const handleVcfFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("파일을 읽을 수 없습니다.");

                const categorizedResult = parseVcfString(text);
                if (categorizedResult.contacts.length > 0) {
                    setImportSelectionData(categorizedResult);
                    setImportModalTitle("연락처 파일 분석 결과");
                } else {
                    alert("파일에서 연락처를 찾을 수 없습니다.");
                }
            } catch (err) {
                console.error("Error processing VCF file:", err);
                setError("연락처 파일 분석 중 오류가 발생했습니다.");
            } finally {
                setIsLoading(false);
                if (event.target) event.target.value = '';
            }
        };
        reader.onerror = () => {
            setError("파일을 읽는 데 실패했습니다.");
            setIsLoading(false);
            if (event.target) event.target.value = '';
        };
        reader.readAsText(file);
    };

    const handleImportSelectionConfirm = (selectedData: CategorizedData) => {
        // Merge selected data into state
        addDataToState(selectedData, { text: `Imported Data (${importModalTitle})`, imageName: null, imageUrl: null });
        setImportSelectionData(null);
    };


  const renderContent = () => {
    if (activeView === 'ALL') {
       let messagesToShow: ChatMessage[];
      if (activeChatSessionId === 'new') {
        messagesToShow = initialMessages;
      } else {
        const activeSession = chatSessions.find(s => s.id === activeChatSessionId);
        messagesToShow = activeSession ? activeSession.messages : initialMessages;
      }
      return (
        <ChatInterface 
          messages={messagesToShow}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          categories={scheduleCategories}
        />
      );
    }

    let content: React.ReactNode = null;

    switch(activeView) {
        case 'NOTIFICATIONS':
            content = (
                <NotificationsView 
                    notifications={notifications}
                    onNotificationClick={handleNotificationClick}
                    settings={notificationSettings}
                    onUpdateSettings={handleUpdateNotificationSettings}
                    onClearAll={handleClearAllNotifications}
                />
            );
            break;
        case 'TRASH':
            content = (
                <TrashView 
                    trashItems={trash} 
                    onRestore={handleRestoreItem} 
                    onDeleteForever={handlePermanentDelete}
                    onEmptyTrash={handleEmptyTrash}
                />
            );
            break;
        case 'HISTORY':
            content = (
              <>
                {error && <div className="text-red-700 bg-red-100 p-3 rounded-md mb-4">{error}</div>}
                {/* FIX: Use `historyItems` state variable. */}
                {isLoading && historyItems.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-gray-500">
                            <svg className="animate-spin h-8 w-8 text-cyan-500 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p>처리 중입니다...</p>
                        </div>
                    </div>
                ) : (
                    // FIX: Pass `historyItems` to `HistoryList`.
                    <HistoryList history={historyItems} onSelectItem={setSelectedHistoryItem} isLoading={isLoading}/>
                )}
              </>
            );
            break;
        case 'CHAT_HISTORY':
            content = (
                <ChatHistoryList
                    chatSessions={chatSessions}
                    onSelectChat={handleSelectChat}
                    onNewChat={handleNewChat}
                    onUpdateChatTitle={handleUpdateChatTitle}
                    onDeleteChatSession={handleDeleteChatSession}
                />
            );
            break;
        case 'CALENDAR':
            content = (
              <CalendarView 
                scheduleItems={schedule} 
                categories={scheduleCategories}
                onAdd={handleAddSchedule}
                onUpdate={handleUpdateSchedule}
                onDelete={handleDeleteSchedule}
                onAddCategory={handleAddScheduleCategory}
                onUpdateCategory={handleUpdateScheduleCategory}
                onDeleteCategory={handleDeleteScheduleCategory}
                navigationRequest={calendarNavigationRequest}
              />
            );
            break;
        case 'EXPENSES_DASHBOARD':
            content = (
              <ExpensesCalendarView 
                expenses={expenses} 
                onAdd={handleAddExpense}
                onUpdate={handleUpdateExpense}
                onDelete={handleDeleteExpense}
              />
            );
            break;
        case 'EXPENSES_INCOME': {
            const incomeItems = expenses.filter(e => e.type === 'income');
            
            const handleIncomeMonthChange = (offset: number) => {
                setSelectedIncomeMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
            };
            
            const handleIncomeDateSelect = (date: Date) => {
                const now = new Date();
                if (date.getFullYear() > now.getFullYear() || (date.getFullYear() === now.getFullYear() && date.getMonth() > now.getMonth())) {
                    return;
                }
                setSelectedIncomeMonth(date);
            };

            const now = new Date();
            const isNextMonthInFuture = selectedIncomeMonth.getFullYear() > now.getFullYear() || 
                                       (selectedIncomeMonth.getFullYear() === now.getFullYear() && selectedIncomeMonth.getMonth() >= now.getMonth());

            // 1. Filter by Month first
            const monthlyIncomeItems = incomeItems.filter(item => {
                const [year, month] = item.date.split('-').map(Number);
                return year === selectedIncomeMonth.getFullYear() &&
                       (month - 1) === selectedIncomeMonth.getMonth();
            }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // 2. Get Unique Categories for filter dropdown from month data
            const availableCategories = Array.from(new Set(monthlyIncomeItems.map(item => item.category || '기타'))).sort();

            // 3. Apply Category Filter if selected
            const displayedItems = incomeFilterCategory 
                ? monthlyIncomeItems.filter(item => (item.category || '기타') === incomeFilterCategory)
                : monthlyIncomeItems;

            const totalIncomeForMonth = monthlyIncomeItems.reduce((sum, expense) => sum + expense.amount, 0);

            content = (
              <div className="flex flex-col h-full">
                {/* Summary section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-white border border-gray-200 p-4 rounded-lg flex items-center justify-center">
                    <button onClick={() => handleIncomeMonthChange(-1)} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">&lt;</button>
                    <MonthYearPicker
                        selectedDate={selectedIncomeMonth}
                        onChange={handleIncomeDateSelect}
                    />
                    <button onClick={() => handleIncomeMonthChange(1)} disabled={isNextMonthInFuture} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">&gt;</button>
                  </div>
                  <div className="bg-white border border-gray-200 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-600">해당 월 총 수입</h3>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {totalIncomeForMonth.toLocaleString('ko-KR')}원
                    </p>
                  </div>
                </div>

                {/* History section */}
                <div className="flex-grow flex flex-col bg-gray-50 p-4 rounded-lg min-h-0">
                   <div className="flex justify-between items-center mb-3 relative">
                      <h3 className="text-lg font-semibold text-cyan-700">수입 내역 기록</h3>
                      
                      {/* Filter Dropdown */}
                      <div className="relative">
                        <button 
                            onClick={() => setIsIncomeFilterOpen(!isIncomeFilterOpen)}
                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-cyan-700 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm"
                        >
                            <span>{incomeFilterCategory || '전체'}</span>
                            <FilterIcon className="h-4 w-4" />
                        </button>
                        
                        {isIncomeFilterOpen && (
                            <>
                            <div className="fixed inset-0 z-10 cursor-default" onClick={() => setIsIncomeFilterOpen(false)}></div>
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-md shadow-lg z-20 border border-gray-200 py-1 max-h-60 overflow-y-auto">
                                <button
                                    onClick={() => { setIncomeFilterCategory(null); setIsIncomeFilterOpen(false); }}
                                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${!incomeFilterCategory ? 'font-bold text-cyan-600 bg-cyan-50' : 'text-gray-700'}`}
                                >
                                    전체
                                </button>
                                {availableCategories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => { setIncomeFilterCategory(cat); setIsIncomeFilterOpen(false); }}
                                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${incomeFilterCategory === cat ? 'font-bold text-cyan-600 bg-cyan-50' : 'text-gray-700'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                            </>
                        )}
                      </div>
                   </div>

                  <div className="flex-grow overflow-y-auto pr-2">
                    {displayedItems.length > 0 ? (
                      <ExpensesList 
                          expenses={displayedItems} 
                          onUpdate={handleUpdateExpense}
                          onDelete={handleDeleteExpense}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-gray-500">
                            {incomeFilterCategory ? `'${incomeFilterCategory}' 카테고리의 내역이 없습니다.` : '해당 월의 수입 내역이 없습니다.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            break;
        }
        case 'EXPENSES_EXPENSE': {
            const expenseItems = expenses.filter(e => e.type === 'expense');
            
            const handleExpenseMonthChange = (offset: number) => {
                setSelectedExpenseMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
            };

            const handleExpenseDateSelect = (date: Date) => {
                const now = new Date();
                if (date.getFullYear() > now.getFullYear() || (date.getFullYear() === now.getFullYear() && date.getMonth() > now.getMonth())) {
                    return;
                }
                setSelectedExpenseMonth(date);
            };

            const now = new Date();
            const isNextMonthInFuture = selectedExpenseMonth.getFullYear() > now.getFullYear() || 
                                       (selectedExpenseMonth.getFullYear() === now.getFullYear() && selectedExpenseMonth.getMonth() >= now.getMonth());

            // 1. Filter by Month
            const filteredExpenseItems = expenseItems.filter(item => {
                const [year, month] = item.date.split('-').map(Number);
                return year === selectedExpenseMonth.getFullYear() &&
                       (month - 1) === selectedExpenseMonth.getMonth();
            }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // 2. Get Unique Categories for filter dropdown
            const availableCategories = Array.from(new Set(filteredExpenseItems.map(item => item.category || '기타'))).sort();

            // 3. Apply Category Filter if selected
            const displayedItems = expenseFilterCategory
                ? filteredExpenseItems.filter(item => (item.category || '기타') === expenseFilterCategory)
                : filteredExpenseItems;

            const totalExpenseForMonth = filteredExpenseItems.reduce((sum, expense) => sum + expense.amount, 0);


            content = (
              <div className="flex flex-col h-full">
                {/* Summary section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-white border border-gray-200 p-4 rounded-lg flex items-center justify-center">
                    <button onClick={() => handleExpenseMonthChange(-1)} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">&lt;</button>
                     <MonthYearPicker
                        selectedDate={selectedExpenseMonth}
                        onChange={handleExpenseDateSelect}
                    />
                    <button onClick={() => handleExpenseMonthChange(1)} disabled={isNextMonthInFuture} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">&gt;</button>
                  </div>
                  <div className="bg-white border border-gray-200 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-600">해당 월 총 지출</h3>
                    <p className="text-2xl font-bold text-red-600 mt-1">
                      {totalExpenseForMonth.toLocaleString('ko-KR')}원
                    </p>
                  </div>
                </div>

                {/* History section */}
                <div className="flex-grow flex flex-col bg-gray-50 p-4 rounded-lg min-h-0">
                  <div className="flex justify-between items-center mb-3 relative">
                      <h3 className="text-lg font-semibold text-cyan-700">지출 내역 기록</h3>
                      
                      {/* Filter Dropdown */}
                      <div className="relative">
                        <button
                            onClick={() => setIsExpenseFilterOpen(!isExpenseFilterOpen)}
                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-cyan-700 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm"
                        >
                            <span>{expenseFilterCategory || '전체'}</span>
                            <FilterIcon className="h-4 w-4" />
                        </button>

                        {isExpenseFilterOpen && (
                            <>
                            <div className="fixed inset-0 z-10 cursor-default" onClick={() => setIsExpenseFilterOpen(false)}></div>
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-md shadow-lg z-20 border border-gray-200 py-1 max-h-60 overflow-y-auto">
                                <button
                                    onClick={() => { setExpenseFilterCategory(null); setIsExpenseFilterOpen(false); }}
                                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${!expenseFilterCategory ? 'font-bold text-cyan-600 bg-cyan-50' : 'text-gray-700'}`}
                                >
                                    전체
                                </button>
                                {availableCategories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => { setExpenseFilterCategory(cat); setIsExpenseFilterOpen(false); }}
                                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${expenseFilterCategory === cat ? 'font-bold text-cyan-600 bg-cyan-50' : 'text-gray-700'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                            </>
                        )}
                      </div>
                  </div>
                  
                  <div className="flex-grow overflow-y-auto pr-2">
                    {displayedItems.length > 0 ? (
                      <ExpensesList 
                          expenses={displayedItems} 
                          onUpdate={handleUpdateExpense}
                          onDelete={handleDeleteExpense}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-gray-500">
                            {expenseFilterCategory ? `'${expenseFilterCategory}' 카테고리의 내역이 없습니다.` : '해당 월의 지출 내역이 없습니다.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            break;
        }
        case 'EXPENSES_STATS':
            content = <ExpensesStatsView expenses={expenses} />;
            break;
        case 'CONTACTS':
            content = <ContactsList 
                        contacts={contacts} 
                        onAdd={handleAddContact}
                        onUpdate={handleUpdateContact}
                        onDelete={handleDeleteContact}
                      />;
            break;
        case 'DIARY':
            content = <DiaryList 
                        diaryEntries={diary} 
                        onAdd={handleAddDiary}
                        onUpdate={handleUpdateDiary}
                        onDelete={handleDeleteDiary}
                      />;
            break;
    }
     return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-md">
            <div className="flex-grow overflow-y-auto pr-2 min-h-0">
                {content}
            </div>
        </div>
    );
  };
  
  const handleSidebarViewChange = (view: View) => {
    if (activeView === view) return;
    
    setIsTransitioning(true);
    setTimeout(() => {
        setActiveView(view);
        if (!hasInteracted) {
            setHasInteracted(true);
        }
        setIsTransitioning(false);
    }, VIEW_TRANSITION_DURATION);
  };

  const handleSidebarSelectChat = (sessionId: string) => {
    handleSelectChat(sessionId);
  };

  const sidebarComponent = (
    <Sidebar 
      isOpen={isSidebarOpen}
      activeView={activeView} 
      onViewChange={handleSidebarViewChange}
      chatSessions={chatSessions}
      activeChatSessionId={activeChatSessionId}
      onSelectChat={handleSidebarSelectChat}
      onNewChat={handleNewChat}
      onGoHome={handleGoHome}
      onUpdateChatTitle={handleUpdateChatTitle}
      onDeleteChatSession={handleDeleteChatSession}
      onImportData={triggerImport}
      onExportData={handleExportData}
      notificationCount={notifications.length}
      onImportKakao={triggerKakaoImport}
      onImportVcf={triggerVcfImport}
    />
  );

  let currentTitle = '';
    if (activeView === 'ALL') {
      if (activeChatSessionId === 'new') {
        currentTitle = "새 대화";
      } else {
        currentTitle = chatSessions.find(s => s.id === activeChatSessionId)?.title || "대화";
      }
    } else {
      const viewTitles: Record<string, string> = {
        NOTIFICATIONS: '알림',
        HISTORY: '처리 내역',
        CHAT_HISTORY: '대화 기록',
        CALENDAR: '캘린더',
        EXPENSES_DASHBOARD: '가계부 대시보드',
        EXPENSES_INCOME: '수입 내역',
        EXPENSES_EXPENSE: '지출 내역',
        EXPENSES_STATS: '가계부 통계',
        CONTACTS: '연락처',
        DIARY: '메모장',
        TRASH: '휴지통',
      };
      currentTitle = viewTitles[activeView] || '';
    }


  if (!hasInteracted) {
    const messagesToShow: ChatMessage[] = [];
    const hamburgerButton = (
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="absolute top-6 left-6 text-gray-500 hover:text-gray-900 z-30 p-2 rounded-md hover:bg-gray-200"
        aria-label="Toggle sidebar"
      >
        <MenuIcon className="h-6 w-6" />
      </button>
    );
    
    return (
      <div className="bg-gray-100 text-gray-800 font-sans h-screen flex relative overflow-x-hidden">
        {sidebarComponent}
        <div className={`relative flex-grow h-full flex flex-col items-center justify-end p-4 transition-all duration-1000 ease-in-out ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>
          <input type="file" accept=".json" ref={importFileRef} onChange={handleImportData} className="hidden" />
          <input type="file" accept=".txt,.csv" ref={kakaoFileRef} onChange={handleKakaoFileChange} className="hidden" />
          <input type="file" accept=".vcf" ref={vcfFileRef} onChange={handleVcfFileChange} className="hidden" />
          {hamburgerButton}
          <div className="flex-grow flex items-center justify-center">
            <h1 className="text-6xl md:text-7xl font-bold text-gray-800 tracking-wider animate-fade-in">LifeONE</h1>
          </div>
          <div className="w-full max-w-3xl">
            <ChatInterface 
              messages={messagesToShow}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              isInitialView={true}
              categories={scheduleCategories}
            />
          </div>
        </div>
        {confirmation && (
            <ConfirmationModal
                message={confirmation.message}
                description={confirmation.description}
                onConfirm={confirmation.onConfirm}
                onCancel={handleCancelConfirmation}
                confirmText={confirmation.confirmText}
                confirmButtonClass={confirmation.confirmButtonClass}
            />
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-100 text-gray-800 font-sans h-screen flex relative overflow-x-hidden">
      <input type="file" accept=".json" ref={importFileRef} onChange={handleImportData} className="hidden" />
      <input type="file" accept=".txt,.csv" ref={kakaoFileRef} onChange={handleKakaoFileChange} className="hidden" />
      <input type="file" accept=".vcf" ref={vcfFileRef} onChange={handleVcfFileChange} className="hidden" />
      <main className={`relative flex-grow h-full flex flex-col transition-all duration-1000 ease-in-out ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <div className={`h-full flex flex-col transition-all duration-300 ease-in-out ${isTransitioning ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}>
            <header className="flex-shrink-0 flex items-center p-6 h-20 bg-white border-b border-gray-200">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="text-gray-500 hover:text-gray-900 z-30 p-2 rounded-md hover:bg-gray-200"
                aria-label="Toggle sidebar"
              >
                <MenuIcon className="h-6 w-6" />
              </button>
              <h1 className="text-2xl font-bold ml-4 text-cyan-700 truncate pr-4">{currentTitle}</h1>
            </header>
            
            <div className="flex-grow min-h-0">
                <div className={`h-full ${activeView !== 'ALL' ? 'px-6 pb-6' : ''}`}>
                    {renderContent()}
                </div>
            </div>
        </div>
      </main>
      {sidebarComponent}
      {selectedHistoryItem && (
        <HistoryDetailModal 
          item={selectedHistoryItem} 
          onClose={() => setSelectedHistoryItem(null)} 
        />
      )}
      {conflictData && (
        <ConflictModal
          conflicts={conflictData.conflicts}
          onConfirm={handleConflictConfirm}
          onCancel={handleConflictCancel}
          onIgnore={handleConflictIgnoreAndAdd}
        />
      )}
      {confirmation && (
        <ConfirmationModal
            message={confirmation.message}
            description={confirmation.description}
            onConfirm={confirmation.onConfirm}
            onCancel={handleCancelConfirmation}
            confirmText={confirmation.confirmText}
            confirmButtonClass={confirmation.confirmButtonClass}
        />
      )}
      {importSelectionData && (
        <DataSelectionModal 
            data={importSelectionData}
            onConfirm={handleImportSelectionConfirm}
            onCancel={() => setImportSelectionData(null)}
            title={importModalTitle}
        />
      )}
    </div>
  );
};

export default App;
