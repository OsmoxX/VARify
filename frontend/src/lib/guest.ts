/**
 * Tożsamość gościa (odpowiednik Django session_key): UUID v4 w localStorage,
 * wysyłany w nagłówku X-Guest-Id. Gdy storage jest niedostępny — UUID w pamięci karty.
 */
const KEY = 'varify_guest_id';
let memoryId: string | null = null;

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // fallback v4 (starsze przeglądarki)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getGuestId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    memoryId ??= uuid();
    return memoryId;
  }
}
