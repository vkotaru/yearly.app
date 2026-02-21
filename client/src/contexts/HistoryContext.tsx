import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { Entry } from '../../../shared/types';
import type { HistoryAction, HistoryState } from '../types/history';
import { getActionDescription } from '../types/history';

const MAX_HISTORY_SIZE = 50;

export type UndoExecutor = (action: HistoryAction) => Promise<void>;
export type RedoExecutor = (action: HistoryAction) => Promise<void>;

interface HistoryContextValue {
  canUndo: boolean;
  canRedo: boolean;
  recordAction: (action: HistoryAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  registerExecutors: (onUndo: UndoExecutor, onRedo: RedoExecutor) => void;
  lastToastMessage: string | null;
  clearToast: () => void;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HistoryState>({
    past: [],
    future: [],
  });
  const [lastToastMessage, setLastToastMessage] = useState<string | null>(null);
  const undoExecutorRef = useRef<UndoExecutor | null>(null);
  const redoExecutorRef = useRef<RedoExecutor | null>(null);

  const registerExecutors = useCallback((onUndo: UndoExecutor, onRedo: RedoExecutor) => {
    undoExecutorRef.current = onUndo;
    redoExecutorRef.current = onRedo;
  }, []);

  const recordAction = useCallback((action: HistoryAction) => {
    setState(prev => ({
      past: [...prev.past.slice(-MAX_HISTORY_SIZE + 1), action],
      future: [], // Clear future on new action
    }));
  }, []);

  const undo = useCallback(async (): Promise<void> => {
    let actionToUndo: HistoryAction | null = null;

    setState(prev => {
      if (prev.past.length === 0) return prev;

      const newPast = [...prev.past];
      actionToUndo = newPast.pop()!;

      return {
        past: newPast,
        future: [actionToUndo, ...prev.future],
      };
    });

    if (actionToUndo && undoExecutorRef.current) {
      await undoExecutorRef.current(actionToUndo);
      setLastToastMessage(`Undone: ${getActionDescription(actionToUndo)}`);
    }
  }, []);

  const redo = useCallback(async (): Promise<void> => {
    let actionToRedo: HistoryAction | null = null;

    setState(prev => {
      if (prev.future.length === 0) return prev;

      const newFuture = [...prev.future];
      actionToRedo = newFuture.shift()!;

      return {
        past: [...prev.past, actionToRedo],
        future: newFuture,
      };
    });

    if (actionToRedo && redoExecutorRef.current) {
      await redoExecutorRef.current(actionToRedo);
      setLastToastMessage(`Redone: ${getActionDescription(actionToRedo)}`);
    }
  }, []);

  const clearToast = useCallback(() => {
    setLastToastMessage(null);
  }, []);

  return (
    <HistoryContext.Provider
      value={{
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
        recordAction,
        undo,
        redo,
        registerExecutors,
        lastToastMessage,
        clearToast,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return ctx;
}
