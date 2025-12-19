
export interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  group?: string;
  favorite?: boolean;
}

export interface ScheduleCategory {
  id: string;
  name: string;
  color: string;
}

export interface ScheduleItem {
  id:string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  categoryId?: string;
  category?: string; // For AI processing before assigning an ID
  isDday?: boolean;
}

export interface Expense {
  id: string;
  date: string;
  item: string;
  amount: number;
  type: 'expense' | 'income';
  category?: string;
  imageUrl?: string | null;
}

export interface DiaryEntry {
  id: string;
  date: string;
  entry: string; // Content for memo, title for checklist
  group?: string;
  isChecklist?: boolean;
  checklistItems?: { id: string; text: string; completed: boolean; dueDate?: string; }[];
  imageUrl?: string | null;
  imageName?: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'calendar' | 'budget' | 'system';
  relatedData?: {
    view: View;
    date?: string;
  };
}

export interface NotificationSettings {
  calendar: {
    enabled: boolean;
    dDayAlerts: boolean; // 1, 10, 50, 100... check
    todayEventAlerts: boolean;
  };
  budget: {
    enabled: boolean;
    monthlyLimit: number;
  };
}

// Type for the different views in the app
export type View = 'ALL' | 'CALENDAR' | 'EXPENSES_DASHBOARD' | 'EXPENSES_INCOME' | 'EXPENSES_EXPENSE' | 'EXPENSES_STATS' | 'CONTACTS' | 'DIARY' | 'HISTORY' | 'CHAT_HISTORY' | 'NOTIFICATIONS' | 'TRASH';

// Type returned by the Gemini API service, before adding IDs
export interface ProcessedData {
  contacts: Omit<Contact, 'id'>[];
  schedule: Omit<ScheduleItem, 'id'>[];
  expenses: Omit<Expense, 'id' | 'imageUrl'>[];
  diary: Omit<DiaryEntry, 'id'>[];
}

export interface CategorizedData {
  contacts: Contact[];
  schedule: ScheduleItem[];
  expenses: Expense[];
  diary: DiaryEntry[];
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  input: {
    text: string | null;
    imageName: string | null;
    imageUrl: string | null;
  };
  output: CategorizedData;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string | null;
  clarificationOptions?: string[];
  isQuote?: boolean;
  webSearchSources?: { title: string; uri: string }[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}

// --- New Types for Data Modification/Deletion ---

// FIX: Constrain the generic type `T` to `object` to ensure it can be spread. This resolves the "Spread types may only be created from object types" error in App.tsx when updating state.
export interface Modification<T extends object> {
  id: string;
  fieldsToUpdate: Partial<Omit<T, 'id'>>;
}

export interface DataModification {
  contacts: Modification<Contact>[];
  schedule: Modification<ScheduleItem>[];
  expenses: Modification<Expense>[];
  diary: Modification<DiaryEntry>[];
}

export interface DataDeletion {
  contacts: string[];
  schedule: string[];
  expenses: string[];
  diary: string[];
}

export interface ConversationalResponse {
  answer: string;
  dataExtraction: ProcessedData;
  dataModification: DataModification;
  dataDeletion: DataDeletion;
  clarificationNeeded?: boolean;
  clarificationOptions?: string[];
  webSearchSources?: { title: string; uri: string }[];
}

// --- Trash Type ---
export interface TrashItem {
  id: string; // Unique ID for the trash entry
  originalId: string;
  type: 'contact' | 'schedule' | 'expense' | 'diary';
  data: Contact | ScheduleItem | Expense | DiaryEntry;
  deletedAt: string;
  title: string; // Display title for the list
}
