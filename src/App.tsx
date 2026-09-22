import { useEffect } from 'react';
import { usePdfStore } from './store/usePdfStore';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { CanvasViewer } from './components/CanvasViewer';
import { PropertyPanel } from './components/PropertyPanel';
import { FileUpload } from './components/FileUpload';

function App() {
  const { pdfBytes, undo, redo } = usePdfStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {pdfBytes && <Toolbar />}
      
      <div className="flex flex-1 overflow-hidden">
        {pdfBytes && <Sidebar />}
        
        {pdfBytes ? <CanvasViewer /> : <FileUpload />}
        
        {pdfBytes && <PropertyPanel />}
      </div>
    </div>
  );
}

export default App;
