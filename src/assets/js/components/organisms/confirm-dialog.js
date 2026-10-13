import { h } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { closeDialog, openDialog } from "./dialog.js";

/**
 * Dialog konfirmasi untuk aksi penting / tidak dapat dibatalkan.
 * const ok = await confirmDialog({ title, message, confirmLabel, tone: "danger" })
 * Fokus awal pada tombol Batal (pilihan aman).
 */
export function confirmDialog({ title, message, confirmLabel = t("common.confirm"), cancelLabel = t("common.cancel") }) {
  return new Promise((resolve) => {
    let result = false;
    const titleId = `confirm-title-${Date.now()}`;
    const descId = `${titleId}-desc`;
    const cancel = h("button", { class: "btn btn--secondary", type: "button", autofocus: true, "data-dialog-close": true }, cancelLabel);
    const confirm = h(
      "button",
      {
        class: "btn btn--primary",
        type: "button",
        onClick: () => {
          result = true;
          closeDialog(dialog);
        },
      },
      confirmLabel,
    );
    const dialog = h(
      "dialog",
      { class: "dialog", role: "alertdialog", "aria-labelledby": titleId, "aria-describedby": descId, "data-lock-scroll": true },
      h("div", { class: "dialog__header" }, h("h2", { class: "dialog__title", id: titleId }, title)),
      h("div", { class: "dialog__body" }, h("p", { id: descId, class: "u-text-muted" }, message)),
      h("div", { class: "dialog__footer" }, cancel, confirm),
    );
    document.body.append(dialog);
    dialog.addEventListener(
      "dialog:closed",
      () => {
        dialog.remove();
        resolve(result);
      },
      { once: true },
    );
    openDialog(dialog);
    cancel.focus();
  });
}
