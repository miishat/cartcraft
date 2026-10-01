import React, { useState, useEffect } from 'react';
import { ParsedSection, ParsedItem } from '../types';
import { Check, Copy, ArrowLeft } from 'lucide-react';

interface ResultsViewProps {
  markdown: string;
  onReset: () => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({ markdown, onReset }) => {
  const [sections, setSections] = useState<ParsedSection[]>([]);
  const [copied, setCopied] = useState(false);

  // --- ICON HELPER ---
  const getSectionIcon = (title: string, type: ParsedSection['type']) => {
    if (type === 'pantry') return '🧂';
    if (type === 'tips') return '💡';
    
    const lower = title.toLowerCase();
    if (lower.includes('produce') || lower.includes('fruit') || lower.includes('veg')) return '🥬';
    if (lower.includes('meat') || lower.includes('seafood') || lower.includes('poultry') || lower.includes('butcher')) return '🥩';
    if (lower.includes('dairy') || lower.includes('cheese') || lower.includes('yogurt')) return '🧀';
    if (lower.includes('frozen')) return '❄️';
    if (lower.includes('bake') || lower.includes('bread')) return '🥖';
    if (lower.includes('dry') || lower.includes('pasta') || lower.includes('rice') || lower.includes('cereal')) return '🍝';
    if (lower.includes('spice') || lower.includes('oil') || lower.includes('condiment')) return '🌶️';
    if (lower.includes('beverage') || lower.includes('drink')) return '🥤';
    if (lower.includes('household') || lower.includes('paper')) return '🧻';
    
    return '🛒';
  };

  // --- PARSER ---
  useEffect(() => {
    const lines = markdown.split('\n');
    const newSections: ParsedSection[] = [];
    let currentSection: ParsedSection | null = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      // 1. New Section Header
      if (trimmed.startsWith('### ')) {
        if (currentSection) newSections.push(currentSection);
        
        const rawTitle = trimmed.replace('### ', '').trim();
        const cleanTitle = rawTitle.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim(); 
        
        let type: ParsedSection['type'] = 'aisle';
        if (cleanTitle.toLowerCase().includes('pantry')) type = 'pantry';
        if (cleanTitle.toLowerCase().includes('tips') || cleanTitle.toLowerCase().includes('chef')) type = 'tips';

        currentSection = {
          title: cleanTitle,
          items: [],
          type
        };
      } 
      // 2. Main Ingredient Item (Checkbox)
      else if (trimmed.startsWith('- [ ]') && currentSection) {
        let content = trimmed.replace('- [ ]', '').trim();
        
        // Extract "Used In" info
        let sourceRecipe = undefined;
        const sourceMatch = content.match(/\(Used in: (.*?)\)/);
        if (sourceMatch) {
          sourceRecipe = sourceMatch[1];
          content = content.replace(sourceMatch[0], '').trim();
        }

        currentSection.items.push({
          id: Math.random().toString(36).substr(2, 9),
          text: content,
          sourceRecipe,
          checked: false,
          notes: []
        });
      } 
      // 3. Sub-notes / Swaps / Details (Indented or plain bullets following a check)
      else if ((trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) && currentSection) {
        // Remove standard bullet markers
        const content = trimmed.replace(/^[-*+]\s+/, '').trim();
        
        // If we are in an AISLE or PANTRY section, these bullets usually belong to the previous item
        if ((currentSection.type === 'aisle' || currentSection.type === 'pantry') && currentSection.items.length > 0) {
          const lastItem = currentSection.items[currentSection.items.length - 1];
          
          if (content.toLowerCase().startsWith('swap:') || content.toLowerCase().startsWith('*swap:*') || content.toLowerCase().startsWith('**swap:**')) {
             // Handle Swap - Clean it up for display
             const cleanSwap = content
               .replace(/\*?swap:\*?/i, '')  // Remove "Swap:"
               .replace(/^\*\*/, '')         // Remove leading **
               .replace(/\*\*$/, '')         // Remove trailing **
               .replace(/^:/, '')            // Remove leading :
               .trim();
             lastItem.swapOption = cleanSwap;
          } else {
             // Handle generic notes (Need, Best Cut, etc.)
             if (!lastItem.notes) lastItem.notes = [];
             lastItem.notes.push(content);
          }
        } 
        // If we are in TIPS, they are standalone items
        else if (currentSection.type === 'tips') {
           currentSection.items.push({
            id: Math.random().toString(36).substr(2, 9),
            text: content,
            checked: false,
            isNote: true
          });
        }
      }
    });

    if (currentSection) newSections.push(currentSection);
    setSections(newSections);
  }, [markdown]);

  const toggleItem = (sectionIndex: number, itemId: string) => {
    const newSections = [...sections];
    const item = newSections[sectionIndex].items.find(i => i.id === itemId);
    if (item) item.checked = !item.checked;
    setSections(newSections);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to render bold text properly without showing raw asterisks
  const renderRichText = (text: string) => {
    if (!text) return null;
    
    // Split by **bold** markers. 
    // The capture group ( ) keeps the delimiter in the result array.
    // We use a non-greedy match .*? to handle multiple bold sections in one line.
    const parts = text.split(/(\*\*.*?\*\*)/g);
    
    return (
      <span>
        {parts.map((part, i) => {
          // Check if this specific part is the bold token
          if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
            // Render the inner text bold
            return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-10 duration-500">
      
      {/* Header Actions */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <button 
          onClick={onReset}
          className="flex items-center text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={18} className="mr-2" />
          <span>Edit Input</span>
        </button>
        
        <button 
          onClick={copyToClipboard}
          className="flex items-center space-x-2 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
        >
          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
          <span className="text-sm font-medium">{copied ? "Copied" : "Copy List"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Main Aisles */}
        <div className="md:col-span-8 space-y-8">
          {sections.filter(s => s.type === 'aisle').map((section, sIdx) => (
            <div key={sIdx} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
              <h3 className="serif text-xl font-semibold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <span className="text-2xl">{getSectionIcon(section.title, section.type)}</span>
                  {section.title}
                </span>
                <span className="text-xs font-sans font-normal text-slate-400 bg-slate-50 px-2 py-1 rounded-full">
                  {section.items.length} items
                </span>
              </h3>
              <ul className="space-y-4">
                {section.items.map((item) => (
                    <li 
                      key={item.id} 
                      className={`group flex items-start space-x-4 cursor-pointer select-none transition-all ${item.checked ? 'opacity-40 grayscale' : 'opacity-100'}`}
                      onClick={() => toggleItem(sections.indexOf(section), item.id)}
                    >
                      {/* Custom Checkbox */}
                      <div className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ${item.checked ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-200 group-hover:border-emerald-400'}`}>
                        {item.checked && <Check size={14} className="text-white" />}
                      </div>

                      <div className="flex-1 space-y-1">
                        {/* Main Text */}
                        <div className={`text-lg leading-snug text-slate-700 ${item.checked ? 'line-through decoration-slate-400' : ''}`}>
                          {renderRichText(item.text)}
                        </div>
                        
                        {/* Meta Data Row (Swaps, Source) */}
                        {(item.sourceRecipe || item.swapOption) && (
                          <div className="flex flex-wrap gap-2 text-xs mt-1">
                             {item.swapOption && (
                               <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-medium">
                                 Swap: {renderRichText(item.swapOption)}
                               </span>
                             )}
                             {item.sourceRecipe && (
                               <span className="text-slate-400">
                                 From: {item.sourceRecipe}
                               </span>
                             )}
                          </div>
                        )}

                        {/* Nested Notes (Needs, Best Cuts, etc.) */}
                        {item.notes && item.notes.length > 0 && (
                          <div className="mt-2 space-y-1 pl-1 border-l-2 border-slate-100">
                             {item.notes.map((note, nIdx) => (
                               <div key={nIdx} className="text-sm text-slate-500 pl-2">
                                 {renderRichText(note)}
                               </div>
                             ))}
                          </div>
                        )}
                      </div>
                    </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Sidebar: Pantry & Tips */}
        <div className="md:col-span-4 space-y-6">
          
          {/* Pantry */}
          {sections.filter(s => s.type === 'pantry').map((section, sIdx) => (
            <div key={sIdx} className="bg-slate-50/80 rounded-xl border border-slate-200 p-5">
              <h3 className="serif text-lg font-semibold text-slate-700 mb-4 flex items-center">
                <span className="bg-white p-1.5 rounded-md shadow-sm border border-slate-100 mr-3 text-lg">
                    {getSectionIcon(section.title, section.type)}
                </span> 
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.items.map((item) => (
                   <li 
                   key={item.id} 
                   className="flex items-start space-x-3 cursor-pointer text-sm text-slate-600 hover:text-slate-900 transition-colors"
                   onClick={() => toggleItem(sections.indexOf(section), item.id)}
                 >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-slate-400 border-slate-400' : 'bg-white border-slate-300'}`}>
                        {item.checked && <Check size={10} className="text-white" />}
                    </div>
                    <div className={`flex-1 ${item.checked ? 'line-through opacity-50' : ''}`}>
                      <span className="font-medium">{renderRichText(item.text)}</span>
                      {/* Nested Pantry Notes */}
                      {item.notes && item.notes.length > 0 && (
                          <div className="mt-1 space-y-0.5 pl-1 border-l-2 border-slate-200">
                             {item.notes.map((note, nIdx) => (
                               <div key={nIdx} className="text-xs text-slate-400 pl-1.5">
                                 {renderRichText(note)}
                               </div>
                             ))}
                          </div>
                      )}
                    </div>
                 </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Tips */}
          {sections.filter(s => s.type === 'tips').map((section, sIdx) => (
            <div key={sIdx} className="bg-amber-50 rounded-xl border border-amber-100 p-5 shadow-[0_2px_15px_-3px_rgba(251,191,36,0.1)]">
               <h3 className="serif text-lg font-semibold text-amber-900 mb-4 flex items-center">
                <span className="bg-white p-1.5 rounded-md shadow-sm border border-amber-100 mr-3 text-lg">
                    {getSectionIcon(section.title, section.type)}
                </span> 
                Chef Tips
              </h3>
              <ul className="space-y-4">
                {section.items.map((item, iIdx) => (
                  <li key={iIdx} className="text-sm text-amber-900/80 leading-relaxed flex items-start">
                    <span className="mr-3 mt-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full shrink-0"></span>
                    <span>{renderRichText(item.text)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
};
