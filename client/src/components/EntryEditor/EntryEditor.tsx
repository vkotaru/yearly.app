import { useState, useEffect, useRef } from 'react';
import type { Entry, Comment, CreateEntryDto, UpdateEntryDto } from '../../../../shared/types';
import { fetchComments, createComment, deleteComment } from '../../api/entries';
import { getDaysInMonth, getMonthName } from '../../utils/calendar';
import styles from './EntryEditor.module.css';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4',
];

interface Props {
  year: number;
  month: number;
  dayStart: number;
  dayEnd: number;
  rowIndex: number;
  existingEntry?: Entry;
  onSave: (dto: CreateEntryDto | { id: number } & UpdateEntryDto) => void;
  onDelete?: (id: number) => void;
  onClose: () => void;
}

export default function EntryEditor({
  year, month, dayStart, dayEnd, rowIndex, existingEntry, onSave, onDelete, onClose,
}: Props) {
  const maxDay = getDaysInMonth(year, month);
  const [title, setTitle] = useState(existingEntry?.title ?? '');
  const [description, setDescription] = useState(existingEntry?.description ?? '');
  const [url, setUrl] = useState(existingEntry?.url ?? '');
  const [category, setCategory] = useState(existingEntry?.category ?? '');
  const [color, setColor] = useState(existingEntry?.color ?? '#3b82f6');
  const [hexInput, setHexInput] = useState(existingEntry?.color ?? '#3b82f6');
  const [dStart, setDStart] = useState(existingEntry?.day_start ?? dayStart);
  const [dEnd, setDEnd] = useState(existingEntry?.day_end ?? dayEnd);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [isPrivate, setIsPrivate] = useState(existingEntry?.is_private ?? false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (existingEntry) {
      setLoadingComments(true);
      fetchComments(existingEntry.id)
        .then(setComments)
        .catch(console.error)
        .finally(() => setLoadingComments(false));
    }
  }, [existingEntry]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  function selectColor(c: string) {
    setColor(c);
    setHexInput(c);
  }

  function handleHexChange(value: string) {
    setHexInput(value);
    // Accept 3 or 6 digit hex (with or without #)
    const cleaned = value.startsWith('#') ? value : `#${value}`;
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(cleaned)) {
      setColor(cleaned);
    }
  }

  function handleSave() {
    const start = Math.min(dStart, dEnd);
    const end = Math.max(dStart, dEnd);
    if (existingEntry) {
      onSave({
        id: existingEntry.id,
        title,
        description,
        url,
        category,
        color,
        day_start: start,
        day_end: end,
        is_private: isPrivate,
      });
    } else {
      onSave({
        year,
        month,
        day_start: start,
        day_end: end,
        row_index: rowIndex,
        title,
        description,
        url,
        category,
        color,
        is_private: isPrivate,
      });
    }
  }

  async function handleAddComment() {
    if (!newComment.trim() || !existingEntry) return;
    const comment = await createComment(existingEntry.id, newComment.trim());
    setComments(prev => [...prev, comment]);
    setNewComment('');
  }

  async function handleDeleteComment(commentId: number) {
    await deleteComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  }

  const spanLabel = dStart === dEnd
    ? `${getMonthName(month)} ${dStart}`
    : `${getMonthName(month)} ${dStart} – ${dEnd}`;

  return (
    <div className={styles.overlay}>
      <div className={styles.editor} ref={dialogRef} onKeyDown={handleKeyDown}>
        <div className={styles.titleRow}>
          <h3>{existingEntry ? 'Edit Entry' : 'New Entry'}</h3>
          <span className={styles.spanLabel}>{spanLabel}</span>
        </div>

        <input
          ref={inputRef}
          type="text"
          className={styles.textInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)..."
        />

        <textarea
          className={styles.descInput}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)..."
          rows={2}
        />

        <div className={styles.fieldRow}>
          <input
            type="text"
            className={styles.textInput}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="URL (optional)..."
          />
          <input
            type="text"
            className={styles.textInput}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)..."
          />
        </div>

        <div className={styles.rangeRow}>
          <label className={styles.field}>
            <span>From</span>
            <input
              type="number"
              min={1}
              max={maxDay}
              value={dStart}
              onChange={(e) => setDStart(Math.min(Number(e.target.value), maxDay))}
            />
          </label>
          <label className={styles.field}>
            <span>To</span>
            <input
              type="number"
              min={1}
              max={maxDay}
              value={dEnd}
              onChange={(e) => setDEnd(Math.min(Number(e.target.value), maxDay))}
            />
          </label>
        </div>

        <div className={styles.colorSection}>
          <span className={styles.colorLabel}>Color</span>
          <div className={styles.colorRow}>
            <div className={styles.colorGrid}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={`${styles.colorSwatch} ${c === color ? styles.selected : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => selectColor(c)}
                />
              ))}
            </div>
            <div className={styles.customColorRow}>
              <input
                type="color"
                value={color}
                onChange={(e) => selectColor(e.target.value)}
                className={styles.nativePicker}
                title="Pick custom color"
              />
              <div className={styles.hexInputWrap}>
                <div
                  className={styles.hexPreview}
                  style={{ backgroundColor: color }}
                />
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => handleHexChange(e.target.value)}
                  className={styles.hexInput}
                  placeholder="#3b82f6"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.privacySection}>
          <label className={styles.privacyToggle}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <span>Private (only visible to you)</span>
          </label>
        </div>

        {existingEntry && (
          <div className={styles.commentsSection}>
            <span className={styles.commentsLabel}>Comments</span>
            {loadingComments ? (
              <div className={styles.commentsLoading}>Loading...</div>
            ) : (
              <>
                <div className={styles.commentsList}>
                  {comments.map(c => (
                    <div key={c.id} className={styles.commentItem}>
                      <div className={styles.commentBody}>
                        <span className={styles.commentText}>{c.text}</span>
                        <span className={styles.commentMeta}>
                          {c.author && `${c.author} · `}
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <button
                        className={styles.commentDeleteBtn}
                        onClick={() => handleDeleteComment(c.id)}
                        title="Delete comment"
                      >&times;</button>
                    </div>
                  ))}
                </div>
                <div className={styles.commentInputRow}>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        handleAddComment();
                      }
                    }}
                  />
                  <button className={styles.commentAddBtn} onClick={handleAddComment}>Add</button>
                </div>
              </>
            )}
          </div>
        )}

        <div className={styles.actions}>
          {existingEntry && onDelete && (
            <button className={styles.deleteBtn} onClick={() => onDelete(existingEntry.id)}>
              Delete
            </button>
          )}
          <div className={styles.rightActions}>
            <button onClick={onClose} className={styles.cancelBtn}>Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
