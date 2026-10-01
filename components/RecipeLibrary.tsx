import React from 'react';
import { Recipe } from '../types';
import { Trash2, CheckCircle2, Circle, ExternalLink, ScrollText } from 'lucide-react';

interface RecipeLibraryProps {
  recipes: Recipe[];
  onToggleActive: (id: string) => void;
  onDelete: (id: string) => void;
  onViewDetails: (recipe: Recipe) => void;
}

export const RecipeLibrary: React.FC<RecipeLibraryProps> = ({ 
  recipes, 
  onToggleActive, 
  onDelete,
  onViewDetails
}) => {
  if (recipes.length === 0) {
    return (
      <div className="text-center py-20 px-6 bg-white rounded-2xl border border-dashed border-slate-300">
        <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <ScrollText className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="serif text-xl font-medium text-slate-900">Your Vault is Empty</h3>
        <p className="text-slate-500 mt-2 max-w-sm mx-auto">
          Add recipes via the "Add Recipe" tab. They will appear here for you to mix and match.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="serif text-2xl text-slate-900">Recipe Vault</h2>
        <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          {recipes.filter(r => r.isActive).length} Active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {recipes.map((recipe) => (
          <div 
            key={recipe.id}
            className={`
              relative group flex flex-col sm:flex-row items-start sm:items-center p-4 rounded-xl border transition-all duration-200 cursor-pointer
              ${recipe.isActive 
                ? 'bg-emerald-50/50 border-emerald-200 shadow-sm' 
                : 'bg-white border-slate-200 hover:border-slate-300'
              }
            `}
            onClick={() => onToggleActive(recipe.id)}
          >
            {/* Selection Status */}
            <div className="absolute top-4 right-4 sm:static sm:mr-4 shrink-0">
              {recipe.isActive ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              ) : (
                <Circle className="w-6 h-6 text-slate-300 group-hover:text-slate-400" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-8 sm:pr-0">
              <h3 className={`font-semibold text-lg truncate ${recipe.isActive ? 'text-emerald-900' : 'text-slate-700'}`}>
                {recipe.title}
              </h3>
              <p className="text-sm text-slate-500 line-clamp-1 mt-0.5">
                {recipe.summary}
              </p>
              <div className="flex items-center gap-2 mt-2">
                {recipe.rawInput.includes('http') && (
                  <span className="inline-flex items-center text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    <ExternalLink size={10} className="mr-1" /> Web
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  Added {new Date(recipe.addedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 sm:mt-0 sm:ml-4 flex items-center space-x-2 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4 w-full sm:w-auto justify-end">
              <button
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onViewDetails(recipe); 
                }}
                className="text-sm font-medium text-slate-600 hover:text-emerald-700 px-2 py-1 rounded hover:bg-slate-100 transition"
              >
                View
              </button>
              <button
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation(); 
                  onDelete(recipe.id); 
                }}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                title="Remove from Vault"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
