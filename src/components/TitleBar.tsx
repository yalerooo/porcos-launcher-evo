import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X } from 'lucide-react';

export default function TitleBar() {
  const appWindow = getCurrentWindow();

  const minimize = () => appWindow.minimize();
  const close = () => appWindow.close();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-text" data-tauri-drag-region>Porcos Launcher Evo</div>
      <div className="titlebar-buttons">
        <button className="titlebar-btn titlebar-minimize" onClick={minimize} title="Minimizar">
          <Minus />
        </button>
        <button className="titlebar-btn titlebar-close" onClick={close} title="Cerrar">
          <X />
        </button>
      </div>
    </div>
  );
}
