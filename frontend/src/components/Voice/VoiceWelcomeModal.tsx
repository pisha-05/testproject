import React, { useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Volume2, Accessibility, Radio } from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';
import { voiceAssistant } from '../../services/voiceAssistant';

interface VoiceWelcomeModalProps {
  onAcceptVoice: () => void;
  onDeclineVoice: () => void;
  highContrast: boolean;
}

export const VoiceWelcomeModal: React.FC<VoiceWelcomeModalProps> = ({
  onAcceptVoice,
  onDeclineVoice,
  highContrast,
}) => {
  const hasSpokenGreetingRef = useRef(false);

  // Attempt audible spoken greeting on mount (or queue it for first user interaction)
  useEffect(() => {
    if (!hasSpokenGreetingRef.current) {
      hasSpokenGreetingRef.current = true;
      const greetingPrompt =
        'Welcome to AccessRoute Live. Would you like to continue with voice-assisted navigation? If yes, simply tap anywhere on the screen. If no, select the button below to continue without voice assistance.';
      
      voiceAssistant.speak(greetingPrompt, {
        priority: 'high',
      });
    }
  }, []);

  const handleTapAnywhere = () => {
    voiceAssistant.unlockAudio();
    onAcceptVoice();
  };

  const handleDecline = (e: React.MouseEvent) => {
    e.stopPropagation();
    voiceAssistant.stopAll();
    onDeclineVoice();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between bg-slate-950 text-white animate-fade-in select-none safe-top safe-bottom"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to AccessRoute Live Voice Navigation. Tap anywhere to continue with voice-assisted navigation."
    >
      {/* 
        PRIMARY TAP-ANYWHERE INTERACTION AREA (YES = TAP ANYWHERE)
        The entire area above the "No" button is a giant touch/click target for blind users.
      */}
      <div
        onClick={handleTapAnywhere}
        role="button"
        tabIndex={0}
        aria-label="Continue with voice-assisted navigation. Tap anywhere."
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleTapAnywhere();
          }
        }}
        className="flex-1 w-full max-w-2xl mx-auto flex flex-col items-center justify-center p-6 sm:p-10 text-center cursor-pointer transition active:scale-[0.99] focus:outline-hidden group"
      >
        {/* Brand Pill */}
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-950/80 border border-purple-700/80 text-purple-300 text-xs font-black uppercase tracking-wider mb-6 shadow-lg shadow-purple-950/50">
          <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
          <span>Voice-First Navigation Engine</span>
        </div>

        {/* Product Title */}
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-3">
          AccessRoute Live
        </h1>

        <p className="text-sm sm:text-base text-slate-300 max-w-md font-medium mb-8 leading-relaxed">
          Accessible, step-free navigation with real-time hazard alerts and voice guidance.
        </p>

        {/* Large Hero Voice Assistant Orb */}
        <div className="my-4 relative flex flex-col items-center">
          <div className="absolute -inset-8 rounded-full bg-purple-600/20 blur-2xl animate-pulse pointer-events-none" />
          <VoiceOrb
            state="SPEAKING"
            onClick={handleTapAnywhere}
            size="hero"
            highContrast={highContrast}
          />
          <div className="mt-5 text-xs font-black uppercase tracking-widest text-purple-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Voice Assistant Active</span>
          </div>
        </div>

        {/* Spoken Quote Banner */}
        <div className="w-full max-w-lg mt-6 p-4 sm:p-5 rounded-3xl bg-purple-950/50 border border-purple-800/80 text-sm sm:text-base font-semibold text-purple-200 shadow-xl">
          “Would you like to continue with voice-assisted navigation?”
        </div>

        {/* Clear Tap Anywhere Prompt */}
        <div className="mt-6 flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-purple-600 group-hover:bg-purple-500 text-white font-black text-sm sm:text-base shadow-xl shadow-purple-600/40 transition">
          <span>Tap anywhere to continue with voice</span>
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>

      {/* 
        SECONDARY SEPARATE "NO" BUTTON
        Clearly segregated at the bottom with event propagation stopped.
      */}
      <div className="w-full max-w-md mx-auto p-4 sm:pb-6 z-20">
        <button
          type="button"
          onClick={handleDecline}
          className="w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 font-bold text-xs sm:text-sm tracking-wide transition active:scale-98 touch-target-48 cursor-pointer shadow-lg flex items-center justify-center gap-2"
          aria-label="No, continue without voice assistance"
        >
          <span>No, continue without voice assistance</span>
        </button>
      </div>
    </div>
  );
};
