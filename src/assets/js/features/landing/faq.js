import { appConfig } from "../../config/app.config.js";
import { announce } from "../../core/a11y.js";
import { h, qs, qsa, replaceChildren } from "../../core/dom.js";
import { fmt, t } from "../../core/i18n.js";
import { subscribeQuery } from "../../core/query.js";
import { debounce } from "../../core/utils.js";
import { createAccordion } from "../../components/organisms/accordion.js";
import { toast } from "../../components/molecules/toast.js";
import { api } from "../../services/api/index.js";
import { faqItemsHtml, isNewer } from "./templates.js";

/**
 * ISLAND: FAQ.
 * - Accordion dengan navigasi panah/Home/End.
 * - Pencarian lokal ber-debounce + sorotan kata kunci + empty state.
 * - ISR di sisi klien: HTML hasil build tampil instan, lalu versi terbaru
 *   diambil di latar belakang (stale-while-revalidate) dan diganti bila lebih baru.
 */
function readItems(list) {
  return qsa(".accordion__item", list).map((el) => {
    const label = qs(".accordion__label", el);
    const answer = qs(".accordion__content p", el);
    return { el, label, answer, question: label.textContent, answerText: answer.textContent };
  });
}

/** Sorot kecocokan tanpa innerHTML (aman). */
function highlight(target, text, query) {
  if (!query) return replaceChildren(target, text);
  const lower = text.toLocaleLowerCase("id");
  const parts = [];
  let index = 0;
  for (let found = lower.indexOf(query, index); found !== -1; found = lower.indexOf(query, index)) {
    parts.push(text.slice(index, found), h("mark", {}, text.slice(found, found + query.length)));
    index = found + query.length;
  }
  parts.push(text.slice(index));
  replaceChildren(target, ...parts);
}

export function mount(list) {
  const section = list.closest("section") ?? document;
  const input = qs("[data-faq-search] input", section);
  const empty = qs("[data-faq-empty]", section);
  const clear = qs("[data-faq-clear]", section);
  const updated = qs("[data-faq-updated]", section);

  let accordion = createAccordion(list);
  let items = readItems(list);

  function filter(raw) {
    const query = raw.trim().toLocaleLowerCase("id");
    let count = 0;
    items.forEach((item) => {
      const match = !query || `${item.question} ${item.answerText}`.toLocaleLowerCase("id").includes(query);
      item.el.hidden = !match;
      if (match) count++;
      highlight(item.label, item.question, query);
      highlight(item.answer, item.answerText, query);
    });
    empty.hidden = count > 0;
    if (query) announce(count ? t("faq.results", { count }) : t("faq.none"));
  }

  const onInput = debounce(() => filter(input.value), appConfig.ui.searchDebounceMs);
  input?.addEventListener("input", onInput);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) {
      input.value = "";
      filter("");
    }
  });
  clear?.addEventListener("click", () => {
    input.value = "";
    filter("");
    input.focus();
  });

  // ISR: revalidasi konten di latar belakang
  const { unsubscribe } = subscribeQuery(
    "faq",
    () => api.getFaq(),
    { staleTime: appConfig.content.staleTimeMs, persist: true },
    ({ data }) => {
      if (!data?.items?.length || !isNewer(data.version, list.dataset.version)) return;
      accordion.destroy();
      list.innerHTML = faqItemsHtml(data.items); // markup ter-escape oleh template
      list.dataset.version = data.version;
      if (updated) {
        updated.dateTime = data.version;
        updated.textContent = fmt.date(data.version);
      }
      accordion = createAccordion(list);
      items = readItems(list);
      if (input?.value) filter(input.value);
      toast({ message: t("faq.updated") });
    },
  );

  return () => {
    unsubscribe();
    onInput.cancel();
    accordion.destroy();
  };
}
