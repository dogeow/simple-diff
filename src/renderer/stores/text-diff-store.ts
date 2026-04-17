import { create } from 'zustand'
import type { TextDiffResult } from '../../../shared/types'

interface TextDiffStore {
  readonly leftText: string
  readonly rightText: string
  readonly leftLabel: string
  readonly rightLabel: string
  readonly result: TextDiffResult | null
  readonly computing: boolean
  readonly error: string | null
  readonly charLevel: boolean

  setLeftText: (text: string, label?: string) => void
  setRightText: (text: string, label?: string) => void
  swap: () => void
  clear: () => void
  setResult: (result: TextDiffResult | null) => void
  setComputing: (computing: boolean) => void
  setError: (error: string | null) => void
  toggleCharLevel: () => void
}

export const useTextDiffStore = create<TextDiffStore>((set) => ({
  leftText: '',
  rightText: '',
  leftLabel: '',
  rightLabel: '',
  result: null,
  computing: false,
  error: null,
  charLevel: false,

  setLeftText: (text, label) =>
    set((state) => ({
      leftText: text,
      leftLabel: label ?? state.leftLabel,
      result: null,
    })),

  setRightText: (text, label) =>
    set((state) => ({
      rightText: text,
      rightLabel: label ?? state.rightLabel,
      result: null,
    })),

  swap: () =>
    set((state) => ({
      leftText: state.rightText,
      rightText: state.leftText,
      leftLabel: state.rightLabel,
      rightLabel: state.leftLabel,
      result: null,
    })),

  clear: () =>
    set({
      leftText: '',
      rightText: '',
      leftLabel: '',
      rightLabel: '',
      result: null,
      error: null,
    }),

  setResult: (result) => set({ result }),
  setComputing: (computing) => set({ computing }),
  setError: (error) => set({ error }),
  toggleCharLevel: () => set((state) => ({ charLevel: !state.charLevel })),
}))
