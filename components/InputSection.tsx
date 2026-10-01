import React from 'react';
import { Plus, Link, AlignLeft, Loader2 } from 'lucide-react';

interface InputSectionProps {
  input: string;
  setInput: (val: string) => void;
  onAdd: () => void;
  isProcessing: boolean;
}

export const InputSection: React.FC<InputSectionProps> = ({
  input,
  setInput,
  onAdd,
  isProcessing
}) => {
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      onAdd();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      
      <div className="text-center space-y-2 mb-6">
        <h2 className="serif text-3xl text-slate-900">
          Add to Vault
        </h2>
        <p className="text-slate-500 font-light">
          Paste a recipe URL, ingredients list, or cooking notes. We'll analyze and store it.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-1">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://cooking.nytimes.com/... or 2 cups flour..."
            className="w-full h-40 p-6 bg-transparent resize-none text-slate-700 placeholder:text-slate-300 focus:outline-none font-mono text-sm"
            disabled={isProcessing}
            autoFocus
          />
          
          <div className="absolute bottom-4 right-4 flex items-center space-x-2">
            <span className="text-xs text-slate-300 hidden sm:inline-block mr-2">
              ⌘ + Enter to save
            </span>
            <button
              onClick={onAdd}
              disabled={!input.trim() || isProcessing}
              className={`
                flex items-center space-x-2 px-6 py-2.5 rounded-xl font-medium text-white shadow-lg shadow-emerald-900/10 transition-all duration-200
                ${!input.trim() || isProcessing 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-emerald-900 hover:bg-emerald-800 hover:scale-[1.02] active:scale-[0.98]'
                }
              `}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Plus size={18} />
                  <span>Save Recipe</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 opacity-50">
        <div className="flex items-center justify-center p-4 rounded-xl border border-dashed border-slate-300 text-slate-400 text-sm">
          <Link size={16} className="mr-2" />
          <span>Web URLs</span>
        </div>
        <div className="flex items-center justify-center p-4 rounded-xl border border-dashed border-slate-300 text-slate-400 text-sm">
          <AlignLeft size={16} className="mr-2" />
          <span>Raw Text</span>
        </div>
      </div>
    </div>
  );
};
