import { appConfig } from "../../config/app.config.js";
import { t } from "../../core/i18n.js";
import { createGasAdapter } from "./gas.adapter.js";
import { createMockAdapter } from "./mock.adapter.js";

/**
 * Gerbang API tunggal (Clean Architecture): fitur hanya mengenal antarmuka
 * ini, bukan detail transport. Ganti backend (Apps Script → REST/Supabase)
 * cukup dengan adapter baru tanpa menyentuh fitur.
 */
export const api = appConfig.api.baseUrl ? createGasAdapter(appConfig.api) : createMockAdapter();

export const isDemoMode = api.mode === "demo";

/** Terjemahkan ApiError menjadi pesan awam. */
export function errorMessage(error) {
  const code = error?.code;
  const known = code && t(`errors.${code}`);
  if (known && known !== `errors.${code}`) return known;
  if (error?.message && code === "validation") return error.message;
  return t("errors.unknown");
}
