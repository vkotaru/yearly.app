import { useEffect } from 'react';
import { useHistory } from '../contexts/HistoryContext';

export function useUndoRedoKeyboard() {
  const { undo, redo, canUndo, canRedo } = useHistory();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          undo();
        }
        return;
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        if (canRedo) {
          e.preventDefault();
          redo();
        }
        return;
      }

      // Ctrl+Y or Cmd+Y for redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        if (canRedo) {
          e.preventDefault();
          redo();
        }
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);
}
