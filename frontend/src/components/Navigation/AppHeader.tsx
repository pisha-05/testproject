import React from 'react';
import { Menu, Settings, MapPin, Navigation, Search, Sparkles } from 'lucide-react';
import { MobilityProfileCode } from '../../types';

interface AppHeaderProps {
  onToggleMenu: () => void;
  locationLabel?: string;
  isLocating?: boolean;
  onRecenterLocation?: () => void;
  activeProfile: MobilityProfileCode;
  onOpenProfileSelector: () => void;
  onOpenSettings: () => void;
  onOpenCommandPalette: () => void;
  highContrast: boolean;
  isNavigating: boolean;
}

const PROFILE_LABELS: Record<MobilityProfileCode, { label: string; icon: string }> = {
  wheelchair: { label: 'Wheelchair', icon: '🦽' },
  vision: { label: 'Visual Assist', icon: '👁️' },
  pram_elderly: { label: 'Pram / Walker', icon: '👶' },
  walking: { label: 'Walking', icon: '🚶' },
  bicycle: { label: 'Bicycle', icon: '🚲' },
  scooter: { label: 'Scooter', icon: '🛴' },
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  onToggleMenu,
  locationLabel,
  isLocating,
  onRecenterLocation,
  activeProfile,
  onOpenProfileSelector,
  onOpenSettings,
  onOpenCommandPalette,
  highContrast,
  isNavigating,
}) => {
  if (isNavigating) return null;

  const currentProfileInfo = PROFILE_LABELS[activeProfile] || { label: 'Wheelchair', icon: '🦽' };
  const displayLocation = isLocating ? 'Locating...' : (locationLabel || 'Current location');

  return (
    <header
      className={`absolute top-0 left-0 right-0 z-30 pointer-events-auto safe-top px-3 py-2 sm:px-4 sm:py-2.5 transition-colors duration-200 ${
        highContrast
          ? 'bg-black/95 text-yellow-300 border-b-2 border-yellow-400'
          : 'bg-slate-900/90 backdrop-blur-md text-white border-b border-slate-800/80 shadow-md'
      }`}
      role="banner"
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
        {/* Left: Menu Trigger & Brand Name */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Menu Button */}
          <button
            onClick={onToggleMenu}
            className="w-10 h-10 rounded-2xl flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition active:scale-95 touch-target-48 cursor-pointer shrink-0 border border-slate-700"
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
              <Navigation className="w-4 h-4 text-white transform rotate-45" aria-hidden="true" />
            </div>
            <div className="min-w-0 hidden xs:block">
              <h1 className="font-extrabold text-sm sm:text-base tracking-tight truncate flex items-center gap-1.5 leading-tight">
                <span>AccessRoute</span>
                <span className="text-cyan-400 font-bold text-xs px-1.5 py-0.2 rounded-full bg-cyan-950/80 border border-cyan-800">
                  Live
                </span>
              </h1>
            </div>
          </div>
        </div>

        {/* Right Actions: Compact Voice (Mobile) + Quick Search, Location, Profile, Settings (Desktop) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Quick Palette Search Shortcut (Desktop) */}
          <button
            onClick={onOpenCommandPalette}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/80 text-xs font-semibold transition active:scale-95 cursor-pointer"
            title="Open Command Search Palette (⌘K)"
          >
            <Search className="w-3.5 h-3.5 text-cyan-400" />
            <kbd className="text-[10px] font-mono text-slate-400">⌘K</kbd>
          </button>

          {/* Compact Real Current Location Indicator (Hidden on smallest mobile screens to prevent overflow) */}
          <button
            type="button"
            onClick={onRecenterLocation}
            className={`hidden xs:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition active:scale-95 cursor-pointer max-w-[130px] sm:max-w-[180px] ${
              highContrast
                ? 'bg-black text-yellow-300 border-yellow-400 hover:bg-yellow-950/40'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700/80'
            }`}
            title={onRecenterLocation ? "Recenter to your current GPS location" : "Current location"}
            aria-label={`Current location: ${displayLocation}. Tap to center map.`}
          >
            <MapPin className={`w-3.5 h-3.5 shrink-0 ${isLocating ? 'text-amber-400 animate-pulse' : 'text-cyan-400'}`} aria-hidden="true" />
            <span className="truncate">
              {displayLocation}
            </span>
          </button>

          {/* Quick Profile Pill (Desktop) */}
          <button
            onClick={onOpenProfileSelector}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 text-blue-200 text-xs font-bold transition active:scale-95 touch-target-48 cursor-pointer"
            title="Change accessibility profile"
            aria-label={`Current profile: ${currentProfileInfo.label}. Tap to change profile.`}
          >
            <span>{currentProfileInfo.icon}</span>
            <span className="hidden md:inline truncate max-w-[85px] sm:max-w-none">{currentProfileInfo.label}</span>
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition active:scale-95 touch-target-48 cursor-pointer"
            title="Open Accessibility Settings"
            aria-label="Open Accessibility Settings"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
