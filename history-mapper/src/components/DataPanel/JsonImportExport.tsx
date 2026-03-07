import type { AppState, Action } from '../../types';
import React, { useRef } from 'react';

interface Props {
  state: AppState;
  dispatch: React.Dispatch<Action>;
}

export function JsonImportExport({ state, dispatch }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'history-mapper-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as AppState;
        if (parsed.spans && Array.isArray(parsed.spans)) {
          dispatch({ type: 'LOAD_STATE', state: parsed });
        } else {
          alert('Invalid file format: missing spans array');
        }
      } catch {
        alert('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="json-io">
      <button onClick={handleExport}>Export JSON</button>
      <button onClick={handleImport}>Import JSON</button>
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
    </div>
  );
}
