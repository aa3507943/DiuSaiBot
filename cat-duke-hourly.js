const { chromium } = require("playwright");

/* =========================================================
   CONFIG
========================================================= */

const URL =
  "https://mabinogi-cat-duke-guild-a9aeb3.gitlab.io/";

const USER_NAME =
  "菜阿嘎吸粉絲血";

const PIN =
  process.env.CAT_DUKE_PIN;

const HEADLESS =
  process.env.HEADLESS !== "false";

const THROW_COUNT =
  Number(
    process.env.THROW_COUNT || "1"
  );

const CLICK_GAP_MS =
  Number(
    process.env.CLICK_GAP_MS || "1000"
  );

const sleep = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

/* =========================================================
   VALID THROW ITEMS
========================================================= */

/*
 * 只允許真正存在於丟東西面板的道具。
 */
const VALID_ITEM_NAMES = [
  "小魚乾",
  "貓罐頭",
  "拖鞋",
  "金幣",
  "逗貓棒",
  "紙箱",
  "幼蟲",
  "羊毛",
  "雞蛋",
  "銀幣",
  "德卡",
  "M幣",
  "喵幣",
  "貓黃金",
  "糖果",
  "千把劍",
  "愛心",
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getValidItemName(value) {
  const clean =
    normalizeText(value);

  for (
    const validName
    of VALID_ITEM_NAMES
  ) {
    if (
      clean === validName ||
      clean.includes(validName)
    ) {
      return validName;
    }
  }

  /*
   * UI 上被截斷為「裝水的...」
   */
  if (
    clean.startsWith("裝水的")
  ) {
    return clean;
  }

  return null;
}

function isValidItemName(name) {
  return Boolean(
    getValidItemName(name)
  );
}

/* =========================================================
   CONFIG CHECK
========================================================= */

if (
  !PIN ||
  !/^\d{6}$/.test(PIN)
) {
  console.error(
    "❌ 缺少 CAT_DUKE_PIN，或 PIN 不是 6 位數"
  );

  process.exit(1);
}

if (
  !Number.isInteger(THROW_COUNT) ||
  THROW_COUNT < 1 ||
  THROW_COUNT > 100
) {
  console.error(
    "❌ THROW_COUNT 必須是 1～100 的整數"
  );

  process.exit(1);
}

if (
  !Number.isFinite(CLICK_GAP_MS) ||
  CLICK_GAP_MS < 100
) {
  console.error(
    "❌ CLICK_GAP_MS 不可小於 100ms"
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
      `⚠️ 截圖失敗 ${filename}:`,
      error.message
    );
  }
}

/* =========================================================
   LOGIN
========================================================= */

async function login(page) {
  console.log(
    "開啟網站..."
  );

  await page.goto(URL, {
    waitUntil:
      "domcontentloaded",
    timeout:
      30000,
  });

  await page.waitForTimeout(
    1200
  );

  console.log(
    "點擊登入..."
  );

  const loginButton =
    page
      .getByRole(
        "button",
        {
          name:
            "登入",
          exact:
            true,
        }
      )
      .first();

  await loginButton.waitFor({
    state:
      "visible",
    timeout:
      10000,
  });

  await loginButton.click();

  await page.waitForTimeout(
    500
  );

  console.log(
    `選擇角色：${USER_NAME}`
  );

  const select =
    page
      .locator("select")
      .first();

  await select.waitFor({
    state:
      "visible",
    timeout:
      5000,
  });

  await select.selectOption({
    label:
      USER_NAME,
  });

  console.log(
    "輸入 PIN..."
  );

  const inputs =
    page.locator("input");

  let pinInput = null;

  const count =
    await inputs.count();

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const input =
      inputs.nth(i);

    const isVisible =
      await input
        .isVisible()
        .catch(() => false);

    if (!isVisible) {
      continue;
    }

    const type =
      (await input.getAttribute(
        "type"
      )) || "";

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
      page.locator(
        "input:visible"
      );

    if (
      await visibleInputs.count() === 0
    ) {
      throw new Error(
        "找不到 PIN 輸入欄位"
      );
    }

    pinInput =
      visibleInputs.last();
  }

  await pinInput.fill(PIN);

  console.log(
    "送出登入..."
  );

  const loginButtons =
    page.getByRole(
      "button",
      {
        name:
          "登入",
        exact:
          true,
      }
    );

  await loginButtons
    .last()
    .click();

  await page.waitForTimeout(
    1800
  );

  console.log(
    "✅ 登入完成"
  );
}

/* =========================================================
   CLICK PLAYER AVATAR
========================================================= */

async function clickPlayerAvatar(
  page,
  playerName
) {
  console.log(
    `尋找玩家：${playerName}`
  );

  const targetText =
    page
      .locator("text.name")
      .filter({
        hasText:
          playerName,
      })
      .first();

  await targetText.waitFor({
    state:
      "attached",
    timeout:
      15000,
  });

  let point = null;

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
            const el
            of candidates
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
      break;
    }

    await page.waitForTimeout(
      500
    );
  }

  if (!point) {
    await safeScreenshot(
      page,
      "player-coordinate-error.png"
    );

    throw new Error(
      `${playerName} 找到了，但沒有有效座標`
    );
  }

  console.log(
    `點擊 ${playerName}：` +
    `x=${point.x.toFixed(1)}, ` +
    `y=${point.y.toFixed(1)}`
  );

  await page.mouse.move(
    point.x,
    point.y
  );

  await page.waitForTimeout(
    100
  );

  await page.mouse.down();

  await page.waitForTimeout(
    80
  );

  await page.mouse.up();

  await page.waitForTimeout(
    500
  );

  console.log(
    `✅ 已點擊 ${playerName}`
  );
}

/* =========================================================
   WAIT FOR RECENT PANEL
========================================================= */

async function waitForRecentPanel(
  page
) {
  console.log(
    "等待右側最近紀錄面板..."
  );

  for (
    let attempt = 1;
    attempt <= 20;
    attempt++
  ) {
    const found =
      await page.evaluate(() => {
        const all = [
          ...document.querySelectorAll(
            "body *"
          ),
        ];

        for (
          const el of all
        ) {
          const rect =
            el.getBoundingClientRect();

          const style =
            getComputedStyle(el);

          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !==
              "none" &&
            style.visibility !==
              "hidden" &&
            Number(
              style.opacity || 1
            ) !== 0;

          if (!visible) {
            continue;
          }

          const text =
            (
              el.innerText ||
              el.textContent ||
              ""
            )
              .replace(
                /\s+/g,
                " "
              )
              .trim();

          if (
            text.includes(
              "最近紀錄"
            )
          ) {
            return true;
          }
        }

        return false;
      });

    if (found) {
      console.log(
        `✅ 最近紀錄面板已出現，第 ${attempt} 次確認成功`
      );

      return;
    }

    await page.waitForTimeout(
      500
    );
  }

  await safeScreenshot(
    page,
    "recent-panel-timeout.png"
  );

  throw new Error(
    "點擊自己後，10 秒內仍未出現最近紀錄面板"
  );
}

/* =========================================================
   READ RECENT RECORDS
========================================================= */

async function readRecentRecords(
  page
) {
  console.log(
    `讀取 ${USER_NAME} 右側最近紀錄...`
  );

  await clickPlayerAvatar(
    page,
    USER_NAME
  );

  await waitForRecentPanel(
    page
  );

  await page.waitForTimeout(
    500
  );

  const result =
    await page.evaluate(() => {
      function visible(el) {
        const rect =
          el.getBoundingClientRect();

        const style =
          getComputedStyle(el);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !==
            "none" &&
          style.visibility !==
            "hidden" &&
          Number(
            style.opacity || 1
          ) !== 0
        );
      }

      const all = [
        ...document.querySelectorAll(
          "body *"
        ),
      ];

      const recentTitleCandidates =
        all.filter((el) => {
          if (!visible(el)) {
            return false;
          }

          const text =
            (
              el.innerText ||
              el.textContent ||
              ""
            )
              .replace(
                /\s+/g,
                " "
              )
              .trim();

          return text.includes(
            "最近紀錄"
          );
        });

      if (
        recentTitleCandidates
          .length === 0
      ) {
        return {
          status:
            "NO_RECORD_PANEL",
          latest:
            null,
          records:
            [],
          debug:
            "找不到最近紀錄區塊",
        };
      }

      const recentContainers =
        recentTitleCandidates.filter(
          (el) => {
            const text =
              (
                el.innerText ||
                el.textContent ||
                ""
              )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();

            return text.includes(
              "丟了"
            );
          }
        );

      if (
        recentContainers
          .length === 0
      ) {
        return {
          status:
            "NO_RECORDS",
          latest:
            null,
          records:
            [],
          debug:
            "最近紀錄存在，但目前沒有丟東西紀錄",
        };
      }

      recentContainers.sort(
        (a, b) => {
          const ra =
            a.getBoundingClientRect();

          const rb =
            b.getBoundingClientRect();

          return (
            ra.width *
              ra.height -
            rb.width *
              rb.height
          );
        }
      );

      const container =
        recentContainers[0];

      const descendants = [
        container,
        ...container.querySelectorAll(
          "*"
        ),
      ];

      const candidates = [];

      for (
        const el of descendants
      ) {
        if (!visible(el)) {
          continue;
        }

        const text =
          (
            el.innerText ||
            el.textContent ||
            ""
          )
            .replace(
              /\s+/g,
              " "
            )
            .trim();

        if (
          !text ||
          !text.includes("丟了")
        ) {
          continue;
        }

        const rect =
          el.getBoundingClientRect();

        candidates.push({
          text,
          y:
            rect.top,
          area:
            rect.width *
            rect.height,
        });
      }

      candidates.sort(
        (a, b) => {
          if (
            Math.abs(
              a.y - b.y
            ) > 1
          ) {
            return (
              a.y - b.y
            );
          }

          return (
            a.area -
            b.area
          );
        }
      );

      const unique = [];
      const seen =
        new Set();

      for (
        const item of candidates
      ) {
        if (
          seen.has(item.text)
        ) {
          continue;
        }

        seen.add(item.text);
        unique.push(item);
      }

      const records = [];
      const recordKeys =
        new Set();

      for (
        const item of unique
      ) {
        const throwIndex =
          item.text.indexOf(
            "丟了"
          );

        if (
          throwIndex <= 0
        ) {
          continue;
        }

        let sender =
          item.text
            .slice(
              0,
              throwIndex
            )
            .trim();

        let rest =
          item.text
            .slice(
              throwIndex +
              "丟了".length
            )
            .trim();

        sender =
          sender
            .replace(
              /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/u,
              ""
            )
            .trim();

        let thrownItem =
          rest
            .replace(
              /\s+\d+\s*(?:秒|分鐘|小時|天)前$/u,
              ""
            )
            .replace(
              /\s*剛剛$/u,
              ""
            )
            .trim();

        if (
          thrownItem.includes(
            "丟了"
          )
        ) {
          continue;
        }

        if (
          sender.includes(
            "最近紀錄"
          )
        ) {
          continue;
        }

        if (
          !sender ||
          !thrownItem
        ) {
          continue;
        }

        const key =
          `${sender}|${thrownItem}`;

        if (
          recordKeys.has(key)
        ) {
          continue;
        }

        recordKeys.add(key);

        records.push({
          sender,
          item:
            thrownItem,
          record:
            item.text,
          y:
            item.y,
        });
      }

      if (
        records.length === 0
      ) {
        return {
          status:
            "PARSE_ERROR",
          latest:
            null,
          records:
            [],
          debug:
            container.innerText,
        };
      }

      records.sort(
        (a, b) =>
          a.y - b.y
      );

      return {
        status:
          "OK",
        latest:
          records[0],
        records,
        debug:
          container.innerText,
      };
    });

  if (
    result.status ===
    "NO_RECORD_PANEL"
  ) {
    await safeScreenshot(
      page,
      "recent-records-error.png"
    );

    throw new Error(
      "找不到最近紀錄區塊"
    );
  }

  if (
    result.status ===
    "NO_RECORDS"
  ) {
    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "ℹ️ 目前沒有人丟東西給你"
    );

    console.log(
      "ℹ️ 本次不執行反擊"
    );

    console.log(
      "========================================"
    );

    return null;
  }

  if (
    result.status ===
    "PARSE_ERROR"
  ) {
    console.log(
      result.debug
    );

    await safeScreenshot(
      page,
      "recent-records-error.png"
    );

    throw new Error(
      "最近紀錄存在，但無法解析"
    );
  }

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    `📜 ${USER_NAME} 最近被丟紀錄`
  );

  console.log(
    "※ 越上面越新"
  );

  console.log(
    "========================================"
  );

  result.records.forEach(
    (record, index) => {
      console.log(
        `[${index + 1}] ${record.record}`
      );

      console.log(
        `    誰丟的：${record.sender}`
      );

      console.log(
        `    丟什麼：${record.item}`
      );
    }
  );

  console.log(
    "========================================"
  );

  console.log(
    "🔥 最新一筆"
  );

  console.log(
    `誰丟的：${result.latest.sender}`
  );

  console.log(
    `丟什麼：${result.latest.item}`
  );

  console.log(
    `原始紀錄：${result.latest.record}`
  );

  return result.latest;
}

/* =========================================================
   GET THROW CONTROLS
========================================================= */

async function getThrowControls(
  page
) {
  return await page.evaluate(() => {
    const all = [
      ...document.querySelectorAll(
        "body *"
      ),
    ];

    const matches = [];

    for (
      const el of all
    ) {
      const text =
        (
          el.textContent ||
          ""
        ).trim();

      if (
        text !== "丟東西"
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

      matches.push({
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
      });
    }

    return matches;
  });
}

/* =========================================================
   OPEN THROW PANEL
========================================================= */

async function openThrowPanel(
  page
) {
  console.log(
    '尋找「丟東西」控制項...'
  );

  for (
    let attempt = 1;
    attempt <= 15;
    attempt++
  ) {
    const controls =
      await getThrowControls(
        page
      );

    if (
      controls.length > 0
    ) {
      controls.sort(
        (a, b) =>
          a.width *
            a.height -
          b.width *
            b.height
      );

      const target =
        controls[0];

      await page.mouse.move(
        target.x,
        target.y
      );

      await page.waitForTimeout(
        100
      );

      await page.mouse.down();

      await page.waitForTimeout(
        80
      );

      await page.mouse.up();

      await page.waitForTimeout(
        1000
      );

      console.log(
        "✅ 已打開丟東西面板"
      );

      return;
    }

    await page.waitForTimeout(
      300
    );
  }

  await safeScreenshot(
    page,
    "no-throw-control.png"
  );

  throw new Error(
    "找不到「丟東西」控制項"
  );
}

/* =========================================================
   FIND AVAILABLE ITEMS
========================================================= */

async function findAvailableItems(
  page
) {
  const rawItems =
    await page.evaluate(() => {
      function visible(el) {
        const rect =
          el.getBoundingClientRect();

        const style =
          getComputedStyle(el);

        return (
          rect.width > 5 &&
          rect.height > 5 &&
          style.display !==
            "none" &&
          style.visibility !==
            "hidden" &&
          Number(
            style.opacity || 1
          ) !== 0
        );
      }

      const all = [
        ...document.querySelectorAll(
          [
            "button",
            '[role="button"]',
            "[data-item]",
            "[data-name]",
          ].join(",")
        ),
      ];

      const result = [];

      for (
        const el of all
      ) {
        if (!visible(el)) {
          continue;
        }

        const rect =
          el.getBoundingClientRect();

        const text =
          (
            el.innerText ||
            el.textContent ||
            ""
          )
            .replace(
              /\s+/g,
              " "
            )
            .trim();

        const names = [
          el.getAttribute(
            "data-item"
          ),
          el.getAttribute(
            "data-name"
          ),
          el.getAttribute(
            "title"
          ),
          el.getAttribute(
            "aria-label"
          ),
          text,
        ]
          .filter(Boolean)
          .map((x) =>
            String(x).trim()
          );

        if (
          names.length === 0
        ) {
          continue;
        }

        result.push({
          names,

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

      return result;
    });

  const validItems = [];

  for (
    const candidate
    of rawItems
  ) {
    let matchedName = null;

    for (
      const candidateName
      of candidate.names
    ) {
      matchedName =
        getValidItemName(
          candidateName
        );

      if (matchedName) {
        break;
      }
    }

    if (!matchedName) {
      continue;
    }

    validItems.push({
      ...candidate,

      name:
        matchedName,
    });
  }

  const unique = [];

  for (
    const item
    of validItems
  ) {
    const duplicate =
      unique.some(
        (existing) =>
          existing.name ===
            item.name &&
          Math.abs(
            existing.x -
              item.x
          ) < 5 &&
          Math.abs(
            existing.y -
              item.y
          ) < 5
      );

    if (duplicate) {
      continue;
    }

    unique.push(item);
  }

  return unique;
}

/* =========================================================
   WAIT FOR ITEMS
========================================================= */

async function waitForThrowItems(
  page
) {
  for (
    let attempt = 1;
    attempt <= 20;
    attempt++
  ) {
    const items =
      await findAvailableItems(
        page
      );

    if (
      items.length > 0
    ) {
      return items;
    }

    await page.waitForTimeout(
      500
    );
  }

  await safeScreenshot(
    page,
    "no-items.png"
  );

  throw new Error(
    "找不到任何合法道具"
  );
}

/* =========================================================
   FIND SPECIFIC ITEM
========================================================= */

/*
 * 第一次只隨機選名稱。
 *
 * 後面 100 次都只重新定位
 * 同一個名稱的道具。
 */
async function waitForSpecificItem(
  page,
  selectedName
) {
  for (
    let attempt = 1;
    attempt <= 20;
    attempt++
  ) {
    const items =
      await findAvailableItems(
        page
      );

    const item =
      items.find(
        (candidate) =>
          candidate.name ===
          selectedName
      );

    if (item) {
      return item;
    }

    console.log(
      `第 ${attempt} 次尚未重新找到「${selectedName}」，等待 UI...`
    );

    await page.waitForTimeout(
      300
    );
  }

  await safeScreenshot(
    page,
    "selected-item-missing.png"
  );

  throw new Error(
    `找不到已選定的道具：${selectedName}`
  );
}

/* =========================================================
   RANDOM
========================================================= */

function chooseRandomItem(
  items
) {
  if (
    !items ||
    items.length === 0
  ) {
    return null;
  }

  const index =
    Math.floor(
      Math.random() *
      items.length
    );

  return items[index];
}

/* =========================================================
   EXECUTE RETALIATION
========================================================= */

async function executeRetaliation(
  page,
  latest
) {
  const target =
    latest.sender;

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "🔥 開始反擊"
  );

  console.log(
    "========================================"
  );

  console.log(
    `反擊對象：${target}`
  );

  console.log(
    `對方最後丟你：${latest.item}`
  );

  console.log(
    `本次預計丟：${THROW_COUNT} 次`
  );

  console.log(
    `每次間隔：${CLICK_GAP_MS} ms`
  );

  console.log(
    "========================================"
  );

  await clickPlayerAvatar(
    page,
    target
  );

  await openThrowPanel(
    page
  );

  /*
   * =====================================================
   * 只在這裡隨機一次
   * =====================================================
   */

  const availableItems =
    await waitForThrowItems(
      page
    );

  console.log("");
  console.log(
    "===== 可丟道具 ====="
  );

  availableItems.forEach(
    (item, index) => {
      console.log(
        `${index + 1}. ${item.name}`
      );
    }
  );

  console.log(
    "===================="
  );

  const selected =
    chooseRandomItem(
      availableItems
    );

  if (!selected) {
    throw new Error(
      "無法隨機選擇道具"
    );
  }

  const selectedName =
    selected.name;

  if (
    !isValidItemName(
      selectedName
    )
  ) {
    throw new Error(
      `安全阻擋：非法道具「${selectedName}」`
    );
  }

  console.log("");
  console.log(
    "🎲 本次隨機結果"
  );

  console.log(
    `✅ 選定道具：${selectedName}`
  );

  console.log(
    `✅ 接下來 ${THROW_COUNT} 次全部只丟「${selectedName}」`
  );

  console.log("");

  let successCount = 0;

  /*
   * =====================================================
   * 後面不再 random
   *
   * 全部只找 selectedName
   * =====================================================
   */

  for (
    let i = 0;
    i < THROW_COUNT;
    i++
  ) {
    try {
      /*
       * 每次重新找同一個道具的位置，
       * 防止 DOM rerender / 座標改變。
       */
      const item =
        await waitForSpecificItem(
          page,
          selectedName
        );

      /*
       * 再做一次安全確認
       */
      if (
        item.name !==
          selectedName ||
        !isValidItemName(
          item.name
        )
      ) {
        throw new Error(
          `安全阻擋：道具定位異常「${item.name}」`
        );
      }

      console.log(
        `🎯 第 ${i + 1}/${THROW_COUNT} 次：${selectedName}`
      );

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
        `✅ 已執行 ${successCount}/${THROW_COUNT}`
      );

      if (
        successCount <
        THROW_COUNT
      ) {
        await sleep(
          CLICK_GAP_MS
        );
      }
    } catch (error) {
      console.error(
        `❌ 第 ${i + 1} 次反擊失敗：${error.message}`
      );

      await safeScreenshot(
        page,
        "retaliation-error.png"
      );

      throw error;
    }
  }

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "✅ 反擊完成"
  );

  console.log(
    "========================================"
  );

  console.log(
    `反擊對象：${target}`
  );

  console.log(
    `使用道具：${selectedName}`
  );

  console.log(
    `成功次數：${successCount}/${THROW_COUNT}`
  );

  console.log(
    "========================================"
  );

  return {
    target,
    item:
      selectedName,
    successCount,
  };
}

/* =========================================================
   MAIN
========================================================= */

(async () => {
  console.log(
    "========================================"
  );

  console.log(
    "Cat Duke 自動反擊版"
  );

  console.log(
    `本次最多反擊：${THROW_COUNT} 次`
  );

  console.log(
    `丟東西間隔：${CLICK_GAP_MS} ms`
  );

  console.log(
    "========================================"
  );

  const browser =
    await chromium.launch({
      headless:
        HEADLESS,
    });

  const context =
    await browser.newContext({
      viewport: {
        width:
          1440,
        height:
          1000,
      },
    });

  const page =
    await context.newPage();

  try {
    /*
     * 登入
     */
    await login(page);

    /*
     * 找最新丟你的人
     */
    const latest =
      await readRecentRecords(
        page
      );

    /*
     * 沒人丟
     */
    if (!latest) {
      console.log("");
      console.log(
        "✅ 沒有反擊目標"
      );

      console.log(
        "✅ 本次任務正常結束，沒有執行任何丟東西動作"
      );

      return;
    }

    if (
      !latest.sender
    ) {
      throw new Error(
        "最新紀錄沒有有效玩家名稱"
      );
    }

    if (
      latest.sender ===
      USER_NAME
    ) {
      throw new Error(
        "反擊目標不可是自己"
      );
    }

    /*
     * 執行反擊
     */
    const result =
      await executeRetaliation(
        page,
        latest
      );

    console.log("");
    console.log(
      "✅ 自動反擊任務完成"
    );

    console.log(
      `✅ 對象：${result.target}`
    );

    console.log(
      `✅ 道具：${result.item}`
    );

    console.log(
      `✅ 次數：${result.successCount}`
    );
  } catch (error) {
    console.error("");
    console.error(
      "❌ 執行失敗"
    );

    console.error(
      error
    );

    await safeScreenshot(
      page,
      "error.png"
    );

    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();