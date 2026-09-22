import { create } from 'zustand';
import type { PdfElement, ToolType, PageInfo, OriginalTextItem } from '../types';

interface HistoryState {
  elements: PdfElement[];
  originalTexts: OriginalTextItem[];
  pages: PageInfo[];
}

interface PdfStore {
  pdfBytes: Uint8Array | null;
  pdfName: string | null;
  pages: PageInfo[];
  currentPage: number;
  selectedTool: ToolType;
  selectedElementId: string | null;
  elements: PdfElement[];
  originalTexts: OriginalTextItem[];
  zoom: number;
  undoStack: HistoryState[];
  redoStack: HistoryState[];

  setPdf: (bytes: Uint8Array, name: string, pages: PageInfo[]) => void;
  setCurrentPage: (page: number) => void;
  setTool: (tool: ToolType) => void;
  selectElement: (id: string | null) => void;
  addElement: (element: PdfElement) => void;
  updateElement: (id: string, updates: Partial<PdfElement>) => void;
  deleteElement: (id: string) => void;
  setOriginalTexts: (texts: OriginalTextItem[]) => void;
  updateOriginalText: (id: string, content: string) => void;
  setZoom: (zoom: number) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;
  deletePage: (pageIndex: number) => void;
  addPage: (index: number, pageInfo: PageInfo) => void;
  rotatePage: (pageIndex: number, degrees: number) => void;
  updatePageThumbnail: (pageIndex: number, thumbnail: string) => void;
  undo: () => void;
  redo: () => void;
}

function getCurrentState(state: PdfStore): HistoryState {
  return {
    elements: [...state.elements],
    originalTexts: state.originalTexts.map((t) => ({ ...t })),
    pages: [...state.pages],
  };
}

function pushHistory(state: PdfStore): { undoStack: HistoryState[]; redoStack: HistoryState[] } {
  const snapshot = getCurrentState(state);
  return {
    undoStack: [...state.undoStack, snapshot].slice(-50),
    redoStack: [],
  };
}

export const usePdfStore = create<PdfStore>((set) => ({
  pdfBytes: null,
  pdfName: null,
  pages: [],
  currentPage: 0,
  selectedTool: 'select',
  selectedElementId: null,
  elements: [],
  originalTexts: [],
  zoom: 1,
  undoStack: [],
  redoStack: [],

  setPdf: (bytes, name, pages) => set({
    pdfBytes: bytes,
    pdfName: name,
    pages,
    currentPage: 0,
    elements: [],
    originalTexts: [],
    selectedElementId: null,
    zoom: 1,
    undoStack: [],
    redoStack: [],
  }),

  setCurrentPage: (page) => set({ currentPage: page }),

  setTool: (tool) => set({ selectedTool: tool, selectedElementId: null }),

  selectElement: (id) => set({ selectedElementId: id }),

  addElement: (element) => set((state) => ({
    elements: [...state.elements, element],
    ...pushHistory(state),
  })),

  updateElement: (id, updates) => set((state) => ({
    elements: state.elements.map((el) =>
      el.id === id ? { ...el, ...updates } as PdfElement : el
    ),
    ...pushHistory(state),
  })),

  deleteElement: (id) => set((state) => ({
    elements: state.elements.filter((el) => el.id !== id),
    selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
    ...pushHistory(state),
  })),

  setOriginalTexts: (texts) => set((state) => {
    if (texts.length === 0) {
      console.log('[스토어] setOriginalTexts: 빈 배열, 기존 값 유지');
      return { originalTexts: state.originalTexts };
    }
    const targetPage = texts[0].pageIndex;
    const changedMap = new Map(
      state.originalTexts.filter((t) => t._changed).map((t) => [t.id, t])
    );
    const mergedCurrent = texts.map((t) => {
      const changed = changedMap.get(t.id);
      if (changed) {
        console.log('[스토어] ✅ 수정된 텍스트 보존:', { id: t.id, 내용: changed.content });
        return { ...t, content: changed.content, _changed: true as const };
      }
      return t;
    });
    const otherChanged = state.originalTexts.filter(
      (t) => t._changed && t.pageIndex !== targetPage && !mergedCurrent.some((m) => m.id === t.id)
    );
    const otherPages = state.originalTexts.filter(
      (t) => t.pageIndex !== targetPage && !t._changed
    );
    console.log('[스토어] setOriginalTexts:', {
      대상페이지: targetPage,
      새로추출: texts.length,
      보존됨: mergedCurrent.filter(t => t._changed).length,
      다른페이지변경: otherChanged.length,
      최종총수: otherPages.length + otherChanged.length + mergedCurrent.length,
    });
    return { originalTexts: [...otherPages, ...otherChanged, ...mergedCurrent] };
  }),

  updateOriginalText: (id, content) => set((state) => {
    const old = state.originalTexts.find(t => t.id === id);
    console.log('[스토어] updateOriginalText:', {
      id,
      원본: old ? `"${old.content}"` : '없음',
      수정後: `"${content}"`,
    });
    return {
      originalTexts: state.originalTexts.map((t) =>
        t.id === id ? { ...t, content, _changed: true } : t
      ),
      ...pushHistory(state),
    };
  }),

  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(3, zoom)) }),

  reorderPages: (fromIndex, toIndex) => set((state) => {
    const oldPages = state.pages;
    const newPages = [...oldPages];
    const [moved] = newPages.splice(fromIndex, 1);
    newPages.splice(toIndex, 0, moved);
    const idToNewIndex = new Map(newPages.map((p, i) => [p.id, i]));
    const newElements = state.elements.map((el) => {
      const oldPageId = oldPages[el.pageIndex]?.id;
      const newIdx = oldPageId ? idToNewIndex.get(oldPageId) : undefined;
      return newIdx !== undefined ? { ...el, pageIndex: newIdx } : el;
    });
    const newOriginalTexts = state.originalTexts.map((t) => {
      const oldPageId = oldPages[t.pageIndex]?.id;
      const newIdx = oldPageId ? idToNewIndex.get(oldPageId) : undefined;
      return newIdx !== undefined ? { ...t, pageIndex: newIdx } : t;
    });
    let newCurrentPage = state.currentPage;
    if (state.currentPage === fromIndex) {
      newCurrentPage = toIndex;
    } else if (fromIndex < state.currentPage && state.currentPage <= toIndex) {
      newCurrentPage = state.currentPage - 1;
    } else if (toIndex <= state.currentPage && state.currentPage < fromIndex) {
      newCurrentPage = state.currentPage + 1;
    }
    return { pages: newPages, elements: newElements, originalTexts: newOriginalTexts, currentPage: newCurrentPage, ...pushHistory(state) };
  }),

  deletePage: (pageIndex) => set((state) => {
    if (state.pages.length <= 1) return state;
    const newPages = state.pages.filter((_, i) => i !== pageIndex);
    const newElements = state.elements.filter((el) => el.pageIndex !== pageIndex)
      .map((el) => el.pageIndex > pageIndex ? { ...el, pageIndex: el.pageIndex - 1 } : el);
    const newOriginalTexts = state.originalTexts.filter((t) => t.pageIndex !== pageIndex)
      .map((t) => t.pageIndex > pageIndex ? { ...t, pageIndex: t.pageIndex - 1 } : t);
    const newCurrentPage = Math.min(state.currentPage, newPages.length - 1);
    return {
      pages: newPages,
      elements: newElements,
      originalTexts: newOriginalTexts,
      currentPage: newCurrentPage,
      ...pushHistory(state),
    };
  }),

  addPage: (index, pageInfo) => set((state) => {
    const newPages = [...state.pages];
    newPages.splice(index, 0, pageInfo);
    const newElements = state.elements.map((el) => el.pageIndex >= index ? { ...el, pageIndex: el.pageIndex + 1 } : el);
    const newOriginalTexts = state.originalTexts.map((t) => t.pageIndex >= index ? { ...t, pageIndex: t.pageIndex + 1 } : t);
    return { pages: newPages, elements: newElements, originalTexts: newOriginalTexts, ...pushHistory(state) };
  }),

  rotatePage: (pageIndex, degrees) => set((state) => ({
    pages: state.pages.map((page, i) =>
      i === pageIndex
        ? { ...page, rotation: (page.rotation + degrees) % 360 }
        : page
    ),
    ...pushHistory(state),
  })),

  updatePageThumbnail: (pageIndex, thumbnail) => set((state) => ({
    pages: state.pages.map((page, i) =>
      i === pageIndex ? { ...page, thumbnail } : page
    ),
  })),

  undo: () => set((state) => {
    if (state.undoStack.length === 0) return state;
    const current = getCurrentState(state);
    const prev = state.undoStack[state.undoStack.length - 1];
    return {
      elements: prev.elements,
      originalTexts: prev.originalTexts,
      pages: prev.pages,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, current],
    };
  }),

  redo: () => set((state) => {
    if (state.redoStack.length === 0) return state;
    const current = getCurrentState(state);
    const next = state.redoStack[state.redoStack.length - 1];
    return {
      elements: next.elements,
      originalTexts: next.originalTexts,
      pages: next.pages,
      undoStack: [...state.undoStack, current],
      redoStack: state.redoStack.slice(0, -1),
    };
  }),
}));
