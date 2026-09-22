# PDF 편집기 (pdfeditor)

브라우저에서 바로 쓰는 한글 PDF 편집기. PDF를 열어 **텍스트 라인을 더블클릭으로 수정**하고, 텍스트/이미지를 추가한 뒤 **페이지 순서·회전·삭제**까지 편집해 한글 폰트가 유지된 PDF로 다시 저장합니다.

> FileUpload → Canvas 렌더/추출 → 오버레이 편집 → Zustand 저장 → pdf-lib 내보내기

---

## ✨ 주요 기능

- **원문 라인 편집** — `pdfjs-dist`로 추출한 라인을 `OriginalTextOverlay`에 표시, 더블클릭 → `textarea` 수정. 수정된 라인은 노란 배경, 흰 박스로 원문 가리고 `NanumGothic`으로 재출력
- **새 요소 추가** — 캔버스 클릭으로 텍스트/이미지 추가, 드래그 이동, 이미지 Shift+드래그 리사이즈, `PropertyPanel`에서 폰트/크기/색상/회전 조정
- **페이지 관리** — `Sidebar`에서 `@dnd-kit` 드래그로 순서 변경, 썸네일 미리보기, 삭제/회전(+90°)
- **한글 완전 지원** — `public/NanumGothic-Regular.ttf`(2.05MB) 전체 임베드(`subset:false`)로 모든 뷰어에서 한글 깨짐 없음. `subset:true` CJK 누락 버그 회피
- **실행 취소/다시 실행** — `Ctrl+Z` / `Ctrl+Y`, 히스토리 스택 50개
- **확대/축소** — 25%~300%, `RENDER_SCALE=1.5`로 고해상도 렌더

## 🛠 기술 스택

| 분류 | 스택 | 비고 |
|---|---|---|
| 프레임워크 | React 19 + TypeScript 6 (strict) | Vite 8 + `@vitejs/plugin-react` (Oxc) |
| 스타일 | Tailwind CSS 4 | `@tailwindcss/vite`, `src/index.css` |
| 상태 | Zustand 5 | 단일 스토어 `src/store/usePdfStore.ts` |
| PDF 렌더/추출 | `pdfjs-dist@6` | `pdf.worker.min.mjs` |
| PDF 생성 | `pdf-lib@1.17` + `@pdf-lib/fontkit@1.1` | `registerFontkit` 필수 |
| DnD | `@dnd-kit/core, sortable, utilities` | 페이지 순서 변경 |
| 폰트 | NanumGothic-Regular | `public/` → `dist/` |
| 린트 | oxlint | `npm run lint` |

## 📁 프로젝트 구조

```
public/
  NanumGothic-Regular.ttf   # 한글 폰트 (필수, 삭제 금지)
  favicon.svg
src/
  main.tsx                  # createRoot(App)
  App.tsx                   # Toolbar + Sidebar + CanvasViewer + PropertyPanel 레이아웃
  index.css                 # Tailwind
  types/index.ts            # TextElement / ImageElement / OriginalTextItem / PageInfo
  store/usePdfStore.ts      # pdfBytes, pages, elements, originalTexts, undo/redo
  utils/
    pdfLoader.ts            # loadPdf, renderPageToCanvas, extractPageTexts
    exportPdf.ts            # loadFontBytes, getKoreanFont, exportPdf, downloadBlob
  components/
    FileUpload.tsx          # 드래그&드롭 / 파일 선택
    CanvasViewer.tsx        # <canvas> 렌더 + 좌표 변환 + 오버레이 배치
    OriginalTextOverlay.tsx # 더블클릭 편집
    TextElement.tsx / ImageElement.tsx
    Sidebar.tsx             # 썸네일 + Sortable
    Toolbar.tsx             # 도구/줌/내보내기 다이얼로그
    PropertyPanel.tsx       # 폰트/색상/회전
vite.config.ts
tsconfig.*.json
```

## 🚀 시작하기

### 요구 사항
- Node.js 20+ / npm 10+

### 설치 & 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm run preview  # 빌드 결과 미리보기
npm run lint     # oxlint
```

> `public/NanumGothic-Regular.ttf`는 빌드 시 `dist/`에 그대로 복사됩니다. 배포 시 `base`가 `/`가 아니면 `import.meta.env.BASE_URL`로 자동 처리됩니다.

## 🖱 사용법

1. **PDF 열기** — 시작 화면에 PDF 드래그&드롭 또는 `PDF 파일 선택`
2. **텍스트 수정** — 라인에 마우스 오버 후 **더블클릭** → 노란 `textarea`에서 수정 → `Enter` 저장, `Esc` 취소
3. **새 텍스트/이미지** — 상단 툴바에서 `텍스트`/`이미지` 선택 후 캔버스 클릭. 선택 후 `PropertyPanel`에서 스타일 변경
4. **페이지 편집** — 왼쪽 `Sidebar`에서 드래그로 순서 변경, `×`로 삭제, `PropertyPanel`의 회전 버튼 또는 캔버스 `회전` 도구로 90° 회전
5. **저장** — `PDF 내보내기` → 파일명 입력 → 다운로드. 수정된 라인은 흰 박스로 가려지고 `NanumGothic`으로 재출력됨

## 🧠 동작 원리 & 좌표계

- **추출** (`pdfLoader.extractPageTexts`): `viewport.transform`으로 PDF 좌표를 캔버스 좌표로 변환 `x=tx[4], y=tx[5]` (y는 상단 기준 baseline). Y 차이 `> fontSize*0.5`면 새 라인, X gap `> fontSize*0.15`면 공백 삽입
- **저장** (`exportPdf`): `PDFDocument.load`→`PDFDocument.create`→`copyPages` 순으로 복사, `originalTexts.filter(_changed)`에 대해 `height - y`로 PDF 좌표 변환 후 `drawRectangle(흰색)` + `drawText(검정)` . 새 요소는 `height - y - fontSize` (top 기준)
- **병합 보존** (`usePdfStore.setOriginalTexts`): `changedMap`으로 `_changed` 유지, 재추출 시 수정 내용 사라지지 않음. `reorderPages/deletePage` 시 `pageIndex` 재매핑 (`idToNewIndex`)

## ⚠️ 주의 사항

- **폰트** — `src/utils/exportPdf.ts:41`의 `subset:false`를 `true`로 바꾸지 마세요. 한글 글리프 누락 버그가 재발해 수정 내용이 빈칸으로 보입니다.
- **좌표 혼동 금지** — `OriginalTextItem.y`(baseline) vs `TextElement.y`(top)
- **폰트 URL** — `loadFontBytes`의 3중 시도(`BASE_URL`, `/`, 상대경로)와 캐시를 유지하세요.

## 🧪 검증

```bash
npm run build
# Node 재현 테스트 (선택)
npx tsx _test_e2e.ts   # textContent 포함 + isInFont 검사 (예시)
```

## 📝 라이선스

개인 프로젝트. 폰트 `NanumGothic`은 SIL OFL.

