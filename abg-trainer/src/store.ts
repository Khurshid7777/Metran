import { create } from 'zustand';
import type { Lang } from './i18n';
import { load, save, storageAvailable } from './storage';
import { getProfile, setProfile, type Profile } from './storage/records';

export type Screen = 'home' | 'calculator' | 'trainer' | 'exam' | 'progress' | 'settings' | 'verify';

export interface AppSettings {
  advanced: boolean;
  agWithK: boolean;
  agNormLow: number | null;
  agNormHigh: number | null;
  bicarbFactor: number;
  patm: number;
  examCases: number;
  examMinutes: number;
  passPercent: number;
  centerName: string;
  signatory: string;
  logoDataUrl: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  advanced: false,
  agWithK: false,
  agNormLow: null,
  agNormHigh: null,
  bicarbFactor: 0.3,
  patm: 717,
  examCases: 20,
  examMinutes: 40,
  passPercent: 80,
  centerName: '',
  signatory: '',
  logoDataUrl: '',
};

interface State {
  lang: Lang;
  screen: Screen;
  settings: AppSettings;
  profile: Profile;
  storageOk: boolean;
  setLang: (l: Lang) => void;
  go: (s: Screen) => void;
  updateSettings: (p: Partial<AppSettings>) => void;
  updateProfile: (p: Partial<Profile>) => void;
}

const initialProfile = getProfile();

export const useApp = create<State>((set, get) => ({
  lang: initialProfile.lang ?? 'ru',
  screen: 'home',
  settings: { ...DEFAULT_APP_SETTINGS, ...load<Partial<AppSettings>>('settings', {}) },
  profile: initialProfile,
  storageOk: storageAvailable(),
  setLang: (lang) => {
    const profile = { ...get().profile, lang };
    setProfile(profile);
    document.documentElement.lang = lang;
    set({ lang, profile });
  },
  go: (screen) => {
    set({ screen });
    window.scrollTo?.(0, 0);
  },
  updateSettings: (p) => {
    const settings = { ...get().settings, ...p };
    save('settings', settings);
    set({ settings });
  },
  updateProfile: (p) => {
    const profile = { ...get().profile, ...p };
    setProfile(profile);
    set({ profile });
  },
}));

/** Core settings derived from the app settings. */
export function coreSettings(s: AppSettings) {
  return {
    advanced: s.advanced,
    agWithK: s.agWithK,
    agNormOverride: s.agNormLow !== null && s.agNormHigh !== null ? ([s.agNormLow, s.agNormHigh] as [number, number]) : undefined,
    bicarbFactor: s.bicarbFactor,
    patm: s.patm,
  };
}
