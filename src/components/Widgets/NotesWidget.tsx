import React, { useState } from 'react';
import { FileText, X, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { memoryStorage } from '../../services/memoryStorage';

interface NotesWidgetProps {
  onClose: () => void;
  onNoteSavedToMemory?: (title: string, text: string) => void;
}

export const NotesWidget: React.FC<NotesWidgetProps> = ({ onClose, onNoteSavedToMemory }) => {
  const [noteText, setNoteText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    if (!noteText.trim()) return;
    const title = noteTitle.trim() || 'Nota Rápida de Viernes';
    memoryStorage.saveMemory({
      title,
      content: noteText.trim(),
      type: 'FACT',
      category: 'Notas',
      confidence: 1.0,
    });

    onNoteSavedToMemory?.(title, noteText.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setNoteText('');
      setNoteTitle('');
      setSavedSuccess(false);
    }, 1500);
  };

  return (
    <div className="fixed bottom-6 right-6 sm:right-24 z-50 w-80 rounded-xl bg-slate-950/95 border border-cyan-500/50 p-4 shadow-2xl shadow-cyan-950/80 backdrop-blur-lg animate-in fade-in">
      <div className="flex items-center justify-between pb-2 border-b border-cyan-900/40">
        <div className="flex items-center space-x-1.5 text-cyan-400 font-orbitron text-xs font-semibold">
          <FileText className="w-4 h-4 text-cyan-300" />
          <span>NOTAS TÁCTICAS</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="my-3 space-y-2">
        <input
          type="text"
          placeholder="Título de la nota..."
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          className="w-full px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
        />
        <textarea
          rows={4}
          placeholder="Escribe detalles o comandos para archivar en memoria..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 resize-none font-rajdhani"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-slate-400 font-rajdhani">
          {savedSuccess ? '¡Guardada en el núcleo!' : 'Se archiva en Memoria'}
        </span>
        <button
          onClick={handleSave}
          disabled={!noteText.trim()}
          className={`px-3 py-1.5 rounded-lg text-xs font-rajdhani font-semibold flex items-center space-x-1.5 transition-all ${
            savedSuccess
              ? 'bg-emerald-600 text-white'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50'
          }`}
        >
          {savedSuccess ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{savedSuccess ? 'Guardada' : 'Archivar'}</span>
        </button>
      </div>
    </div>
  );
};
