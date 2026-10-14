import React, { useState } from 'react';
import { 
  Brain, 
  Search, 
  Plus, 
  Trash2, 
  Sparkles, 
  Tag, 
  Download, 
  Upload, 
  CheckCircle2, 
  Filter,
  Flame,
  Award,
  Layers,
  Clock
} from 'lucide-react';
import { MemoryItem, MemoryType, OrbThemeColor } from '../types/assistant';
import { memoryStorage } from '../services/memoryStorage';

interface MemoryScreenProps {
  memories: MemoryItem[];
  onMemoriesUpdated: (memories: MemoryItem[]) => void;
  theme: OrbThemeColor;
}

export const MemoryScreen: React.FC<MemoryScreenProps> = ({
  memories,
  onMemoriesUpdated,
  theme,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Memory Form State
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<MemoryType>('PREFERENCE');
  const [newCategory, setNewCategory] = useState('Personal');

  // Filter memories
  const filteredMemories = memories.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.category && m.category.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = filterType === 'ALL' || m.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleDelete = (id: string) => {
    const updated = memoryStorage.deleteMemory(id);
    onMemoriesUpdated(updated);
  };

  const handleCreateMemory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    memoryStorage.saveMemory({
      title: newTitle.trim(),
      content: newContent.trim(),
      type: newType,
      category: newCategory.trim() || 'General',
      confidence: 0.95,
    });

    onMemoriesUpdated(memoryStorage.getMemories());
    setNewTitle('');
    setNewContent('');
    setIsAddModalOpen(false);
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(memoryStorage.exportData());
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `viernes_memorias_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (memoryStorage.importData(content)) {
        onMemoriesUpdated(memoryStorage.getMemories());
      }
    };
    reader.readAsText(file);
  };

  // Learning stats
  const prefCount = memories.filter((m) => m.type === 'PREFERENCE').length;
  const contactCount = memories.filter((m) => m.type === 'CONTACT_ALIAS').length;
  const factCount = memories.filter((m) => m.type === 'FACT').length;
  const avgConfidence = memories.length > 0
    ? (memories.reduce((acc, m) => acc + (m.confidence || 0.9), 0) / memories.length) * 100
    : 95;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full font-rajdhani">
      {/* Top Banner & Learning Engine Stats */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-orbitron font-bold text-white flex items-center gap-2">
              <Brain className="w-6 h-6 text-cyan-400" />
              NÚCLEO DE MEMORIA & APRENDIZAJE
            </h2>
            <p className="text-xs text-slate-400">
              Banco semántico neuronal donde Viernes consolida tus preferencias, contactos y hábitos.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-cyan-900/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Añadir Memoria</span>
            </button>

            <button
              onClick={handleExport}
              className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition-all text-xs"
              title="Exportar archivo de memoria"
            >
              <Download className="w-4 h-4" />
            </button>

            <label
              className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition-all text-xs cursor-pointer"
              title="Importar archivo de memoria"
            >
              <Upload className="w-4 h-4" />
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-cyan-900/40">
            <div className="text-slate-400 text-xs flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Total Registros</span>
            </div>
            <div className="text-2xl font-orbitron font-bold text-white mt-1">{memories.length}</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-purple-900/40">
            <div className="text-slate-400 text-xs flex items-center space-x-1">
              <Award className="w-3.5 h-3.5 text-purple-400" />
              <span>Confianza Media</span>
            </div>
            <div className="text-2xl font-orbitron font-bold text-purple-300 mt-1">
              {avgConfidence.toFixed(0)}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-amber-900/40">
            <div className="text-slate-400 text-xs flex items-center space-x-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Preferencias</span>
            </div>
            <div className="text-2xl font-orbitron font-bold text-amber-300 mt-1">{prefCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-emerald-900/40">
            <div className="text-slate-400 text-xs flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Contactos & Alias</span>
            </div>
            <div className="text-2xl font-orbitron font-bold text-emerald-300 mt-1">{contactCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar en el banco de memoria..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto scrollbar-none py-1">
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'PREFERENCE', label: 'Preferencias' },
            { id: 'CONTACT_ALIAS', label: 'Alias/Contactos' },
            { id: 'FACT', label: 'Hechos & Datos' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                filterType === tab.id
                  ? 'bg-cyan-900/60 border border-cyan-500 text-cyan-200'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Memory Cards Grid */}
      {filteredMemories.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
          <Brain className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No se encontraron memorias con los criterios actuales.</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-3 px-3 py-1.5 rounded-lg bg-cyan-600/40 text-cyan-200 text-xs hover:bg-cyan-600/60 border border-cyan-500/40"
          >
            Añadir primer recuerdo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredMemories.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between shadow-md group"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-orbitron font-semibold uppercase tracking-wider ${
                        item.type === 'PREFERENCE'
                          ? 'bg-amber-950/60 text-amber-300 border border-amber-600/40'
                          : item.type === 'CONTACT_ALIAS'
                          ? 'bg-purple-950/60 text-purple-300 border border-purple-600/40'
                          : 'bg-cyan-950/60 text-cyan-300 border border-cyan-600/40'
                      }`}
                    >
                      {item.type.replace('_', ' ')}
                    </span>
                    {item.category && (
                      <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-slate-500" />
                        <span>{item.category}</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="opacity-40 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity"
                    title="Eliminar memoria"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h4 className="text-sm font-orbitron font-semibold text-white mb-1.5 tracking-wide">
                  {item.title}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed font-rajdhani">{item.content}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                </span>
                <span className="text-cyan-400/80 font-medium font-orbitron text-[10px]">
                  Confianza: {Math.round(item.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal to add new memory manually */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-950 border border-cyan-500/50 p-6 shadow-2xl shadow-cyan-950/80 font-rajdhani">
            <h3 className="text-base font-orbitron font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              NUEVO REGISTRO EN MEMORIA
            </h3>

            <form onSubmit={handleCreateMemory} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Título / Identificador</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Preferencia de Café, Contacto Táctico..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tipo de Memoria</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as MemoryType)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="PREFERENCE">Preferencia del Usuario</option>
                  <option value="CONTACT_ALIAS">Contacto o Alias</option>
                  <option value="FACT">Dato / Hecho Clave</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Categoría</label>
                <input
                  type="text"
                  placeholder="ej. Hábitos, Trabajo, Música..."
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Contenido / Detalle</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe la información que Viernes debe retener..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-md"
                >
                  Guardar en Memoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
