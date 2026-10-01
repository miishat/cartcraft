import React, { useEffect, useState } from 'react';
import { LOADING_STEPS } from '../constants';

export const LoadingOverlay: React.FC = () => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 2500); // Change step every 2.5 seconds

    return () => clearInterval(interval);
  }, []);

  const currentStep = LOADING_STEPS[stepIndex];

  return (
    <div className="fixed inset-0 bg-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 border-t-4 border-emerald-900 rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-t-4 border-amber-600 rounded-full animate-spin direction-reverse duration-1000"></div>
          {/* Internal icon removed for cleaner look */}
        </div>

        <div className="space-y-2">
          <h3 className="serif text-2xl font-bold text-slate-900 transition-all duration-500">
            {currentStep.message}
          </h3>
          <p className="text-slate-500 font-light italic">
            {currentStep.subMessage}
          </p>
        </div>

        <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
          <div 
            className="bg-emerald-800 h-full transition-all duration-1000 ease-in-out"
            style={{ width: `${((stepIndex + 1) / LOADING_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};
