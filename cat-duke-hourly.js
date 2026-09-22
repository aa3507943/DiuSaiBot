const { chromium } = require("playwright");

/* =========================================================
   CONFIG
========================================================= */

const URL =
  "https://mabinogi-cat-duke-guild-a9aeb3.gitlab.io/";

const USER_NAME = "菜阿嘎吸粉絲血";

// 要丟的人
const TARGET_NAME =
  process.env.TARGET_NAME || "山大王";

// 要丟的東西
const ITEM_NAME = "貓黃金";
const ITEM_EMOJI = "💩";

const PIN = process.env.CAT_DUKE_PIN;

// 一次丟幾次
const MAX_PER_RUN = Number(
  process.env.THROW_COUNT || "1"
);

// 每次丟東西之間的間隔
// 預設 1000ms = 1 秒
const CLICK_GAP_MS = Number(
  process.env.CLICK_GAP_MS || "1000"
);

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

/* =========================================================
   CONFIG CHECK
========================================================= */

if (!PIN || !/^\d{6}$/.test(PIN)) {
  console.error(
    "缺少 CAT_DUKE_PIN，或 PIN 不是 6 位數"
  );

  process.exit(1);
}

if (
  !Number.isInteger(MAX_PER_RUN) ||
  MAX_PER_RUN < 1 ||
  MAX_PER_RUN > 100
) {
  console.error(
    "THROW_COUNT 必須是 1～100 的整數"
  );

  process.exit(1);
}

if (
  !Number.isFinite(CLICK_GAP_MS) ||
  CLICK_GAP_MS < 100
) {
  console.error(
    "CLICK_GAP_MS 不可小於 100"
  );

  process.exit(1);
}

/* =========================================================
   SCREENSHOT
========================================================= */

async function safeScreenshot(
  page,
  filename
) {
  try {
    await page.screenshot({
      path: filename,
      fullPage: true,
    });
  } catch (error) {
    console.warn(
      `截圖失敗 ${filename}:`,
      error.message
    );
  }
}

/* =========================================================
   LOGIN
========================================================= */

async function login(page) {
  console.log("開啟網站...");

  await page.goto(URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(1200);

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

  console.log(
    `選擇角色：${USER_NAME}`
  );

  const select =
    page.locator("select").first();

  await select.waitFor({
    state: "visible",
    timeout: 5000,
  });

  await select.selectOption({
    label: USER_NAME,
  });

  console.log("輸入 PIN...");

  const inputs =
    page.locator("input");

  let pinInput = null;

  const count =
    await inputs.count();

  for (let i = 0; i < count; i++) {
    const input =
      inputs.nth(i);

    if (
      !(await input
        .isVisible()
        .catch(() => false))
    ) {
      continue;
    }

    const type =
      (await input.getAttribute("type")) ||
      "";

    const placeholder =
      (await input.getAttribute(
        "placeholder"
      )) || "";

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

    if (
      (await visibleInputs.count()) === 0
    ) {
      throw new Error(
        "找不到 PIN 輸入欄位"
      );
    }

    pinInput =
      visibleInputs.last();
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

  console.log("登入流程完成");
}

/* =========================================================
   找可見的「丟東西」
========================================================= */

async function getThrowControls(page) {
  return await page.evaluate(() => {
    const forbidden =
      new Set([
        "SCRIPT",
        "STYLE",
        "PRE",
        "CODE",
      ]);

    const all = [
      ...document.querySelectorAll(
        "body *"
      ),
    ];

    const matches = [];

    for (const el of all) {
      if (
        forbidden.has(el.tagName)
      ) {
        continue;
      }

      const text =
        (el.textContent || "").trim();

      if (text !== "丟東西") {
        continue;
      }

      const rect =
        el.getBoundingClientRect();

      const style =
        getComputedStyle(el);

      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        style.display === "none" ||
        style.visibility ===
          "hidden" ||
        Number(style.opacity || 1) ===
          0
      ) {
        continue;
      }

      matches.push({
        tag: el.tagName,

        id:
          el.id || "",

        className:
          typeof el.className ===
          "string"
            ? el.className
            : "",

        role:
          el.getAttribute("role") ||
          "",

        x:
          rect.left +
          rect.width / 2,

        y:
          rect.top +
          rect.height / 2,

        width:
          rect.width,

        height:
          rect.height,

        html:
          el.outerHTML.slice(
            0,
            1000
          ),
      });
    }

    return matches;
  });
}

/* =========================================================
   OPEN TARGET
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
   * SVG 可能還在 layout
   *
   * 30 × 500ms = 最多等 15 秒
   */
  for (
    let attempt = 1;
    attempt <= 30;
    attempt++
  ) {
    point =
      await targetText.evaluate(
        (textEl) => {
          const group =
            textEl.closest("g");

          if (!group) {
            return null;
          }

          const candidates = [
            group.querySelector(
              "image"
            ),

            group.querySelector(
              "circle"
            ),

            textEl,

            group,
          ].filter(Boolean);

          for (
            const el of candidates
          ) {
            const rect =
              el.getBoundingClientRect();

            if (
              rect.width > 2 &&
              rect.height > 2 &&
              Number.isFinite(
                rect.left
              ) &&
              Number.isFinite(
                rect.top
              )
            ) {
              return {
                tag:
                  el.tagName,

                x:
                  rect.left +
                  rect.width / 2,

                y:
                  rect.top +
                  rect.height / 2,

                width:
                  rect.width,

                height:
                  rect.height,
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

    await page.waitForTimeout(
      500
    );
  }

  if (!point) {
    await safeScreenshot(
      page,
      "target-coordinate-error.png"
    );

    throw new Error(
      `${TARGET_NAME} 找到了，但沒有有效頭像座標`
    );
  }

  console.log(
    `目標元素=${point.tag}, ` +
      `x=${point.x.toFixed(1)}, ` +
      `y=${point.y.toFixed(1)}, ` +
      `w=${point.width.toFixed(
        1
      )}, ` +
      `h=${point.height.toFixed(
        1
      )}`
  );

  /*
   * 真實 mouse interaction
   *
   * 不用 locator.click()
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
   * 不能再用
   *
   * bodyText.includes("丟東西")
   *
   * 因為 script 裡本身也有此字串。
   */
  let controls = [];

  for (
    let attempt = 1;
    attempt <= 15;
    attempt++
  ) {
    await page.waitForTimeout(
      300
    );

    controls =
      await getThrowControls(
        page
      );

    if (
      controls.length > 0
    ) {
      console.log(
        "✅ 目標操作面板已真正開啟"
      );

      return;
    }
  }

  await safeScreenshot(
    page,
    "after-target-click.png"
  );

  throw new Error(
    `點擊 ${TARGET_NAME} 後沒有出現真正的「丟東西」控制項`
  );
}

/* =========================================================
   OPEN THROW PANEL
========================================================= */

async function openThrowPanel(page) {
  console.log(
    '尋找真正的「丟東西」控制項...'
  );

  await page.waitForTimeout(500);

  let controls =
    await getThrowControls(page);

  if (
    controls.length === 0
  ) {
    throw new Error(
      "找不到真正可見的「丟東西」"
    );
  }

  console.log(
    `找到 ${controls.length} 個「丟東西」候選元素`
  );

  for (
    const control of controls
  ) {
    console.log(
      `候選：tag=${control.tag}, ` +
        `id=${control.id}, ` +
        `class=${control.className}, ` +
        `role=${control.role}`
    );
  }

  /*
   * 最小的可見元素通常是實際 tab/button，
   * 而不是包住整區的父元素。
   */
  controls.sort(
    (a, b) =>
      a.width * a.height -
      b.width * b.height
  );

  const target =
    controls[0];

  console.log(
    `點擊「丟東西」：` +
      `x=${target.x.toFixed(
        1
      )}, ` +
      `y=${target.y.toFixed(
        1
      )}`
  );

  await page.mouse.move(
    target.x,
    target.y
  );

  await page.waitForTimeout(100);

  await page.mouse.down();

  await page.waitForTimeout(80);

  await page.mouse.up();

  console.log(
    '已實際點擊「丟東西」'
  );

  /*
   * 等道具 UI 展開
   */
  await page.waitForTimeout(
    1200
  );
}

/* =========================================================
   FIND CAT GOLD
========================================================= */

async function findCatGold(page) {
  const matches =
    await page.evaluate(
      ({
        itemName,
        emoji,
      }) => {
        const forbidden =
          new Set([
            "SCRIPT",
            "STYLE",
            "PRE",
            "CODE",
          ]);

        const all = [
          ...document.querySelectorAll(
            "body *"
          ),
        ];

        const result = [];

        for (const el of all) {
          if (
            forbidden.has(
              el.tagName
            )
          ) {
            continue;
          }

          const rect =
            el.getBoundingClientRect();

          const style =
            getComputedStyle(el);

          if (
            rect.width <= 0 ||
            rect.height <= 0 ||
            style.display ===
              "none" ||
            style.visibility ===
              "hidden" ||
            Number(
              style.opacity || 1
            ) === 0
          ) {
            continue;
          }

          const text =
            (
              el.textContent || ""
            ).trim();

          const title =
            el.getAttribute(
              "title"
            ) || "";

          const aria =
            el.getAttribute(
              "aria-label"
            ) || "";

          const alt =
            el.getAttribute(
              "alt"
            ) || "";

          const dataItem =
            el.getAttribute(
              "data-item"
            ) || "";

          const dataName =
            el.getAttribute(
              "data-name"
            ) || "";

          const nameFound =
            title.includes(
              itemName
            ) ||
            aria.includes(
              itemName
            ) ||
            alt.includes(
              itemName
            ) ||
            dataItem.includes(
              itemName
            ) ||
            dataName.includes(
              itemName
            );

          /*
           * 貓黃金目前定義是：
           *
           * {id:'貓黃金', e:'💩'}
           *
           * 所以 UI 可能只有 💩
           */
          const emojiFound =
            text === emoji ||
            text ===
              `${emoji}${itemName}` ||
            text ===
              `${emoji} ${itemName}`;

          if (
            !nameFound &&
            !emojiFound
          ) {
            continue;
          }

          result.push({
            tag:
              el.tagName,

            id:
              el.id || "",

            className:
              typeof el.className ===
              "string"
                ? el.className
                : "",

            text,

            title,

            aria,

            alt,

            dataItem,

            dataName,

            named:
              nameFound,

            x:
              rect.left +
              rect.width / 2,

            y:
              rect.top +
              rect.height / 2,

            width:
              rect.width,

            height:
              rect.height,

            html:
              el.outerHTML.slice(
                0,
                1500
              ),
          });
        }

        return result;
      },

      {
        itemName:
          ITEM_NAME,

        emoji:
          ITEM_EMOJI,
      }
    );

  if (
    matches.length === 0
  ) {
    return null;
  }

  /*
   * 排序：
   *
   * 1. 有明確「貓黃金」名稱的優先
   * 2. 元素面積較小優先
   *
   * 可避免誤點到包含 💩 的大父容器
   */
  matches.sort((a, b) => {
    if (
      a.named !== b.named
    ) {
      return a.named
        ? -1
        : 1;
    }

    return (
      a.width *
        a.height -
      b.width *
        b.height
    );
  });

  return {
    selected:
      matches[0],

    all:
      matches,
  };
}

/* =========================================================
   WAIT FOR CAT GOLD
========================================================= */

async function waitForCatGold(page) {
  console.log(
    `尋找道具：${ITEM_NAME}`
  );

  for (
    let attempt = 1;
    attempt <= 20;
    attempt++
  ) {
    const result =
      await findCatGold(page);

    if (
      result &&
      result.selected
    ) {
      console.log(
        `✅ 找到 ${ITEM_NAME}`
      );

      const item =
        result.selected;

      console.log(
        `tag=${item.tag}, ` +
          `text="${item.text}", ` +
          `title="${item.title}", ` +
          `aria="${item.aria}"`
      );

      console.log(
        item.html
      );

      return item;
    }

    console.log(
      `第 ${attempt} 次尚未找到 ${ITEM_NAME}，等待道具面板...`
    );

    await page.waitForTimeout(
      500
    );
  }

  await safeScreenshot(
    page,
    "throw-panel.png"
  );

  throw new Error(
    `丟東西面板已開，但找不到 ${ITEM_NAME}`
  );
}

/* =========================================================
   THROW ITEMS
========================================================= */

async function throwItems(page) {
  /*
   * 第一次先確認道具真的存在
   */
  let item =
    await waitForCatGold(page);

  console.log(
    `準備丟 ${MAX_PER_RUN} 次 ${ITEM_NAME}`
  );

  console.log(
    `點擊間隔 ${CLICK_GAP_MS} ms`
  );

  let successCount = 0;

  for (
    let i = 0;
    i < MAX_PER_RUN;
    i++
  ) {
    try {
      /*
       * 每次點擊前重新取得座標。
       *
       * 因為有些 UI 點完後 DOM
       * 可能重新 render。
       */
      if (i > 0) {
        const result =
          await findCatGold(
            page
          );

        if (
          !result ||
          !result.selected
        ) {
          console.log(
            `第 ${
              i + 1
            } 次前重新尋找 ${ITEM_NAME}`
          );

          item =
            await waitForCatGold(
              page
            );
        } else {
          item =
            result.selected;
        }
      }

      await page.mouse.move(
        item.x,
        item.y
      );

      await page.waitForTimeout(
        80
      );

      await page.mouse.down();

      await page.waitForTimeout(
        60
      );

      await page.mouse.up();

      successCount++;

      console.log(
        `已丟 ${successCount}/${MAX_PER_RUN}`
      );

      /*
       * 每次丟東西之間等待
       */
      if (
        successCount <
        MAX_PER_RUN
      ) {
        await sleep(
          CLICK_GAP_MS
        );
      }
    } catch (error) {
      console.error(
        `第 ${
          i + 1
        } 次點擊失敗：${error.message}`
      );

      await safeScreenshot(
        page,
        "throw-error.png"
      );

      throw error;
    }
  }

  console.log(
    `✅ 完成，本次共執行 ${successCount} 次`
  );
}

/* =========================================================
   MAIN
========================================================= */

(async () => {
  console.log(
    `本次預計丟 ${MAX_PER_RUN} 次`
  );

  console.log(
    `目標：${TARGET_NAME}`
  );

  console.log(
    `道具：${ITEM_NAME}`
  );

  console.log(
    `間隔：${CLICK_GAP_MS} ms`
  );

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
    await login(page);

    await openTarget(page);

    await openThrowPanel(page);

    await throwItems(page);

    console.log(
      "✅ 任務完成"
    );
  } catch (error) {
    console.error(
      "❌ 執行失敗："
    );

    console.error(error);

    await safeScreenshot(
      page,
      "error.png"
    );

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();