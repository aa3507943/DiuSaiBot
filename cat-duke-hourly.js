const { chromium } = require("playwright");

const URL = "https://mabinogi-cat-duke-guild-a9aeb3.gitlab.io/";
const USER_NAME = "菜阿嘎吸粉絲血";
const TARGET_NAME = "兜裡有奶糖";
const ITEM_NAME = "貓黃金";

const PIN = process.env.CAT_DUKE_PIN;

const MAX_PER_RUN = 1;
const CLICK_GAP_MS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!PIN || !/^\d{6}$/.test(PIN)) {
  console.error("缺少 CAT_DUKE_PIN，或 PIN 不是 6 位數。");
  process.exit(1);
}

async function clickVisibleText(page, text) {
  const candidates = [
    page.getByRole("button", { name: text, exact: true }),
    page.getByText(text, { exact: true }),
  ];

  for (const locator of candidates) {
    if (await locator.count()) {
      const first = locator.first();

      if (await first.isVisible().catch(() => false)) {
        await first.click();
        return true;
      }
    }
  }

  return false;
}

async function login(page) {
  console.log("開啟網站...");
  await page.goto(URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(1000);

  console.log("點擊登入...");
  const loginButton = page
    .getByRole("button", {
      name: "登入",
      exact: true,
    })
    .first();

  await loginButton.waitFor({
    state: "visible",
    timeout: 10000,
  });

  await loginButton.click();

  await page.waitForTimeout(500);

  console.log(`選擇角色：${USER_NAME}`);

  const select = page.locator("select").first();

  await select.waitFor({
    state: "visible",
    timeout: 5000,
  });

  await select.selectOption({
    label: USER_NAME,
  });

  console.log("輸入 PIN...");

  const inputs = page.locator("input");

  let pinInput = null;

  for (let i = 0; i < (await inputs.count()); i++) {
    const input = inputs.nth(i);

    if (!(await input.isVisible().catch(() => false))) {
      continue;
    }

    const type = (await input.getAttribute("type")) || "";
    const placeholder =
      (await input.getAttribute("placeholder")) || "";

    if (
      type === "password" ||
      placeholder.toLowerCase().includes("pin") ||
      placeholder.includes("6")
    ) {
      pinInput = input;
      break;
    }
  }

  if (!pinInput) {
    const visibleInputs = page.locator("input:visible");

    if (!(await visibleInputs.count())) {
      throw new Error("找不到 PIN 輸入框");
    }

    pinInput = visibleInputs.last();
  }

  await pinInput.fill(PIN);

  console.log("送出登入...");

  const loginButtons = page.getByRole("button", {
    name: "登入",
    exact: true,
  });

  await loginButtons.last().click();

  await page.waitForTimeout(1500);

  console.log("登入流程完成");
}

async function openTarget(page) {
  console.log(`尋找目標：${TARGET_NAME}`);

  const target = page
    .locator("text.name")
    .filter({ hasText: TARGET_NAME })
    .first();

  await target.waitFor({
    state: "attached",
    timeout: 15000,
  });

  console.log(`找到目標：${TARGET_NAME}`);

  await target.evaluate((el) => {
    // 關係圖通常把 click listener 掛在外層 <g>
    const node = el.closest("g") || el;

    node.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
      })
    );
  });

  console.log(`已點擊：${TARGET_NAME}`);

  await page.waitForTimeout(1000);
}

async function openThrowPanel(page) {
  console.log("開啟「丟東西」...");

  const success = await clickVisibleText(page, "丟東西");

  if (!success) {
    throw new Error("找不到「丟東西」");
  }

  await page.waitForTimeout(500);
}

async function throwItems(page) {
  console.log(`尋找道具：${ITEM_NAME}`);

  let item = page
    .getByRole("button", {
      name: ITEM_NAME,
      exact: true,
    })
    .first();

  if (
    !(await item.count()) ||
    !(await item.isVisible().catch(() => false))
  ) {
    item = page
      .getByText(ITEM_NAME, {
        exact: true,
      })
      .first();
  }

  await item.waitFor({
    state: "visible",
    timeout: 10000,
  });

  console.log(`開始連點 ${ITEM_NAME}`);

  let successCount = 0;

  for (let i = 0; i < MAX_PER_RUN; i++) {
    try {
      await item.click({
        timeout: 3000,
      });

      successCount++;

      console.log(
        `已丟 ${successCount}/${MAX_PER_RUN}`
      );

      await sleep(CLICK_GAP_MS);
    } catch (error) {
      console.error(
        `第 ${i + 1} 次點擊失敗：${error.message}`
      );

      break;
    }
  }

  console.log(
    `完成，本次共執行 ${successCount} 次`
  );
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 1000,
    },
  });

  const page = await context.newPage();

  try {
    await login(page);

    await openTarget(page);

    await openThrowPanel(page);

    await throwItems(page);

    console.log("任務完成");
  } catch (error) {
    console.error("執行失敗：");
    console.error(error);

    await page
      .screenshot({
        path: "error.png",
        fullPage: true,
      })
      .catch(() => {});

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();