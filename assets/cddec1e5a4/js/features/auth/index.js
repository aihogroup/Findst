import { appConfig } from "../../config/app.config.js";
import { focusElement } from "../../core/a11y.js";
import { h, icon, qs, qsa, replaceChildren } from "../../core/dom.js";
import { t } from "../../core/i18n.js";
import { safeRedirectPath, sanitizeText } from "../../core/sanitize.js";
import { session as tabStorage } from "../../core/storage.js";
import { setFlash, toast } from "../../components/molecules/toast.js";
import { withBusy } from "../../components/atoms/button.js";
import { api, errorMessage, isDemoMode } from "../../services/api/index.js";
import { isAuthenticated, saveSession } from "../../services/session.js";
import { createFormController } from "./form-controller.js";
import { schemas } from "./validation.js";

/**
 * ISLAND: Autentikasi (masuk, daftar + OTP, lupa kata sandi).
 * Alur dideklarasikan per langkah; pengendali form generik menangani
 * validasi, kondisi memuat, draf, dan aksesibilitas.
 * Langkah aktif dipertahankan di sessionStorage sehingga penyegaran halaman
 * tidak mengembalikan pengguna ke awal (state preservation).
 */
const RETRYABLE = new Set(["offline", "timeout", "server", "network", "rateLimited"]);
const stepKey = (flow) => `findst:auth-step:${flow}`;

function createContext(section, flow) {
  const alertEl = qs("[data-form-alert]", section);
  const title = qs("[data-step-title]", section);
  const desc = qs("[data-step-desc]", section);
  const forms = Object.fromEntries(qsa("form[data-step]", section).map((f) => [f.dataset.step, f]));
  let countdownTimer;

  const ctx = {
    forms,
    data: {},

    showAlert(message, { tone = "danger", retryForm } = {}) {
      alertEl.className = `form-alert${tone === "danger" ? "" : ` form-alert--${tone}`}`;
      alertEl.setAttribute("role", tone === "danger" ? "alert" : "status");
      replaceChildren(
        alertEl,
        icon(tone === "danger" ? "alert" : tone === "success" ? "check-circle" : "info", "icon--sm"),
        h("span", { class: "u-grow" }, message),
        retryForm &&
          h("button", { class: "btn btn--ghost btn--sm", type: "button", onClick: () => retryForm.requestSubmit() }, icon("refresh", "icon--sm"), t("common.retry")),
      );
      alertEl.hidden = false;
    },

    hideAlert: () => (alertEl.hidden = true),

    handleError(error, form, showError) {
      const fields = error?.details?.fields;
      if (error?.code === "validation" && fields) Object.entries(fields).forEach(([name, msg]) => showError(name, sanitizeText(msg)));
      ctx.showAlert(errorMessage(error), { retryForm: RETRYABLE.has(error?.code) ? form : null });
    },

    goTo(step, data = {}) {
      Object.assign(ctx.data, data);
      Object.entries(forms).forEach(([name, form]) => (form.hidden = name !== step));
      const order = Object.keys(forms);
      qsa("[data-progress]", section).forEach((li, i) => {
        const current = li.dataset.progress === step;
        li.toggleAttribute("data-done", i < order.indexOf(step));
        if (current) li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
      });
      const email = ctx.data.email ?? "";
      forms[step].querySelectorAll('input[name="email"][type="hidden"]').forEach((input) => (input.value = email));
      const copy = STEP_COPY[flow]?.[step];
      if (copy && title) title.textContent = t(copy.title, { email });
      if (copy && desc) desc.textContent = t(copy.desc, { email });
      tabStorage.write(stepKey(flow), { step, data: ctx.data, at: Date.now() });
      focusElement(title ?? forms[step].querySelector("input:not([type=hidden])"));
    },

    startCountdown(form) {
      const button = qs('[data-action="resend-otp"]', form);
      const label = qs("[data-otp-countdown]", form);
      let seconds = appConfig.auth.otpResendSeconds;
      clearInterval(countdownTimer);
      button.disabled = true;
      const tick = () => {
        label.textContent = seconds > 0 ? t("auth.resendIn", { seconds }) : "";
        if (seconds-- <= 0) {
          clearInterval(countdownTimer);
          button.disabled = false;
        }
      };
      tick();
      countdownTimer = setInterval(tick, 1000);
    },

    otpInfo(message, devOtp) {
      ctx.showAlert(devOtp && isDemoMode ? `${message} ${t("auth.otpDemo", { otp: devOtp })}` : message, { tone: "info" });
    },

    finish(path) {
      tabStorage.remove(stepKey(flow));
      location.assign(path);
    },
  };
  return ctx;
}

const STEP_COPY = {
  register: {
    account: { title: "auth.registerTitle", desc: "auth.registerDesc" },
    verify: { title: "auth.registerVerifyTitle", desc: "auth.registerVerifyDesc" },
  },
  forgot: {
    reset: { title: "auth.forgotResetTitle", desc: "auth.forgotResetDesc" },
  },
};

/* ======================= Definisi alur ======================= */
const FLOWS = {
  login(ctx, params) {
    const form = ctx.forms.login;
    const controller = createFormController(form, {
      schema: schemas.login,
      draftKey: "login",
      async onSubmit(values, { showError }) {
        ctx.hideAlert();
        try {
          const result = await api.login({ email: values.email, password: values.password, remember: values.remember });
          saveSession(result, { remember: values.remember });
          setFlash(t("auth.loggedIn", { name: result.user.name }), "success");
          ctx.finish(safeRedirectPath(params.get("next"), appConfig.auth.afterLoginPath));
        } catch (error) {
          if (error.code === "notVerified") {
            // Lanjutkan verifikasi di halaman daftar
            tabStorage.write(stepKey("register"), { step: "verify", data: { email: values.email, devOtp: error.details?.devOtp }, at: Date.now() });
            return location.assign("/daftar/");
          }
          ctx.handleError(error, form, showError);
          if (error.code === "invalidCredentials") form.elements.password.select();
        }
      },
    });
    controller.restoreDraft();
  },

  register(ctx, params) {
    const { account, verify } = ctx.forms;
    const plan = params.get("paket") === "premium" ? "premium" : "free";
    account.elements.plan.value = plan;

    const accountCtl = createFormController(account, {
      schema: schemas.account,
      draftKey: "register",
      async onSubmit(values, { showError }) {
        ctx.hideAlert();
        try {
          const { email, devOtp } = await api.register(values);
          ctx.goTo("verify", { email });
          ctx.otpInfo(t("auth.otpSent", { email }), devOtp);
          ctx.startCountdown(verify);
        } catch (error) {
          ctx.handleError(error, account, showError);
        }
      },
    });

    createFormController(verify, {
      schema: schemas.verify,
      async onSubmit(values, { showError }) {
        ctx.hideAlert();
        try {
          const result = await api.verifyOtp({ email: ctx.data.email, otp: values.otp });
          saveSession(result, { remember: true });
          accountCtl.clearDraft();
          setFlash(t("auth.welcome", { name: result.user.name }), "success");
          ctx.finish(`${appConfig.auth.afterLoginPath}?selamat=1`);
        } catch (error) {
          ctx.handleError(error, verify, showError);
          if (error.code === "invalidOtp") verify.elements.otp.select();
        }
      },
    });

    bindResend(ctx, verify, "verify");
    qs('[data-action="back-to-account"]', verify)?.addEventListener("click", () => {
      ctx.hideAlert();
      ctx.goTo("account");
    });

    if (accountCtl.restoreDraft()) toast({ message: t("form.draftRestored") });
    restoreStep(ctx, "register", (data) => {
      ctx.goTo("verify", data);
      if (data.devOtp) ctx.otpInfo(t("errors.notVerified"), data.devOtp);
      ctx.startCountdown(verify);
    });
  },

  forgot(ctx) {
    const { request, reset } = ctx.forms;
    createFormController(request, {
      schema: schemas.request,
      draftKey: "forgot",
      async onSubmit(values, { showError }) {
        ctx.hideAlert();
        try {
          const { devOtp } = await api.forgotPassword({ email: values.email });
          ctx.goTo("reset", { email: values.email });
          ctx.otpInfo(t("auth.forgotSent", { email: values.email }), devOtp);
          ctx.startCountdown(reset);
        } catch (error) {
          ctx.handleError(error, request, showError);
        }
      },
    });

    createFormController(reset, {
      schema: schemas.reset,
      async onSubmit(values, { showError }) {
        ctx.hideAlert();
        try {
          await api.resetPassword({ email: ctx.data.email, otp: values.otp, password: values.password });
          setFlash(t("auth.resetDone"), "success");
          ctx.finish("/masuk/");
        } catch (error) {
          ctx.handleError(error, reset, showError);
        }
      },
    });

    bindResend(ctx, reset, "reset");
    restoreStep(ctx, "forgot", (data) => {
      ctx.goTo("reset", data);
      ctx.startCountdown(reset);
    });
  },
};

function bindResend(ctx, form, purpose) {
  const button = qs('[data-action="resend-otp"]', form);
  button?.addEventListener("click", () =>
    withBusy(button, async () => {
      try {
        const { devOtp } = await api.resendOtp({ email: ctx.data.email, purpose });
        ctx.otpInfo(t("auth.otpResent"), devOtp);
        ctx.startCountdown(form);
      } catch (error) {
        ctx.showAlert(errorMessage(error));
      }
    }),
  );
}

function restoreStep(ctx, flow, apply) {
  const saved = tabStorage.read(stepKey(flow));
  const fresh = saved && Date.now() - saved.at < 10 * 60 * 1000;
  if (fresh && saved.step !== Object.keys(ctx.forms)[0]) apply(saved.data ?? {});
}

export function mount(section) {
  const flow = section.dataset.authFlow;
  if (flow === "login" && isAuthenticated()) {
    location.replace(appConfig.auth.afterLoginPath);
    return;
  }
  const params = new URLSearchParams(location.search);
  FLOWS[flow]?.(createContext(section, flow), params);
}
