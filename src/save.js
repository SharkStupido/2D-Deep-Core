// Persistence. Browser storage can be missing or blocked (private windows,
// sandboxed frames), so every access is guarded and the game runs without it.
import { newSave, normalizeSave } from './meta.js';

const KEY = 'deepcore.save.v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeSave(raw ? JSON.parse(raw) : null);
  } catch {
    return newSave();
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function storeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
