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
  month: number;       // 1-12
  day_start: number;   // 1-31
  day_end: number;     // 1-31
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
}

export interface UpdateEntryDto {
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
