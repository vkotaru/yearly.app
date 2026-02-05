export interface Entry {
  id: number;
  year: number;
  month: number;       // 1-12
  day_start: number;   // 1-31
  day_end: number;     // 1-31
  row_index: number;   // 0-based slot
  text: string;
  color: string;       // hex color
  created_at: string;
  updated_at: string;
}

export interface CreateEntryDto {
  year: number;
  month: number;
  day_start: number;
  day_end: number;
  row_index: number;
  text?: string;
  color?: string;
}

export interface UpdateEntryDto {
  day_start?: number;
  day_end?: number;
  row_index?: number;
  text?: string;
  color?: string;
}
