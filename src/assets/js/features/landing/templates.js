import { escapeHtml as e, safeUrl } from "../../core/sanitize.js";

/**
 * Template markup bersama (murni, tanpa DOM): dipakai oleh build SSG di Node
 * DAN oleh island di browser saat revalidasi ISR → satu sumber kebenaran (DRY).
 * Seluruh teks di-escape sehingga aman dari injeksi HTML.
 */
const slug = (id) => String(id).replace(/[^\w-]/g, "");

export function faqItemsHtml(items = []) {
  return items
    .map(({ id, question, answer }) => {
      const key = slug(id);
      return `<div class="accordion__item" data-faq-id="${key}">
  <h3 class="accordion__heading">
    <button class="accordion__trigger" type="button" id="faq-q-${key}" aria-expanded="false" aria-controls="faq-a-${key}">
      <span class="accordion__label">${e(question)}</span>
      <svg class="icon accordion__chevron" aria-hidden="true"><use href="#i-chevron-down"/></svg>
    </button>
  </h3>
  <div class="accordion__panel" id="faq-a-${key}" hidden="until-found">
    <div class="accordion__content"><p>${e(answer)}</p></div>
  </div>
</div>`;
    })
    .join("\n");
}

/** Pengumuman aktif pertama: belum kedaluwarsa & belum ditutup pengguna. */
export function activeAnnouncement(data, { now = Date.now(), dismissed = [] } = {}) {
  return (
    (data?.items ?? []).find(
      (item) => !dismissed.includes(item.id) && (!item.expiresAt || Date.parse(item.expiresAt) > now),
    ) ?? null
  );
}

export function announcementInnerHtml(item) {
  if (!item) return "";
  const link = item.href ? ` <a href="${e(safeUrl(item.href))}">${e(item.linkLabel || "Selengkapnya")}</a>` : "";
  return `<svg class="icon" aria-hidden="true"><use href="#i-info"/></svg>
  <p class="banner__text" data-announcement-text>${e(item.text)}${link}</p>
  <button class="btn btn--ghost btn--icon btn--sm" type="button" data-dismiss aria-label="Tutup pengumuman"><svg class="icon icon--sm" aria-hidden="true"><use href="#i-close"/></svg></button>`;
}

export function announcementHtml(item, version) {
  if (!item) return "";
  return `<aside class="banner announcement" aria-label="Pengumuman" data-island="announcements" data-hydrate="idle" data-announcement-id="${e(item.id)}" data-version="${e(version)}">
  ${announcementInnerHtml(item)}
</aside>`;
}

/** Versi ISO lebih baru? (perbandingan string ISO aman untuk format seragam) */
export const isNewer = (candidate, current) => Boolean(candidate) && (!current || String(candidate) > String(current));
