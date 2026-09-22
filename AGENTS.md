# AGENTS.md — pdfeditor 에이전트 가이드

이 문서는 AI 에이전트 / 기여자가 `pdfeditor` 프로젝트를 빠르게 이해하고 수정할 수 있도록 정리한 기술 명세입니다.

## 1. 프로젝트 개요

브라우저에서 동작하는 PDF 편집기. PDF를 열어 텍스트 라인을 더블클릭으로 수정하고, 텍스트/이미지 요소를 추가하며, 페이지 순서 변경/회전/삭제 후 한글 폰트가 유지된 PDF로 다시 저장한다.

- **핵심 플로우**: `FileUpload` → `pdfjs-dist`로 렌더/추출 → `CanvasViewer` 오버레이 편집 → `zustand` 저장 → `pdf-lib`로 원본 페이지 복사 + 흰 박스로 원문 가리기 + 새 텍스트/이미지 그리기 → `Blob` 다운로드
- **한글 처리**: `public/NanumGothic-Regular.ttf` (2.05MB)를 `fetch`로 로드해 `pdf-lib`에 전체 임베드(`subset:false`). `subset:true`는 CJK 글리프 누락 버그가 있어 사용하지 않음 (`src/utils/exportPdf.ts:41`)

## 2. Tech Stack

| 영역 | 스택 | 버전 / 비고 |
|---|---|---|
| 프레임워크 | React 19 + TypeScript 6 | `strict` |
| 빌드 | Vite 8 + `@vitejs/plugin-react` (Oxc) | `tsc -b && vite build` |
| 스타일 | Tailwind CSS 4 (`@tailwindcss/vite`) | `src/index.css` |
| 상태 | Zustand 5 | `src/store/usePdfStore.ts` 단일 스토어 |
| PDF 렌더/추출 | `pdfjs-dist@6` | `pdfLoader.ts`, worker `pdf.worker.min.mjs` |
| PDF 생성/편집 | `pdf-lib@1.17` + `@pdf-lib/fontkit@1.1` | `exportPdf.ts`, `registerFontkit` 필요 |
| DnD | `@dnd-kit/core, sortable, utilities` | `Sidebar` 페이지 순서 변경 |
| 폰트 | NanumGothic-Regular.ttf | `public/` → `dist/` 정적 자원, 전체 임베드 |
| 린트 | oxlint | `npm run lint` |
| 런타임 보정 | `dommatrix`, `jsdom` | Node 테스트에서 pdfjs `DOMMatrix` 필요시 |

## 3. 프로젝트 구조

```
pdfeditor/
├── public/
│   ├── NanumGothic-Regular.ttf  # 한글 폰트 (필수)
│   └── favicon.svg
├── src/
│   ├── main.tsx                 # ReactDOM.createRoot(App)
│   ├── App.tsx                  # 레이아웃: Toolbar + Sidebar + CanvasViewer + PropertyPanel
│   ├── index.css                # Tailwind 진입
│   ├── types/index.ts           # TextElement, ImageElement, PdfElement, OriginalTextItem, PageInfo, ToolType
│   ├── store/usePdfStore.ts     # Zustand 스토어 (pdfBytes, pages, elements, originalTexts, undo/redo)
│   ├── utils/
│   │   ├── pdfLoader.ts         # loadPdf, renderPageToCanvas, extractPageTexts, getPageDimensions
│   │   └── exportPdf.ts         # loadFontBytes, getKoreanFont, exportPdf, downloadBlob
│   └── components/
│       ├── FileUpload.tsx       # 드래그&드롭 / 파일 선택 → loadPdf → PageInfo 생성
│       ├── CanvasViewer.tsx     # <canvas> 렌더 + getPageCoords + OriginalTextOverlay/TextElement/ImageElement 배치
│       ├── OriginalTextOverlay.tsx # 원문 라인 오버레이, 더블클릭 textarea 편집 → updateOriginalText
│       ├── TextElement.tsx      # 신규 텍스트 요소, 드래그/편집
│       ├── ImageElement.tsx     # 이미지 요소, 리사이즈
│       ├── Sidebar.tsx          # 썸네일, @dnd-kit Sortable, deletePage, rotatePage
│       ├── Toolbar.tsx          # 도구 선택, zoom, undo/redo, PDF 내보내기 다이얼로그
│       └── PropertyPanel.tsx    # 선택 요소 폰트/색상/회전
├── index.html
├── vite.config.ts               # react(), tailwindcss()
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── package.json
└── dist/                        # 빌드 산출물 (assets/pdf.worker.min.mjs, NanumGothic 복사됨)
```

## 4. 핵심 파일 상세

### `src/types/index.ts`
- `ToolType: 'select'|'text'|'image'|'rotate'`
- `TextElement`: `pageIndex, x, y, content, fontFamily, fontSize, fontColor, bold, italic` — `x,y`는 **PDF 포인트**(상단 기준 거리, `CanvasViewer.getPageCoords`에서 `client / (zoom*RENDER_SCALE)` 로 변환)
- `OriginalTextItem`: `pageIndex, x, y, width, height, content, fontSize, _changed?` — `x,y`는 **baseline의 상단 거리**(`pdfLoader.extractPageTexts`에서 `viewport.transform`으로 계산, `y = tx[5]`)
- `PageInfo`: `width,height,rotation,thumbnail,originalIndex,isNewPage`

### `src/store/usePdfStore.ts`
- `setPdf(bytes,name,pages)` — 전체 리셋
- `setOriginalTexts(texts)` — **병합 로직**이 핵심: 빈 배열이면 유지, `changedMap`으로 `_changed` 보존, `targetPage` 기준으로 다른 페이지 변경/미변경 분리 병합. 페이지 이동 후 재추출 시 수정 내용 사라지지 않도록 함.
- `updateOriginalText(id,content)` — `_changed:true` + `pushHistory`
- `reorderPages/deletePage/addPage/rotatePage` — `pageIndex` 재매핑 (`idToNewIndex` 사용)
- `undo/redo` — `HistoryState {elements, originalTexts, pages}` 스택 50개

### `src/utils/pdfLoader.ts`
- `pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`
- `loadPdf(data)` — `useSystemFonts:true`, `useWorkerFetch:false`
- `extractPageTexts(pdf, pageNumber)` — `textContent.items`를 `viewport.transform`으로 캔버스 좌표 `x=tx[4], y=tx[5]` 변환, Y차 `> fontSize*0.5` 이면 새 라인, X gap `> fontSize*0.15` 이면 공백 삽입. `id = orig-${pageNumber}-${items.length}`
- `renderPageToCanvas` / `renderPageThumbnail` / `getPageDimensions` — `scale=1` viewport 기준

### `src/utils/exportPdf.ts`
- `containsKorean` — `[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]`
- `loadFontBytes()` — `import.meta.env.BASE_URL` + 3개 URL 시도, 100KB 미만이면 오류, 메모리 캐시 `cachedFontBytes`
- `getKoreanFont(pdfDoc)` — `registerFontkit(fontkit)` + `embedFont(bytes, {subset:false})` — **전체 임베드 필수** (서브셋 버그 회피)
- `exportPdf(originalBytes, pages, elements, originalTexts)` — `PDFDocument.load` → `PDFDocument.create` → `copyPages` 순서대로 복사 → `changedTexts.filter(t=>t._changed)` 에 대해 `drawRectangle(흰색)` + `drawText`(검정, `NanumGothic`) → `elements` (`text`/`image`) 그리기 → `save()`. 좌표 변환은 `height - y` (baseline), 요소 텍스트는 `height - y - fontSize` (top 기준)
- `downloadBlob` — `Blob` + `URL.createObjectURL` + `<a>.click()`

### `src/components/CanvasViewer.tsx`
- `RENDER_SCALE=1.5`, `displayScale=zoom*RENDER_SCALE`
- 두 `useEffect`: (1) `renderPageToCanvas` (pdfBytes/currentPage/zoom), (2) `extractPageTexts` → `setOriginalTexts(mapped)` (`pageIndex: currentPage`로 재매핑)
- `getPageCoords(e)` — `canvas.getBoundingClientRect()` / `displayScale`
- `handleMouseDown` — `text`/`image`/`rotate` 분기

### `src/components/OriginalTextOverlay.tsx`
- `left: x*zoom`, `top: (y-height)*zoom` (baseline → top 변환), `fontSize*zoom`, `transparent` ↔ `bg-yellow-100` (`_changed` 시), 더블클릭 `textarea`

## 5. 상태/데이터 흐름

```
FileUpload --setPdf(bytes,pages)--> usePdfStore
CanvasViewer --extractPageTexts--> setOriginalTexts (병합)
OriginalTextOverlay --updateOriginalText--> originalTexts[_changed]
Toolbar --exportPdf(pdfBytes,pages,elements,originalTexts)--> downloadBlob
Sidebar --reorderPages/deletePage/rotatePage--> pages/elements/originalTexts pageIndex 재매핑
```

## 6. 빌드 / 실행 / 린트

```bash
npm install
npm run dev      # Vite HMR, http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm run preview  # dist 미리보기
npm run lint     # oxlint
```

- `public/NanumGothic-Regular.ttf`는 `dist/`에 그대로 복사되어야 한글 저장 가능. `vite.config.ts` 기본 `base:'/'` 유지. 서브 경로 배포 시 `BASE_URL` 자동 처리됨.
- Node 테스트에서 `pdfjs-dist/legacy/build/pdf.mjs` + `fetch` shim + `DOMMatrix` 필요 (`dommatrix`, `jsdom`).

## 7. 에이전트 작업 규칙

- **수정 시 확인**: `exportPdf.ts`의 `subset:false`를 `true`로 되돌리지 말 것. 한글 깨짐/사라짐 버그 재발.
- **좌표계**: `OriginalTextItem.y`는 상단 기준 baseline 거리, `TextElement.y`는 상단 기준 top 거리. 혼동 금지.
- **store 병합**: `setOriginalTexts`의 `changedMap` 로직을 단순 `set`으로 교체하지 말 것. 페이지 이동 시 수정 사라짐.
- **폰트 로드**: `loadFontBytes`의 3중 URL 시도와 캐시를 유지. `public/` 폰트 삭제 금지.
- **파일 생성**: 새 파일보다 기존 파일 `edit` 우선. `*.md`는 요청 시에만 생성.
- **검증**: 기능 구현/버그 수정 후 `npm run build` 로 타입/빌드 검증. 가능하면 `npx tsx _test_e2e.ts` 형태의 Node 재현 테스트로 `textContent` 포함 및 `isInFont` 검사.

## 8. 알려진 이슈 / TODO

- `exportPdf`는 원본 텍스트를 흰 박스로 덮는 방식이라 텍스트 스트림에 원문이 남음. 재오픈 시 같은 Y에 두 텍스트가 겹쳐 `extractPageTexts`가 5개 라인으로 보일 수 있음. 완전 제거는 콘텐츠 스트림 파싱 필요.
- `subset:false`로 파일 크기가 2MB 이상 증가. 추후 `fontkit` 서브셋 버그가 해결되면 선택적 서브셋 재도입 검토.
- `pdfLoader.loadPdf`에 `cMapUrl/cMapPacked` 미설정. CID 기반 한글 PDF에서 추출 오류 가능성.

## 9. 참고 경로

- `src/utils/exportPdf.ts:1` 폰트/내보내기 전체
- `src/utils/pdfLoader.ts:61` 텍스트 추출 휴리스틱
- `src/store/usePdfStore.ts:108` 병합/히스토리
- `src/components/CanvasViewer.tsx:18` 이중 useEffect
- `src/components/OriginalTextOverlay.tsx:62` 오버레이 배치
