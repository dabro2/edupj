import { usePdfStore } from '../store/usePdfStore';

const fontFamilies = ['Helvetica', 'Times New Roman', 'Arial', 'Courier New', 'Georgia', 'Verdana'];
const fontSizes = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

export function PropertyPanel() {
  const { selectedElementId, elements, updateElement, currentPage, rotatePage } = usePdfStore();
  const selectedElement = elements.find((el) => el.id === selectedElementId);
  if (!selectedElement) {
    return (
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4">
        <h3 className="text-white font-semibold mb-4">속성</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-2">페이지 회전</label>
            <div className="flex gap-2">
              <button onClick={() => rotatePage(currentPage, -90)} className="flex-1 px-3 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">↺ -90°</button>
              <button onClick={() => rotatePage(currentPage, 90)} className="flex-1 px-3 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">↻ +90°</button>
            </div>
          </div>
          <div className="text-gray-500 text-sm">요소를 선택하면 속성을 편집할 수 있습니다</div>
        </div>
      </div>
    );
  }
  if (selectedElement.type === 'text') {
    return (
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4">
        <h3 className="text-white font-semibold mb-4">텍스트 속성</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">폰트</label>
            <select value={selectedElement.fontFamily} onChange={(e) => updateElement(selectedElement.id, { fontFamily: e.target.value })} className="w-full bg-gray-700 text-white rounded px-3 py-2">
              {fontFamilies.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">크기</label>
            <select value={selectedElement.fontSize} onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })} className="w-full bg-gray-700 text-white rounded px-3 py-2">
              {fontSizes.map((size) => <option key={size} value={size}>{size}px</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">색상</label>
            <input type="color" value={selectedElement.fontColor} onChange={(e) => updateElement(selectedElement.id, { fontColor: e.target.value })} className="w-full h-10 bg-gray-700 rounded cursor-pointer" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateElement(selectedElement.id, { bold: !selectedElement.bold })} className={`flex-1 px-3 py-2 rounded font-bold ${selectedElement.bold ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>B</button>
            <button onClick={() => updateElement(selectedElement.id, { italic: !selectedElement.italic })} className={`flex-1 px-3 py-2 rounded italic ${selectedElement.italic ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>I</button>
          </div>
        </div>
      </div>
    );
  }
  if (selectedElement.type === 'image') {
    return (
      <div className="w-64 bg-gray-800 border-l border-gray-700 p-4">
        <h3 className="text-white font-semibold mb-4">이미지 속성</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">너비</label>
            <input type="number" value={Math.round(selectedElement.width)} onChange={(e) => { const newWidth = Number(e.target.value); const aspectRatio = selectedElement.originalWidth / selectedElement.originalHeight; updateElement(selectedElement.id, { width: newWidth, height: newWidth / aspectRatio }); }} className="w-full bg-gray-700 text-white rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">높이</label>
            <input type="number" value={Math.round(selectedElement.height)} onChange={(e) => { const newHeight = Number(e.target.value); const aspectRatio = selectedElement.originalWidth / selectedElement.originalHeight; updateElement(selectedElement.id, { width: newHeight * aspectRatio, height: newHeight }); }} className="w-full bg-gray-700 text-white rounded px-3 py-2" />
          </div>
          <div className="text-gray-500 text-sm">Shift 키를 누른 상태로 모서리를 드래그하면 크기를 조절할 수 있습니다</div>
        </div>
      </div>
    );
  }
  return null;
}
