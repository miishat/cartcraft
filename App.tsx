import React, { useState, useEffect } from 'react';
import { AppStatus, Recipe, AppView } from './types';
import { generateShoppingList, parseRecipe } from './services/recipeEngine';
import { InputSection } from './components/InputSection';
import { ResultsView } from './components/ResultsView';
import { LoadingOverlay } from './components/LoadingOverlay';
import { RecipeLibrary } from './components/RecipeLibrary';
import { ShoppingCart, ChefHat, PlusCircle, BookOpen, Utensils, Minus, Plus, RefreshCw } from 'lucide-react';

export default function App() {
  // --- STATE ---
  const [recipes, setRecipes] = useState<Recipe[]>(() => {
    const saved = localStorage.getItem('cartcraft_vault');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [view, setView] = useState<AppView>('LIBRARY');
  const [input, setInput] = useState('');
  const [servings, setServings] = useState(4);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [markdown, setMarkdown] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('cartcraft_vault', JSON.stringify(recipes));
  }, [recipes]);

  // --- AUTO-INVALIDATION ---
  // If the vault changes (add/remove/toggle), the current cart is stale.
  useEffect(() => {
    if (status === AppStatus.SUCCESS) {
      setStatus(AppStatus.IDLE);
      setMarkdown(''); // Clear stale data
    }
  }, [recipes]);

  // --- ACTIONS ---

  const handleAddRecipe = async () => {
    if (!input.trim()) return;
    setStatus(AppStatus.PROCESSING);
    
    try {
      const parsed = await parseRecipe(input);
      const newRecipe: Recipe = {
        id: Math.random().toString(36).substr(2, 9),
        ...parsed,
        isActive: true, // Auto-select new recipes
        addedAt: Date.now()
      };
      
      setRecipes(prev => [newRecipe, ...prev]);
      setInput('');
      setView('LIBRARY');
      setStatus(AppStatus.IDLE); // Ensure we are ready to regenerate
    } catch (err) {
      console.error(err);
      setErrorMsg("Could not analyze this recipe.");
      setStatus(AppStatus.ERROR);
    }
  };

  const handleGenerateCart = async () => {
    const activeRecipes = recipes.filter(r => r.isActive);
    if (activeRecipes.length === 0) return;

    setStatus(AppStatus.PROCESSING);
    setErrorMsg(null);

    try {
      const result = await generateShoppingList(activeRecipes, servings);
      setMarkdown(result);
      setView('CART');
      setStatus(AppStatus.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setStatus(AppStatus.ERROR);
      setErrorMsg("Our chefs encountered an issue parsing your request. Please check your connection.");
    }
  };

  const toggleActive = (id: string) => {
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const deleteRecipe = (id: string) => {
    // Direct delete without confirm dialog for smoother UX and avoiding focus issues
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const activeCount = recipes.filter(r => r.isActive).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-800 selection:bg-emerald-200 selection:text-emerald-900">
      
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setView('LIBRARY')}>
            <div className="bg-slate-900 p-1.5 rounded-lg">
              <ChefHat className="w-5 h-5 text-white" />
            </div>
            <h1 className="serif text-xl font-bold tracking-tight text-slate-900">CartCraft</h1>
          </div>
          
          {/* View Switcher (Desktop) */}
          <div className="hidden md:flex bg-slate-100 p-1 rounded-full border border-slate-200">
             <button 
              onClick={() => setView('ADD')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${view === 'ADD' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Add Recipe
            </button>
            <button 
              onClick={() => setView('LIBRARY')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${view === 'LIBRARY' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Vault
            </button>
            <button 
              onClick={() => setView('CART')}
              // Enable button if we have active recipes, even if stale (so user can click and see the "Regenerate" screen)
              disabled={activeCount === 0}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${view === 'CART' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800 disabled:opacity-50'}`}
            >
              Master Cart
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 md:py-12 pb-24 md:pb-12">
        
        {status === AppStatus.PROCESSING && view !== 'ADD' && <LoadingOverlay />}

        {status === AppStatus.ERROR && (
          <div className="max-w-xl mx-auto mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center animate-in fade-in">
            <p className="font-medium">Error</p>
            <p className="text-sm opacity-90">{errorMsg}</p>
            <button onClick={() => setStatus(AppStatus.IDLE)} className="mt-2 text-xs font-bold underline">Dismiss</button>
          </div>
        )}

        {view === 'ADD' && (
          <InputSection 
            input={input}
            setInput={setInput}
            onAdd={handleAddRecipe}
            isProcessing={status === AppStatus.PROCESSING}
          />
        )}

        {view === 'LIBRARY' && (
          <div className="animate-in fade-in duration-300">
             <RecipeLibrary 
               recipes={recipes}
               onToggleActive={toggleActive}
               onDelete={deleteRecipe}
               onViewDetails={(r) => alert(r.rawInput)} 
             />
             
             {/* Floating Action Button for Generation */}
             {recipes.length > 0 && (
               <div className="fixed bottom-8 left-0 right-0 p-4 flex justify-center z-30 pointer-events-none">
                 <div className="bg-white/90 backdrop-blur p-2 pr-3 rounded-full shadow-2xl border border-slate-200 flex items-center gap-4 pointer-events-auto">
                    {/* Guest Counter */}
                    <div className="flex items-center space-x-2 bg-slate-100 rounded-full px-3 py-2">
                       <button onClick={() => setServings(Math.max(1, servings - 1))} className="p-1 hover:bg-white rounded-full"><Minus size={14}/></button>
                       <span className="text-sm font-bold w-4 text-center">{servings}</span>
                       <button onClick={() => setServings(servings + 1)} className="p-1 hover:bg-white rounded-full"><Plus size={14}/></button>
                       <span className="text-xs text-slate-500 uppercase">Guests</span>
                    </div>

                    <button 
                      onClick={handleGenerateCart}
                      disabled={activeCount === 0}
                      className="flex items-center space-x-2 bg-slate-900 hover:bg-emerald-900 text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShoppingCart size={18} />
                      <span>Create Master List ({activeCount})</span>
                    </button>
                 </div>
               </div>
             )}
          </div>
        )}

        {view === 'CART' && (
          <>
            {/* STALE / IDLE STATE */}
            {status === AppStatus.IDLE && (
              <div className="flex flex-col items-center justify-center py-20 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-white p-8 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 text-center max-w-md w-full">
                  <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <RefreshCw size={32} />
                  </div>
                  <h3 className="serif text-2xl font-bold text-slate-900 mb-2">Cart Out of Sync</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    You've updated your vault (added, removed, or toggled recipes). The master list needs to be regenerated.
                  </p>
                  <button 
                      onClick={handleGenerateCart}
                      className="w-full py-3.5 px-4 bg-slate-900 text-white rounded-xl font-medium hover:bg-emerald-900 transition-all shadow-lg shadow-slate-900/20 transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                      <ShoppingCart size={18} />
                      <span>Generate Optimized Cart</span>
                  </button>
                </div>
              </div>
            )}

            {/* SUCCESS STATE */}
            {status === AppStatus.SUCCESS && (
              <ResultsView 
                markdown={markdown}
                onReset={() => setView('LIBRARY')}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-3 pb-safe z-40">
        <button onClick={() => setView('LIBRARY')} className={`flex flex-col items-center p-2 ${view === 'LIBRARY' ? 'text-emerald-700' : 'text-slate-400'}`}>
          <BookOpen size={20} />
          <span className="text-[10px] font-medium mt-1">Vault</span>
        </button>
        <button onClick={() => setView('ADD')} className={`flex flex-col items-center p-2 ${view === 'ADD' ? 'text-emerald-700' : 'text-slate-400'}`}>
          <PlusCircle size={24} />
          <span className="text-[10px] font-medium mt-1">Add</span>
        </button>
        <button onClick={() => setView('CART')} className={`flex flex-col items-center p-2 ${view === 'CART' ? 'text-emerald-700' : 'text-slate-400'}`}>
          <Utensils size={20} />
          <span className="text-[10px] font-medium mt-1">Cart</span>
        </button>
      </nav>

    </div>
  );
}
