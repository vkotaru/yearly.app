import { useState, useEffect } from 'react';
import type { Entry, Todo } from '../../../../shared/types';
import { fetchTodos, createTodo, updateTodo, deleteTodo } from '../../api/entries';
import { getMonthName } from '../../utils/calendar';
import styles from './EntryDetailPanel.module.css';

interface Props {
  entry: Entry;
  onClose: () => void;
  onEdit: () => void;
}

export default function EntryDetailPanel({ entry, onClose, onEdit }: Props) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTodos(entry.id)
      .then(setTodos)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entry.id]);

  async function handleAddTodo() {
    if (!newTodo.trim()) return;
    const todo = await createTodo(entry.id, newTodo.trim());
    setTodos(prev => [...prev, todo]);
    setNewTodo('');
  }

  async function handleToggleTodo(todoId: number, completed: boolean) {
    const updated = await updateTodo(todoId, { completed });
    setTodos(prev => prev.map(t => t.id === todoId ? updated : t));
  }

  async function handleDeleteTodo(todoId: number) {
    await deleteTodo(todoId);
    setTodos(prev => prev.filter(t => t.id !== todoId));
  }

  const completedCount = todos.filter(t => t.completed).length;
  const dateLabel = entry.day_start === entry.day_end
    ? `${getMonthName(entry.month)} ${entry.day_start}`
    : `${getMonthName(entry.month)} ${entry.day_start} – ${entry.day_end}`;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          &times;
        </button>
        <div
          className={styles.colorBar}
          style={{ backgroundColor: entry.color }}
        />
        <div className={styles.titleSection}>
          <h3 className={styles.title}>
            {entry.emoji && <span className={styles.emoji}>{entry.emoji}</span>}
            {entry.title || 'Untitled'}
          </h3>
          <span className={styles.date}>{dateLabel}</span>
        </div>
        <button className={styles.editBtn} onClick={onEdit}>
          Edit
        </button>
      </div>

      {entry.description && (
        <p className={styles.description}>{entry.description}</p>
      )}

      {entry.category && (
        <div className={styles.category}>{entry.category}</div>
      )}

      {(entry.departure_time || entry.arrival_time) && (
        <div className={styles.travelSection}>
          {entry.departure_time && (
            <div className={styles.travelItem}>
              <span className={styles.travelIcon}>🛫</span>
              <span>{entry.departure_time}</span>
            </div>
          )}
          {entry.arrival_time && (
            <div className={styles.travelItem}>
              <span className={styles.travelIcon}>🛬</span>
              <span>{entry.arrival_time}</span>
            </div>
          )}
        </div>
      )}

      <div className={styles.todosSection}>
        <div className={styles.todosHeader}>
          <span className={styles.todosLabel}>Checklist</span>
          {todos.length > 0 && (
            <span className={styles.todosProgress}>
              {completedCount}/{todos.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : (
          <>
            <div className={styles.todosList}>
              {todos.map(t => (
                <div key={t.id} className={styles.todoItem}>
                  <input
                    type="checkbox"
                    className={styles.todoCheckbox}
                    checked={t.completed}
                    onChange={e => handleToggleTodo(t.id, e.target.checked)}
                  />
                  <span className={`${styles.todoText} ${t.completed ? styles.completed : ''}`}>
                    {t.text}
                  </span>
                  <button
                    className={styles.todoDeleteBtn}
                    onClick={() => handleDeleteTodo(t.id)}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.addTodoRow}>
              <input
                type="text"
                className={styles.addTodoInput}
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                placeholder="Add item..."
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddTodo();
                }}
              />
              <button className={styles.addTodoBtn} onClick={handleAddTodo}>
                +
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
