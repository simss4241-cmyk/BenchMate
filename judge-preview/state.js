export const STORAGE_KEY = 'benchmate-static-preview-v1';
export const initialState = () => ({ version: 1, reserved: { motor: 2, buzzer: 0 }, planSaved: false, receipts: [] });
const totals = { motor: 3, buzzer: 1 };
export function validateState(s) {
  if (!s || s.version !== 1 || typeof s.planSaved !== 'boolean' || !s.reserved || !Array.isArray(s.receipts) || s.receipts.length > 12) return false;
  return Object.entries(totals).every(([id, total]) => Number.isInteger(s.reserved[id]) && s.reserved[id] >= 0 && s.reserved[id] <= total)
    && s.receipts.every(r => r && ['motor', 'buzzer'].includes(r.item) && Number.isInteger(r.quantity) && r.quantity > 0 && r.quantity <= totals[r.item] && typeof r.id === 'string' && r.id.length <= 80);
}
export function available(state, id) { return Object.hasOwn(totals,id) ? totals[id] - state.reserved[id] : 0; }
export function reserve(state, { id, quantity, expectedAvailable, actionId }) {
  if (!validateState(state)) return { ok: false, error: 'Reset the sample before changing inventory.' };
  if (!Object.hasOwn(totals,id)) return { ok: false, error: 'Tools, intact donors, and mapped components are not recovered parts to reserve.' };
  if (typeof actionId !== 'string' || !actionId || actionId.length > 80) return { ok: false, error: 'Open a fresh reservation.' };
  const previous = state.receipts.find(r => r.id === actionId);
  if (previous) return { ok: true, state, receipt: previous, repeated: true };
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, error: 'Choose a whole number of units, at least one.' };
  if (expectedAvailable !== available(state, id)) return { ok: false, error: 'Sample stock changed. Close this form and review the latest quantity.' };
  if (quantity > available(state, id)) return { ok: false, error: `Only ${available(state, id)} sample unit(s) are available.` };
  const receipt = { id: actionId, item: id, quantity };
  return { ok: true, state: { ...state, reserved: { ...state.reserved, [id]: state.reserved[id] + quantity }, receipts: [receipt, ...state.receipts].slice(0, 12) }, receipt, repeated: false };
}
export function restore(raw) {
  try { const s = JSON.parse(raw); return validateState(s) ? s : initialState(); } catch { return initialState(); }
}
