import { deepFreeze, shallowEqual } from "./utils.js";

/**
 * Store immutable minimalis (pengganti Context/Redux untuk vanilla JS).
 * - State selalu dibekukan; pembaruan menghasilkan objek baru.
 * - subscribe(listener, selector) → listener hanya dipanggil bila nilai
 *   hasil selector berubah (minimal re-render).
 * - Nilai turunan dihitung lewat selector, tidak disimpan ganda.
 */
export function createStore(initialState) {
  let state = deepFreeze({ ...initialState });
  const listeners = new Set();

  const getState = () => state;

  function setState(update) {
    const patch = typeof update === "function" ? update(state) : update;
    const next = { ...state, ...patch };
    if (shallowEqual(next, state)) return;
    const prev = state;
    state = deepFreeze(next);
    listeners.forEach((entry) => entry.notify(state, prev));
  }

  function subscribe(listener, selector = (s) => s) {
    let selected = selector(state);
    const entry = {
      notify(nextState) {
        const value = selector(nextState);
        if (Object.is(value, selected) || shallowEqual(value, selected)) return;
        const previous = selected;
        selected = value;
        listener(value, previous);
      },
    };
    listeners.add(entry);
    return () => listeners.delete(entry);
  }

  return { getState, setState, subscribe };
}
