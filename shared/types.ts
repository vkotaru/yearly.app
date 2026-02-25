// ── User (for Google OAuth) ──
export interface User {
  id: number;
  google_id: string;
  email: string;
  name: string;
  picture: string;
  created_at: string;
}

export interface Entry {
  id: number;
  year: number;
  month: number;       // 1-12 (start month)
  end_month: number;   // 1-12 (end month, same as month for single-month entries)
  day_start: number;   // 1-31 (start day in start month)
  day_end: number;     // 1-31 (end day in end month)
  row_index: number;   // 0-based slot
  title: string;
  description: string;
  url: string;
  color: string;       // hex color
  category: string;
  emoji: string;       // emoji displayed before title
  departure_time: string; // travel departure info
  arrival_time: string;   // travel arrival info
  user_id?: number;    // owner (null for legacy entries)
  is_private: boolean; // false = shared, true = only creator sees it
  is_tentative: boolean; // true = tentative/unconfirmed plan
  created_at: string;
  updated_at: string;
  // Computed fields (from JOIN)
  incomplete_todos?: number;
}

export interface Comment {
  id: number;
  entry_id: number;
  text: string;
  author: string;
  user_id?: number;
  created_at: string;
}

export interface CreateEntryDto {
  year: number;
  month: number;
  end_month?: number;  // Optional, defaults to month for single-month entries
  day_start: number;
  day_end: number;
  row_index: number;
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  category?: string;
  emoji?: string;
  departure_time?: string;
  arrival_time?: string;
  is_private?: boolean;
  is_tentative?: boolean;
}

export interface UpdateEntryDto {
  month?: number;      // Allow changing start month when moving
  end_month?: number;  // Allow changing end month
  day_start?: number;
  day_end?: number;
  row_index?: number;
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  category?: string;
  emoji?: string;
  departure_time?: string;
  arrival_time?: string;
  is_private?: boolean;
  is_tentative?: boolean;
}

export interface CreateCommentDto {
  entry_id: number;
  text: string;
  author?: string;
}

// ── Todo (checklist items for entries) ──
export interface Todo {
  id: number;
  entry_id: number;
  text: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTodoDto {
  text: string;
}

export interface UpdateTodoDto {
  text?: string;
  completed?: boolean;
  sort_order?: number;
}

// ── Auth DTOs ──
export interface GoogleAuthDto {
  credential: string;
}

export interface AuthResponse {
  user: User;
}
