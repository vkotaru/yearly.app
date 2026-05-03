/**
 * Dev seed script — populates a user's calendar with sample events, trips,
 * birthdays, and anniversaries for one year. Idempotent by default: deletes
 * existing entries in the seed's categories before inserting, so re-running
 * never creates duplicates.
 *
 * Usage:
 *   npm run seed                    # first user, current year (idempotent)
 *   npm run seed -- --clear         # wipe ALL entries for year first
 *   npm run seed -- --keep          # additive (legacy behavior)
 *   npm run seed -- --year=2027
 *   npm run seed -- --user=foo@bar.com --year=2026
 */
import db from '../src/db.js';

interface Sample {
  month: number;
  end_month?: number;
  day_start: number;
  day_end: number;
  row_index: number;
  title: string;
  emoji: string;
  color: string;
  category: string;
  description?: string;
  is_tentative?: boolean;
}

const EVENTS = '#3b82f6';        // blue
const TRIPS = '#06b6d4';         // teal
const BIRTHDAYS = '#ec4899';     // pink
const ANNIVERSARIES = '#f43f5e'; // rose

const samples: Sample[] = [
  // ── Events (row 0) ──
  { month: 1,  day_start: 15, day_end: 15, row_index: 0, title: 'Tech Conference',     emoji: '💻', color: EVENTS, category: 'Events' },
  { month: 2,  day_start: 14, day_end: 14, row_index: 0, title: "Valentine's Dinner",  emoji: '🌹', color: EVENTS, category: 'Events' },
  { month: 3,  day_start: 20, day_end: 20, row_index: 0, title: 'Spring Concert',      emoji: '🎵', color: EVENTS, category: 'Events' },
  { month: 4,  day_start: 5,  day_end: 5,  row_index: 0, title: 'Marathon',            emoji: '🏃', color: EVENTS, category: 'Events' },
  { month: 5,  day_start: 23, day_end: 23, row_index: 0, title: "Friend's Wedding",    emoji: '💍', color: EVENTS, category: 'Events' },
  { month: 6,  day_start: 21, day_end: 21, row_index: 0, title: 'Solstice Party',      emoji: '🌞', color: EVENTS, category: 'Events' },
  { month: 9,  day_start: 19, day_end: 21, row_index: 0, title: 'Music Festival',      emoji: '🎪', color: EVENTS, category: 'Events' },
  { month: 10, day_start: 31, day_end: 31, row_index: 0, title: 'Halloween Party',     emoji: '🎃', color: EVENTS, category: 'Events' },
  { month: 11, day_start: 26, day_end: 26, row_index: 0, title: 'Thanksgiving Dinner', emoji: '🦃', color: EVENTS, category: 'Events' },
  { month: 12, day_start: 24, day_end: 25, row_index: 0, title: 'Christmas',           emoji: '🎄', color: EVENTS, category: 'Events' },

  // ── Trips (row 1) — one cross-month, one tentative ──
  { month: 3,  day_start: 6,  day_end: 15, row_index: 1, title: 'Tokyo',          emoji: '🗼', color: TRIPS, category: 'Travel', description: 'Cherry blossom season' },
  { month: 6,  end_month: 7, day_start: 28, day_end: 5, row_index: 1, title: 'Paris', emoji: '🥐', color: TRIPS, category: 'Travel', is_tentative: true },
  { month: 8,  day_start: 14, day_end: 16, row_index: 1, title: 'Beach Weekend',  emoji: '🏖️', color: TRIPS, category: 'Travel' },
  { month: 9,  day_start: 5,  day_end: 8,  row_index: 1, title: 'Hiking Trip',    emoji: '🥾', color: TRIPS, category: 'Travel' },
  { month: 11, day_start: 13, day_end: 22, row_index: 1, title: 'Family Visit',   emoji: '🏡', color: TRIPS, category: 'Travel' },
  { month: 12, day_start: 27, day_end: 31, row_index: 1, title: 'Year-End Ski',   emoji: '🎿', color: TRIPS, category: 'Travel' },

  // ── Birthdays (row 2) ──
  { month: 1,  day_start: 22, day_end: 22, row_index: 2, title: "Mom's Birthday",     emoji: '🎂', color: BIRTHDAYS, category: 'Birthdays' },
  { month: 3,  day_start: 8,  day_end: 8,  row_index: 2, title: "Sister's Birthday",  emoji: '🎂', color: BIRTHDAYS, category: 'Birthdays' },
  { month: 5,  day_start: 14, day_end: 14, row_index: 2, title: "Dad's Birthday",     emoji: '🎂', color: BIRTHDAYS, category: 'Birthdays' },
  { month: 7,  day_start: 7,  day_end: 7,  row_index: 2, title: "Sam's Birthday",     emoji: '🎂', color: BIRTHDAYS, category: 'Birthdays' },
  { month: 10, day_start: 18, day_end: 18, row_index: 2, title: "Brother's Birthday", emoji: '🎂', color: BIRTHDAYS, category: 'Birthdays' },

  // ── Anniversaries (row 3) ──
  { month: 4, day_start: 28, day_end: 28, row_index: 3, title: 'Wedding Anniversary', emoji: '💑', color: ANNIVERSARIES, category: 'Anniversaries' },
  { month: 9, day_start: 1,  day_end: 1,  row_index: 3, title: 'Work Anniversary',    emoji: '🎉', color: ANNIVERSARIES, category: 'Anniversaries' },
];

// ── CLI args ──
const args = process.argv.slice(2);
const yearArg = args.find(a => a.startsWith('--year='))?.split('=')[1];
const userArg = args.find(a => a.startsWith('--user='))?.split('=')[1];
const clear = args.includes('--clear');
const keep = args.includes('--keep');

const year = yearArg ? parseInt(yearArg, 10) : new Date().getFullYear();
if (!Number.isInteger(year) || year < 1970) {
  console.error(`Invalid --year: ${yearArg}`);
  process.exit(1);
}

interface UserRow { id: number; email: string; }
let user: UserRow | undefined;
if (userArg) {
  user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(userArg) as UserRow | undefined;
  if (!user) {
    console.error(`User not found: ${userArg}`);
    process.exit(1);
  }
} else {
  user = db.prepare('SELECT id, email FROM users ORDER BY id LIMIT 1').get() as UserRow | undefined;
  if (!user) {
    console.error('No users in DB. Sign in to the dev app once first.');
    process.exit(1);
  }
}

console.log(`Seeding for ${user.email} (id=${user.id}) — year ${year}`);

if (clear) {
  // Hard delete: the sync layer treats deleted_at as soft-delete and would
  // still surface old samples on the client.
  const r = db.prepare(`DELETE FROM entries WHERE user_id = ? AND year = ?`).run(user.id, year);
  console.log(`Cleared ${r.changes} existing entries`);
} else if (!keep) {
  // Idempotent default: only delete entries in the seed's categories so
  // re-runs don't pile up duplicates. User's non-seed entries are preserved.
  const seedCategories = Array.from(new Set(samples.map(s => s.category)));
  const placeholders = seedCategories.map(() => '?').join(',');
  const r = db.prepare(
    `DELETE FROM entries WHERE user_id = ? AND year = ? AND category IN (${placeholders})`
  ).run(user.id, year, ...seedCategories);
  if (r.changes > 0) {
    console.log(`Cleared ${r.changes} previous seed entries (${seedCategories.join(', ')})`);
  }
}

const insert = db.prepare(`
  INSERT INTO entries
    (year, month, end_month, day_start, day_end, row_index,
     title, description, url, color, category, emoji,
     departure_time, arrival_time, user_id, is_private, is_tentative)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const tx = db.transaction(() => {
  for (const s of samples) {
    insert.run(
      year,
      s.month,
      s.end_month ?? s.month,
      s.day_start,
      s.day_end,
      s.row_index,
      s.title,
      s.description ?? '',
      '',
      s.color,
      s.category,
      s.emoji,
      '',
      '',
      user!.id,
      0,
      s.is_tentative ? 1 : 0,
    );
  }
});
tx();

console.log(`Inserted ${samples.length} sample entries`);
process.exit(0);
