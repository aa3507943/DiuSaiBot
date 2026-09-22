const { chromium } = require("playwright");

const URL = "https://mabinogi-cat-duke-guild-a9aeb3.gitlab.io/";
const USER_NAME = "菜阿嘎吸粉絲血";
const TARGET_NAME = "兜裡有奶糖";
const ITEM_NAME = "貓黃金";

const PIN = process.env.CAT_DUKE_PIN;

const MAX_PER_RUN = 99;
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

  const targetText = page
    .locator("text.name")
    .filter({ hasText: TARGET_NAME })
    .first();

  await targetText.waitFor({
    state: "attached",
    timeout: 15000,
  });

  console.log(`找到目標文字：${TARGET_NAME}`);

  const point = await targetText.evaluate((textEl) => {
    const group = textEl.closest("g");

    if (!group) {
      throw new Error("找不到目標所屬的 SVG group");
    }

    // 優先找頭像 image
    let clickable = group.querySelector("image");

    // 沒有 image 就找 circle
    if (!clickable) {
      clickable = group.querySelector("circle");
    }

    // 再沒有就直接用 group
    if (!clickable) {
      clickable = group;
    }

    const rect = clickable.getBoundingClientRect();

    if (!rect || rect.width === 0 || rect.height === 0) {
      throw new Error("目標頭像沒有有效座標");
    }

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      tag: clickable.tagName,
    };
  });

  console.log(
    `目標元素=${point.tag}, x=${point.x.toFixed(1)}, y=${point.y.toFixed(1)}, ` +
    `w=${point.width.toFixed(1)}, h=${point.height.toFixed(1)}`
  );

  await page.mouse.move(point.x, point.y);

  await page.waitForTimeout(100);

  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();

  console.log(`已實際點擊 ${TARGET_NAME} 頭像`);

  await page.waitForTimeout(1200);

  const bodyText = await page.locator("body").innerText();

  if (bodyText.includes("丟東西")) {
    console.log("✅ 目標面板已成功開啟");
  } else {
    console.log("⚠️ 點擊後仍未看到「丟東西」");

    await page.screenshot({
      path: "after-target-click.png",
      fullPage: true,
    });

    throw new Error("點擊目標後，右側操作面板沒有開啟");
  }
}

async function openThrowPanel(page) {
  console.log("尋找「丟東西」...");

  await page.waitForTimeout(500);

  const throwControl = page
    .getByText("丟東西", {
      exact: false,
    })
    .first();

  try {
    await throwControl.waitFor({
      state: "visible",
      timeout: 5000,
    });

    console.log("找到「丟東西」");

    await throwControl.click({
      force: true,
    });

    console.log("已點擊「丟東西」");

    await page.waitForTimeout(700);
  } catch (error) {
    console.log("找不到「丟東西」，輸出診斷資料...");

    console.log(
      await page.locator("body").innerText()
    );

    await page.screenshot({
      path: "after-target-click.png",
      fullPage: true,
    });

    throw new Error("目標人物面板沒有正常開啟");
  }
}


async function throwItems(page) {
  console.log("檢查「丟東西」面板內容...");

  await page.waitForTimeout(1500);

  const buttons = await page.locator("button").allTextContents();
  console.log("BUTTONS:");
  console.log(buttons);

  const bodyText = await page.locator("body").innerText();
  console.log("BODY TEXT:");
  console.log(bodyText);

  const html = await page.locator("body").innerHTML();

  console.log("搜尋可能的道具相關 HTML:");

  const keywords = [
    "貓黃金",
    "黃金",
    "💩",
    "throw",
    "item",
  ];

  for (const keyword of keywords) {
    const index = html.indexOf(keyword);

    console.log(`KEYWORD [${keyword}] index=${index}`);

    if (index >= 0) {
      console.log(
        html.slice(
          Math.max(0, index - 1000),
          Math.min(html.length, index + 2000)
        )
      );
    }
  }

  await page.screenshot({
    path: "throw-panel.png",
    fullPage: true,
  });

  throw new Error("DEBUG: 已輸出丟東西面板 DOM");
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