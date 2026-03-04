import { useRef, useState } from 'react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
}

const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx', '.csv'];

function isExcelFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export default function DropZone({ onFileSelected }: DropZoneProps): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (files: FileList | null): void => {
    const file = files?.[0];
    if (!file) {
      return;
    }

    if (!isExcelFile(file)) {
      alert('只支持 .xls / .xlsx / .csv 文件');
      return;
    }

    onFileSelected(file);
  };

  return (
    <section
      className={`drop-zone ${dragging ? 'dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <div className="drop-zone-content">
        <strong>拖拽数据文件到这里</strong>
        <span>支持 xls / xlsx / csv</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="button secondary"
        >
          选择文件
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".xls,.xlsx,.csv,text/csv"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </section>
  );
}
