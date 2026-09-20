import { create } from "zustand";
import type { PlannerRunResult } from "../domain/planner";

interface PlannerState {
  result: PlannerRunResult | null;
  selectedIndex: number;
  running: boolean;
  error: string;
  setRunning: (running: boolean) => void;
  setError: (error: string) => void;
  setResult: (result: PlannerRunResult) => void;
  selectCandidate: (index: number) => void;
  reset: () => void;
}

const initial = {
  result: null as PlannerRunResult | null,
  selectedIndex: 0,
  running: false,
  error: "",
};

export const usePlannerStore = create<PlannerState>((set) => ({
  ...initial,
  setRunning: (running) => set({ running }),
  setError: (error) => set({ error }),
  setResult: (result) =>
    set({ result, selectedIndex: 0, running: false, error: "" }),
  selectCandidate: (selectedIndex) => set({ selectedIndex }),
  reset: () => set(initial),
}));
