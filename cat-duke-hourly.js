const { chromium } = require("playwright");

const URL =
  "https://mabinogi-cat-duke-guild-a9aeb3.gitlab.io/";

const USER_NAME = "菜阿嘎吸粉絲血";
const TARGET_NAME = "兜裡有奶糖";
const ITEM_NAME = "貓黃金";

const PIN = process.env.CAT_DUKE_PIN;

// 測試時 GitHub Actions 可設成 1
// 正式版改成 100
const MAX_PER_RUN = Number(
  process.env.THROW_COUNT || "2"
);

const CLICK_GAP_MS = 120;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* =========================================================
   基本檢查
========================================================= */

if (!PIN || !/^\d{6}$/.test(PIN)) {
  console.error(
    "缺少 CAT_DUKE_PIN，或 PIN 不是 6 位數。"
  );

  process.exit(1);
}

if (
  !Number.isInteger(MAX_PER_RUN) ||
  MAX_PER_RUN < 1 ||
  MAX_PER_RUN > 100
) {
  console.error(
    "THROW_COUNT 必須是 1～100 的整數。"
  );

  process.exit(1);
}

/* =========================================================
   登入
========================================================= */

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

  const inputCount = await inputs.count();

  for (let i = 0; i < inputCount; i++) {
    const input = inputs.nth(i);

    if (
      !(await input
        .isVisible()
        .catch(() => false))
    ) {
      continue;
    }

    const type =
      (await input.getAttribute("type")) || "";

    const placeholder =
      (await input.getAttribute("placeholder")) ||
      "";

    if (
      type === "password" ||
      placeholder
        .toLowerCase()
        .includes("pin") ||
      placeholder.includes("6")
    ) {
      pinInput = input;
      break;
    }
  }

  if (!pinInput) {
    const visibleInputs =
      page.locator("input:visible");

    if (!(await visibleInputs.count())) {
      throw new Error(
        "找不到 PIN 輸入欄位"
      );
    }

    pinInput = visibleInputs.last();
  }

  await pinInput.fill(PIN);

  console.log("送出登入...");

  const loginButtons =
    page.getByRole("button", {
      name: "登入",
      exact: true,
    });

  await loginButtons.last().click();

  await page.waitForTimeout(1500);

  const bodyText =
    await page.locator("body").innerText();

  if (
    !bodyText.includes(
      `歡迎回來，${USER_NAME}`
    )
  ) {
    console.log(
      "⚠️ 沒找到歡迎訊息，但先繼續執行"
    );
  }

  console.log("登入流程完成");
}

/* =========================================================
   點擊「兜裡有奶糖」
========================================================= */

async function openTarget(page) {
  console.log(
    `尋找目標：${TARGET_NAME}`
  );

  const targetText = page
    .locator("text.name")
    .filter({
      hasText: TARGET_NAME,
    })
    .first();

  await targetText.waitFor({
    state: "attached",
    timeout: 15000,
  });

  console.log(
    `找到目標文字：${TARGET_NAME}`
  );

  let point = null;

  /*
   * GitHub runner 有時 SVG 還在 layout。
   *
   * 最多重試 30 次：
   * 30 × 500ms = 15 秒
   */
  for (
    let attempt = 1;
    attempt <= 30;
    attempt++
  ) {
    point = await targetText.evaluate(
      (textEl) => {
        const group =
          textEl.closest("g");

        if (!group) {
          return null;
        }

        /*
         * 優先順序：
         *
         * image
         * circle
         * text
         * group
         */
        const candidates = [
          group.querySelector("image"),
          group.querySelector("circle"),
          textEl,
          group,
        ].filter(Boolean);

        for (const el of candidates) {
          const rect =
            el.getBoundingClientRect();

          if (
            rect &&
            rect.width > 2 &&
            rect.height > 2 &&
            Number.isFinite(rect.left) &&
            Number.isFinite(rect.top)
          ) {
            return {
              x:
                rect.left +
                rect.width / 2,

              y:
                rect.top +
                rect.height / 2,

              width: rect.width,

              height: rect.height,

              tag: el.tagName,
            };
          }
        }

        return null;
      }
    );

    if (point) {
      console.log(
        `第 ${attempt} 次取得有效座標`
      );

      break;
    }

    console.log(
      `第 ${attempt} 次尚未取得有效座標，等待 SVG layout...`
    );

    await page.waitForTimeout(500);
  }

  if (!point) {
    await page.screenshot({
      path:
        "target-coordinate-error.png",

      fullPage: true,
    });

    throw new Error(
      `${TARGET_NAME} 已存在，但等待後仍沒有有效點擊座標`
    );
  }

  console.log(
    `目標元素=${point.tag}, ` +
      `x=${point.x.toFixed(1)}, ` +
      `y=${point.y.toFixed(1)}, ` +
      `w=${point.width.toFixed(1)}, ` +
      `h=${point.height.toFixed(1)}`
  );

  /*
   * 不用 locator.click()
   *
   * 因為 SVG node 一直移動，
   * Playwright 會認為 unstable。
   */
  await page.mouse.move(
    point.x,
    point.y
  );

  await page.waitForTimeout(100);

  await page.mouse.down();

  await page.waitForTimeout(80);

  await page.mouse.up();

  console.log(
    `已實際點擊 ${TARGET_NAME} 頭像`
  );

  /*
   * 等右側面板出現
   */
  let panelOpened = false;

  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(300);

    const bodyText =
      await page
        .locator("body")
        .innerText();

    if (
      bodyText.includes("丟東西")
    ) {
      panelOpened = true;
      break;
    }
  }

  if (!panelOpened) {
    await page.screenshot({
      path:
        "after-target-click.png",

      fullPage: true,
    });

    throw new Error(
      "已點擊目標，但右側操作面板沒有正常開啟"
    );
  }

  console.log(
    "✅ 目標面板已成功開啟"
  );
}

/* =========================================================
   打開「丟東西」
========================================================= */

async function openThrowPanel(page) {
  console.log(
    "尋找「丟東西」..."
  );

  const throwControl = page
    .getByText("丟東西", {
      exact: false,
    })
    .first();

  await throwControl.waitFor({
    state: "visible",
    timeout: 8000,
  });

  console.log(
    "找到「丟東西」"
  );

  /*
   * force 是因為 UI 可能有動畫。
   */
  await throwControl.click({
    force: true,
  });

  console.log(
    "已點擊「丟東西」"
  );

  /*
   * 等道具 UI 展開
   */
  await page.waitForTimeout(1200);
}

/* =========================================================
   尋找「貓黃金」
========================================================= */

async function findCatGold(page) {
  console.log(
    `尋找道具：${ITEM_NAME}`
  );

  /*
   * 可能的 DOM 形式都試一次。
   */
  const candidates = [
    /*
     * Button accessible name
     */
    page
      .getByRole("button", {
        name: /貓黃金/,
      })
      .first(),

    /*
     * title
     */
    page
      .locator(
        '[title*="貓黃金"]'
      )
      .first(),

    /*
     * aria-label
     */
    page
      .locator(
        '[aria-label*="貓黃金"]'
      )
      .first(),

    /*
     * alt
     */
    page
      .locator(
        'img[alt*="貓黃金"]'
      )
      .first(),

    /*
     * data-name
     */
    page
      .locator(
        '[data-name*="貓黃金"]'
      )
      .first(),

    /*
     * data-item
     */
    page
      .locator(
        '[data-item*="貓黃金"]'
      )
      .first(),

    /*
     * 部分文字
     *
     * 可匹配：
     * 💩貓黃金
     * 💩 貓黃金
     */
    page
      .getByText("貓黃金", {
        exact: false,
      })
      .first(),
  ];

  for (
    let attempt = 1;
    attempt <= 10;
    attempt++
  ) {
    for (
      let i = 0;
      i < candidates.length;
      i++
    ) {
      const locator =
        candidates[i];

      try {
        if (
          (await locator.count()) >
            0 &&
          (await locator
            .isVisible()
            .catch(() => false))
        ) {
          console.log(
            `✅ 找到貓黃金，selector #${
              i + 1
            }`
          );

          return locator;
        }
      } catch {
        // 繼續找下一個
      }
    }

    console.log(
      `第 ${attempt} 次尚未找到貓黃金，等待道具面板...`
    );

    await page.waitForTimeout(500);
  }

  /*
   * 找不到就輸出完整 debug
   */
  console.log(
    "❌ 找不到貓黃金，開始輸出診斷資訊"
  );

  const buttons =
    await page
      .locator("button")
      .allTextContents();

  console.log("BUTTONS:");
  console.log(buttons);

  const bodyText =
    await page
      .locator("body")
      .innerText();

  console.log("BODY TEXT:");
  console.log(bodyText);

  const html =
    await page
      .locator("body")
      .innerHTML();

  const keywords = [
    "貓黃金",
    "黃金",
    "💩",
    "throw",
    "item",
  ];

  console.log(
    "搜尋可能的道具 HTML:"
  );

  for (
    const keyword of keywords
  ) {
    const index =
      html.indexOf(keyword);

    console.log(
      `KEYWORD [${keyword}] index=${index}`
    );

    if (index >= 0) {
      console.log(
        html.slice(
          Math.max(
            0,
            index - 1000
          ),

          Math.min(
            html.length,
            index + 2500
          )
        )
      );
    }
  }

  await page.screenshot({
    path: "throw-panel.png",
    fullPage: true,
  });

  throw new Error(
    "找不到貓黃金，道具面板 DOM 已輸出"
  );
}

/* =========================================================
   丟東西
========================================================= */

async function throwItems(page) {
  const item =
    await findCatGold(page);

  console.log(
    `準備丟 ${MAX_PER_RUN} 次 ${ITEM_NAME}`
  );

  let successCount = 0;

  for (
    let i = 0;
    i < MAX_PER_RUN;
    i++
  ) {
    try {
      /*
       * 先嘗試 Playwright click
       */
      await item.click({
        force: true,
        timeout: 3000,
      });

      successCount++;

      console.log(
        `已丟 ${successCount}/${MAX_PER_RUN}`
      );

      await sleep(
        CLICK_GAP_MS
      );
    } catch (error) {
      console.error(
        `第 ${
          i + 1
        } 次點擊失敗：${error.message}`
      );

      /*
       * 截圖保存現場
       */
      await page
        .screenshot({
          path:
            "throw-error.png",

          fullPage: true,
        })
        .catch(() => {});

      break;
    }
  }

  console.log(
    `完成，本次共執行 ${successCount} 次`
  );

  if (
    successCount === 0
  ) {
    throw new Error(
      "貓黃金一次都沒有成功點擊"
    );
  }
}

/* =========================================================
   MAIN
========================================================= */

(async () => {
  const browser =
    await chromium.launch({
      headless: true,
    });

  const context =
    await browser.newContext({
      viewport: {
        width: 1440,
        height: 1000,
      },
    });

  const page =
    await context.newPage();

  try {
    console.log(
      `本次預計丟 ${MAX_PER_RUN} 次`
    );

    await login(page);

    await openTarget(page);

    await openThrowPanel(page);

    await throwItems(page);

    console.log("✅ 任務完成");
  } catch (error) {
    console.error(
      "❌ 執行失敗："
    );

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