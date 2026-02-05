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
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: number;
  entry_id: number;
  text: string;
  author: string;
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
}

export interface CreateCommentDto {
  entry_id: number;
  text: string;
  author?: string;
}
