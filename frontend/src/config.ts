/**
 * Application configuration – all persisted to localStorage.
 */

// ---------- Backend URL ----------
const BACKEND_URL_KEY = "pdfocrdiff_backend_url";
const DEFAULT_BACKEND_URL = "http://localhost:8000";

export function getBackendUrl(): string {
  return localStorage.getItem(BACKEND_URL_KEY) || DEFAULT_BACKEND_URL;
}
export function setBackendUrl(url: string): void {
  localStorage.setItem(BACKEND_URL_KEY, url.replace(/\/+$/, ""));
}

// ---------- Save directory (for middle-column text) ----------
const SAVE_DIR_KEY = "pdfocrdiff_save_dir";
const DEFAULT_SAVE_DIR = "";

export function getSaveDir(): string {
  return localStorage.getItem(SAVE_DIR_KEY) || DEFAULT_SAVE_DIR;
}
export function setSaveDir(dir: string): void {
  localStorage.setItem(SAVE_DIR_KEY, dir);
}

// ---------- Auto-save interval (seconds) ----------
const AUTO_SAVE_INTERVAL_KEY = "pdfocrdiff_auto_save_interval";
const DEFAULT_AUTO_SAVE_INTERVAL = 10;

export function getAutoSaveInterval(): number {
  const v = localStorage.getItem(AUTO_SAVE_INTERVAL_KEY);
  return v ? Number(v) : DEFAULT_AUTO_SAVE_INTERVAL;
}
export function setAutoSaveInterval(seconds: number): void {
  localStorage.setItem(AUTO_SAVE_INTERVAL_KEY, String(Math.max(1, seconds)));
}
