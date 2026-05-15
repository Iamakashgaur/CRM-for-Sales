import { create } from "zustand"

export interface ActiveFilters {
  ownerId?: string
  stage?: string
  minValue?: number
  maxValue?: number
  dateRange?: { from: Date; to: Date }
}

interface CRMStore {
  commandPaletteOpen: boolean
  selectedDealIds: string[]
  sidebarCollapsed: boolean
  activeFilters: ActiveFilters

  setCommandPaletteOpen: (open: boolean) => void
  toggleDealSelection: (id: string) => void
  clearDealSelection: () => void
  toggleSidebar: () => void
  setFilter: <K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) => void
  clearFilters: () => void
}

export const useCRMStore = create<CRMStore>((set) => ({
  commandPaletteOpen: false,
  selectedDealIds: [],
  sidebarCollapsed: false,
  activeFilters: {},

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleDealSelection: (id) =>
    set((state) => ({
      selectedDealIds: state.selectedDealIds.includes(id)
        ? state.selectedDealIds.filter((x) => x !== id)
        : [...state.selectedDealIds, id],
    })),
  clearDealSelection: () => set({ selectedDealIds: [] }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setFilter: (key, value) =>
    set((state) => ({ activeFilters: { ...state.activeFilters, [key]: value } })),
  clearFilters: () => set({ activeFilters: {} }),
}))
