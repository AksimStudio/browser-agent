import { chromium } from "playwright";
import { actionNeedsApproval, describeDanger } from "./security.js";
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeDom } from "./dom-agent.js";

const MAX_ELEMENTS = 100;
const MAX_TEXT = 5000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function scoreButtonForAction(data, action) {
  const wanted = String(action).toLowerCase().trim();
  const signal = `${data.text || ""} ${data.aria || ""} ${data.title || ""} ${data.testId || ""} ${data.name || ""}`.toLowerCase();
  if (/^(\+|＋)$|в корз|добав|add|plus|increment/.test(wanted)) return /add|plus|increment|добав|в корз|\+|＋/.test(signal) ? 10 : 0;
  if (/^(-|−|–)$|убав|уменьш|remove|minus|decrement/.test(wanted)) return /remove|minus|decrement|убав|уменьш|−|–/.test(signal) ? 10 : 0;
  const terms = wanted.match(/[\p{L}\p{N}+-]+/gu) || [];
  return terms.reduce((score, term) => score + (signal.includes(term) ? 1 : 0), 0);
}

export class BrowserController {
  constructor({ profileDir, approve }) {
    this.profileDir = profileDir;
    this.approve = approve;
    this.context = null;
    this.page = null;
    this.deniedActions = new Set();
    this.task = "";
    this.latestScreenshot = null;
    this.discoveredUrls = new Set();
    this.taskUrls = new Set();
  }

  setTask(task) {
    this.task = task;
    this.taskUrls = new Set((String(task).match(/https?:\/\/[^\s<>"']+/gi) || []).map((url) => url.replace(/[),.;]+$/, "")));
    this.discoveredUrls.clear();
  }

  resetTaskSecurity() {
    this.deniedActions.clear();
  }

  async start() {
    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      viewport: null,
      args: ["--start-maximized"],
    });
    const pages = this.context.pages();
    this.page = pages.at(-1) ?? await this.context.newPage();
    this.context.on("page", async (page) => {
      this.attachPage(page);
      this.page = page;
      await page.bringToFront().catch(() => {});
    });
    this.attachPage(this.page);
    await this.page.bringToFront().catch(() => {});
  }

  attachPage(page) {
    page.on("dialog", async (dialog) => {
      const allowed = await this.approve(`Диалог сайта: ${dialog.type()} — ${dialog.message()}`);
      if (allowed) await dialog.accept(); else await dialog.dismiss();
    });
  }

  async stop() {
    await this.context?.close();
  }

  async observe() {
    await this.page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    const snapshot = await this.page.evaluate(({ maxElements, maxText }) => {
      document.querySelectorAll("[data-agent-ref]").forEach((el) => el.removeAttribute("data-agent-ref"));
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0 &&
          rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
      };
      const selector = [
        "a[href]", "button", "input", "textarea", "select", "summary",
        "[role=button]", "[role=link]", "[role=checkbox]", "[role=menuitem]", "[contenteditable=true]"
      ].join(",");
      const elements = [...document.querySelectorAll(selector)].filter(visible).slice(0, maxElements);
      const safeHref = (el) => {
        try {
          if (!el.href || typeof el.href !== "string") return undefined;
          let url = new URL(el.href);
          const redirected = url.searchParams.get("uddg") || url.searchParams.get("q");
          if (redirected && /^https?:\/\//i.test(redirected)) url = new URL(redirected);
          const bingTarget = url.hostname.endsWith("bing.com") ? url.searchParams.get("u") : null;
          if (bingTarget?.startsWith("a1")) {
            const encoded = bingTarget.slice(2).replace(/-/g, "+").replace(/_/g, "/");
            const decoded = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "="));
            if (/^https?:\/\//i.test(decoded)) url = new URL(decoded);
          }
          return `${url.origin}${url.pathname}`.slice(0, 300);
        } catch {
          return undefined;
        }
      };
      const items = elements.map((el, index) => {
        const ref = `e${index + 1}`;
        el.setAttribute("data-agent-ref", ref);
        const isSecret = el.matches('input[type="password"], input[autocomplete="cc-number"], input[autocomplete="cc-csc"]');
        const text = (el.innerText || (isSecret ? "" : el.value) || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "")
          .replace(/\s+/g, " ").trim().slice(0, 240);
        const container = el.closest('[role="dialog"], [aria-modal="true"], dialog, article, li, [data-testid], [class*=card], [class*=item]');
        return {
          ref,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || undefined,
          ariaLabel: el.getAttribute("aria-label") || undefined,
          testId: el.getAttribute("data-testid") || undefined,
          text,
          href: safeHref(el),
          type: el.getAttribute("type") || undefined,
          disabled: "disabled" in el ? el.disabled : undefined,
          inOverlay: Boolean(el.closest('[role="dialog"], [aria-modal="true"], dialog, [class*="modal" i], [class*="popup" i], [class*="overlay" i]')),
          context: text.length < 40 ? (container?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 180) : undefined,
          checked: "checked" in el ? el.checked : undefined,
          options: el instanceof HTMLSelectElement ? [...el.options].slice(0, 30).map((option) => ({ value: option.value, text: option.text.slice(0, 100), selected: option.selected })) : undefined,
        };
      });
      const bodyText = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, maxText);
      const overlays = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, [class*="modal" i], [class*="popup" i], [class*="overlay" i]')]
        .filter(visible).slice(0, 3).map((overlay) => ({
          text: (overlay.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400),
          buttons: [...overlay.querySelectorAll("button")].filter(visible).slice(0, 8).map((button) => (button.innerText || button.getAttribute("aria-label") || "").trim()).filter(Boolean),
        }));
      return { title: document.title, url: location.href, bodyText, elements: items, overlays };
    }, { maxElements: MAX_ELEMENTS, maxText: MAX_TEXT });
    for (const element of snapshot.elements) if (element.href) this.discoveredUrls.add(element.href);
    return JSON.stringify(analyzeDom(snapshot, this.task));
  }

  navigationAllowed(target) {
    if ([...this.taskUrls].some((url) => {
      try { return new URL(url).href === target.href; } catch { return false; }
    })) return true;
    if (this.discoveredUrls.has(`${target.origin}${target.pathname}`)) return true;
    return target.pathname === "/" && !target.search && !target.hash;
  }

  async dismissPopup(action) {
    const patterns = {
      close: /close|закрыть|×|not now|не сейчас|пропустить|skip/i,
      reject: /reject|decline|отклонить|отказаться|только необходимые|пропустить/i,
      accept: /accept|agree|принять|согласен|разрешить/i,
    };
    const popup = this.page.locator([
      '[role="dialog"]:visible', '[aria-modal="true"]:visible', 'dialog:visible',
      '[class*="modal" i]:visible', '[class*="popup" i]:visible', '[class*="overlay" i]:visible',
    ].join(", ")).first();
    const scope = await popup.count() ? popup : this.page;
    const named = scope.getByRole("button", { name: patterns[action] });
    const globalNamed = this.page.getByRole("button", { name: patterns[action] });
    const button = await named.count() ? named.first()
      : await globalNamed.count() ? globalNamed.first()
      : action === "close" ? scope.locator('button[aria-label*=close i], button[title*=close i]').first() : null;
    if (!button || !await button.count()) throw new Error(`В попапе не найдена кнопка для действия ${action}`);
    await button.click({ timeout: 5000 });
    await this.settle();
    return this.observe();
  }

  async webSearch(query) {
    const engines = [
      { name: "Bing", url: `https://www.bing.com/search?q=${encodeURIComponent(query)}` },
      { name: "DuckDuckGo", url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}` },
      { name: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
    ];
    const failures = [];
    for (const engine of engines) {
      try {
        await this.page.goto(engine.url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await this.settle(3500);
        const diagnostic = await this.page.evaluate((engineOrigin) => {
          const text = (document.body?.innerText || "").toLowerCase();
          const captcha = /captcha|unusual traffic|не робот|подтвердите, что вы не робот|проверка безопасности/.test(text);
          const links = [...document.querySelectorAll('a[href]')].filter((link) => {
            try { return new URL(link.href).origin !== engineOrigin && link.getBoundingClientRect().width > 0; } catch { return false; }
          });
          const resultLinks = document.querySelectorAll('li.b_algo h2 a, .result__a, [data-testid="result"] a, #search h3 a').length;
          return { captcha, externalLinks: links.length, resultLinks };
        }, new URL(engine.url).origin);
        if (diagnostic.captcha) {
          failures.push(`${engine.name}: CAPTCHA`);
          continue;
        }
        if (diagnostic.externalLinks === 0 && diagnostic.resultLinks === 0) {
          failures.push(`${engine.name}: нет результатов`);
          continue;
        }
        return `Поиск выполнен через ${engine.name}. Открывай только href из результатов.\n${await this.observe()}`;
      } catch (error) {
        failures.push(`${engine.name}: ${String(error.message).replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
    throw new Error(JSON.stringify({ code: "SEARCH_BLOCKED", query, attempts: failures, hint: "Попроси пользователя пройти CAPTCHA вручную или предоставить URL." }));
  }

  locator(ref) {
    if (!/^e\d+$/.test(ref)) throw new Error(`Некорректная ссылка на элемент: ${ref}`);
    return this.page.locator(`[data-agent-ref="${ref}"]`).first();
  }

  async elementText(ref) {
    return (await this.locator(ref).innerText().catch(() => "")) ||
      (await this.locator(ref).getAttribute("aria-label").catch(() => "")) || "";
  }

  async elementInfo(ref) {
    return this.locator(ref).evaluate((el) => {
      const type = el.getAttribute("type") || "";
      const secret = /password/i.test(type) || /cc-number|cc-csc/i.test(el.getAttribute("autocomplete") || "");
      return {
        text: (el.innerText || (secret ? "" : el.value) || "").trim().slice(0, 300),
        ariaLabel: el.getAttribute("aria-label") || "",
        title: el.getAttribute("title") || "",
        name: el.getAttribute("name") || "",
        type,
        autocomplete: el.getAttribute("autocomplete") || "",
        href: el.href || "",
        context: (el.closest("form, li, article, [role=dialog], [data-testid], [class*=card], [class*=item]")?.innerText || el.parentElement?.innerText || "").replace(/\s+/g, " ").slice(0, 800),
      };
    });
  }

  async settle(timeout = 5000) {
    await this.page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
    await this.page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 2500) }).catch(() => {});
    await this.page.waitForFunction(() => {
      const busy = document.querySelector('[aria-busy="true"], [role="progressbar"]');
      return !busy || getComputedStyle(busy).visibility === "hidden";
    }, null, { timeout: Math.min(timeout, 2500) }).catch(() => {});
  }

  async clickNearText(text, action) {
    const matches = this.page.getByText(text, { exact: false });
    await matches.first().waitFor({ state: "attached", timeout: 10000 });
    let target = null;
    for (let index = 0; index < Math.min(await matches.count(), 20); index++) {
      const candidate = matches.nth(index);
      if (await candidate.isVisible().catch(() => false)) { target = candidate; break; }
    }
    if (!target) throw new Error(`Видимый текст карточки «${text}» не найден`);
    const card = target.locator("xpath=ancestor::*[self::article or self::li or @data-testid or contains(@class,'card') or contains(@class,'item')][1]");
    const container = await card.count() ? card : target.locator("xpath=..");
    const actionable = container.locator('button:visible:not([disabled]):not([aria-hidden="true"])');
    const buttonData = await actionable.evaluateAll((buttons) => buttons.map((button) => ({
      text: (button.innerText || "").trim(),
      aria: button.getAttribute("aria-label") || "",
      title: button.getAttribute("title") || "",
      testId: button.getAttribute("data-testid") || "",
      name: button.getAttribute("name") || "",
    })));
    const scores = buttonData.map((data) => scoreButtonForAction(data, action));
    const bestScore = Math.max(0, ...scores);
    const bestIndex = scores.indexOf(bestScore);
    if (bestScore === 0 || bestIndex < 0) {
      const available = buttonData.map((data) => data.aria || data.title || data.text || data.testId).filter(Boolean).slice(0, 8);
      throw new Error(`В карточке «${text}» не найдена активная кнопка «${action}». Доступно: ${available.join(", ") || "нет подписанных кнопок"}`);
    }
    const button = actionable.nth(bestIndex);
    const element = await button.evaluate((el) => ({
      text: (el.innerText || "").trim(), ariaLabel: el.getAttribute("aria-label") || "",
      title: el.getAttribute("title") || "", name: el.getAttribute("name") || "", type: el.getAttribute("type") || "",
      autocomplete: el.getAttribute("autocomplete") || "",
      href: el.href || "", context: (el.closest("article,li,[data-testid],[class*=card],[class*=item]")?.innerText || "").replace(/\s+/g, " ").slice(0, 800),
    }));
    const proposed = { action: "click", element, value: "" };
    if (actionNeedsApproval(proposed)) {
      const signature = describeDanger(proposed);
      if (this.deniedActions.has(signature)) return `SECURITY: действие ранее отклонено: ${signature}. Не повторяй его.\n${await this.observe()}`;
      if (!await this.approve(`Опасное внешнее действие — ${signature}`)) {
        this.deniedActions.add(signature);
        return `SECURITY: пользователь отклонил действие: ${signature}. Не повторяй его.\n${await this.observe()}`;
      }
    }
    await button.click({ timeout: 10000 });
    await this.settle();
    return this.observe();
  }

  async run(name, args) {
    await this.page.bringToFront().catch(() => {});
    if (name === "observe") return this.observe();
    if (name === "web_search") {
      const query = String(args.query || "").trim();
      if (!query) throw new Error("Пустой поисковый запрос");
      return this.webSearch(query);
    }
    if (name === "dismiss_popup") return this.dismissPopup(args.action);
    if (name === "click_near_text") return this.clickNearText(args.text, args.action);
    if (name === "take_screenshot") {
      const directory = path.resolve("artifacts", "screenshots");
      await fs.mkdir(directory, { recursive: true });
      const filename = path.join(directory, `screenshot-${Date.now()}.png`);
      await this.page.screenshot({ path: filename, fullPage: false });
      this.latestScreenshot = filename;
      return `Снимок сохранён: ${filename}\n${await this.observe()}`;
    }
    if (name === "navigate") {
      const target = new URL(args.url);
      if (!ALLOWED_PROTOCOLS.has(target.protocol)) throw new Error(`Запрещённый протокол URL: ${target.protocol}`);
      if (!this.navigationAllowed(target)) throw new Error(JSON.stringify({ code: "UNTRUSTED_URL", url: target.href, hint: "Открывай только URL из задачи или href текущего снимка; новый сайт можно открыть только с корневого URL." }));
      await this.page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30000 });
      return this.observe();
    }
    if (name === "back") {
      await this.page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      return this.observe();
    }
    if (name === "scroll") {
      await this.page.mouse.wheel(0, args.delta ?? 700);
      await this.page.waitForTimeout(400);
      return this.observe();
    }
    if (name === "wait") {
      await this.page.waitForTimeout(Math.min(args.ms ?? 1000, 10000));
      await this.settle();
      return this.observe();
    }
    if (["click", "type", "press", "select"].includes(name)) {
      const locator = this.locator(args.ref);
      const handle = await locator.elementHandle({ timeout: 10000 });
      if (!handle) throw new Error(`Элемент ${args.ref} больше не существует`);
      const element = await this.elementInfo(args.ref);
      const proposed = { action: name, element, value: args.text || args.key || args.value || "" };
      if (actionNeedsApproval(proposed)) {
        const signature = describeDanger(proposed);
        if (this.deniedActions.has(signature)) {
          return `SECURITY: действие ранее отклонено и заблокировано до следующей задачи: ${signature}. Не повторяй его.\n${await this.observe()}`;
        }
        const allowed = await this.approve(`Опасное внешнее действие — ${signature}`);
        if (!allowed) {
          this.deniedActions.add(signature);
          return `SECURITY: пользователь отклонил действие: ${signature}. Не повторяй его.\n${await this.observe()}`;
        }
      }
      if (name === "click") {
        try {
          await locator.click({ trial: true, timeout: 3000 });
          await handle.click({ timeout: 10000 });
        } catch (error) {
          const obstruction = await locator.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
            const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
            const top = document.elementFromPoint(x, y);
            if (!top || top === el || el.contains(top)) return null;
            return { tag: top.tagName.toLowerCase(), text: (top.innerText || top.getAttribute("aria-label") || "").replace(/\s+/g, " ").slice(0, 200), className: String(top.className || "").slice(0, 200) };
          }).catch(() => null);
          if (element.href && /^https?:/i.test(element.href)) {
            const target = new URL(element.href, this.page.url());
            if (this.navigationAllowed(target)) {
              await this.page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30000 });
              await this.settle();
              return this.observe();
            }
          }
          throw new Error(JSON.stringify({ code: "CLICK_BLOCKED", ref: args.ref, obstruction, hint: "Не повторяй этот ref. Сделай observe/take_screenshot или используй click_near_text.", playwright: error.message.slice(0, 700) }));
        }
      }
      if (name === "type") await handle.fill(args.text);
      if (name === "press") await handle.press(args.key);
      if (name === "select") {
        const selected = await handle.selectOption({ value: args.value }).catch(() => handle.selectOption({ label: args.value }));
        if (!selected.length) throw new Error(`Опция не найдена: ${args.value}`);
      }
      await this.page.waitForTimeout(300);
      await this.settle();
      return this.observe();
    }
    throw new Error(`Неизвестный инструмент: ${name}`);
  }
}
