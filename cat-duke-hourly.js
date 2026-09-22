const { chromium } = require("playwright");

/* =========================================================
   CONFIG
========================================================= */

const URL =
  "https://mabinogi-cat-duke-guild-a9aeb3.gitlab.io/";

const USER_NAME = "菜阿嘎吸粉絲血";

const PIN = process.env.CAT_DUKE_PIN;

// HEADLESS=false 可以看到瀏覽器畫面
const HEADLESS =
  process.env.HEADLESS !== "false";

/* =========================================================
   BASIC
========================================================= */

async function safeScreenshot(page, filename) {
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
   CONFIG CHECK
========================================================= */

if (!PIN || !/^\d{6}$/.test(PIN)) {
  console.error(
    "❌ 缺少 CAT_DUKE_PIN，或 PIN 不是 6 位數"
  );

  process.exit(1);
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

  const loginButtons =
    page.getByRole("button", {
      name: "登入",
      exact: true,
    });

  console.log("送出登入...");

  await loginButtons
    .last()
    .click();

  await page.waitForTimeout(1800);

  console.log("✅ 登入完成");
}

/* =========================================================
   CLICK PLAYER AVATAR
   只負責點頭像，不檢查「丟東西」
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
        hasText: playerName,
      })
      .first();

  await targetText.waitFor({
    state: "attached",
    timeout: 15000,
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
            group.querySelector("image"),
            group.querySelector("circle"),
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
    800
  );

  console.log(
    `✅ 已點擊 ${playerName}`
  );
}

/* =========================================================
   READ RECENT RECORDS
========================================================= */

async function readRecentRecords(page) {
  console.log(
    `讀取 ${USER_NAME} 右側最近紀錄...`
  );

  /*
   * 先點自己的頭像。
   */
  await clickPlayerAvatar(
    page,
    USER_NAME
  );

  await page.waitForTimeout(
    1000
  );

  const result =
    await page.evaluate(
      (userName) => {
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

        const raw = [];

        for (const el of all) {
          if (
            forbidden.has(
              el.tagName
            )
          ) {
            continue;
          }

          if (!visible(el)) {
            continue;
          }

          const rect =
            el.getBoundingClientRect();

          /*
           * 依使用者描述：
           * 最近紀錄在右側。
           *
           * 所以只取畫面右半部。
           */
          if (
            rect.left <
            window.innerWidth *
              0.45
          ) {
            continue;
          }

          /*
           * 排除非常巨大的 panel 父層。
           */
          if (
            rect.width >
              window.innerWidth *
                0.55 &&
            rect.height >
              window.innerHeight *
                0.7
          ) {
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

          if (!text) {
            continue;
          }

          /*
           * 必須跟自己有關。
           */
          if (
            !text.includes(
              userName
            )
          ) {
            continue;
          }

          /*
           * 必須看起來是丟東西紀錄。
           */
          const looksLikeThrow =
            text.includes("丟") ||
            text.includes("丟給") ||
            text.includes("丟了") ||
            text.includes("→");

          if (
            !looksLikeThrow
          ) {
            continue;
          }

          raw.push({
            text,

            tag:
              el.tagName,

            x:
              rect.left,

            y:
              rect.top,

            width:
              rect.width,

            height:
              rect.height,

            area:
              rect.width *
              rect.height,

            html:
              el.outerHTML.slice(
                0,
                1500
              ),
          });
        }

        /*
         * 越上面 = 越新
         */
        raw.sort(
          (a, b) =>
            a.y - b.y
        );

        /*
         * 去掉相同文字的父子節點。
         */
        const unique = [];

        const seen =
          new Set();

        for (const item of raw) {
          if (
            seen.has(
              item.text
            )
          ) {
            continue;
          }

          seen.add(
            item.text
          );

          unique.push(
            item
          );
        }

        const escapedName =
          userName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

        /*
         * 先支援幾種可能的文字格式。
         */
        const patterns = [
          new RegExp(
            `^(.+?)\\s*丟(?:了)?\\s*(.+?)\\s*(?:給|→)\\s*${escapedName}`,
            "u"
          ),

          new RegExp(
            `^(.+?)\\s*(?:丟給|→)\\s*${escapedName}\\s*(.*)$`,
            "u"
          ),

          new RegExp(
            `^(.+?)\\s*對\\s*${escapedName}\\s*丟(?:了)?\\s*(.+)$`,
            "u"
          ),
        ];

        const parsed = [];

        for (
          const item of unique
        ) {
          let sender = null;
          let thrownItem = null;

          for (
            const pattern
            of patterns
          ) {
            const match =
              item.text.match(
                pattern
              );

            if (!match) {
              continue;
            }

            sender =
              (
                match[1] ||
                ""
              )
                .replace(
                  /^\d{1,2}:\d{2}(?::\d{2})?\s*/,
                  ""
                )
                .trim();

            thrownItem =
              (
                match[2] ||
                ""
              ).trim();

            break;
          }

          /*
           * 如果 regex 沒解析成功，
           * 保留原始紀錄供 debug。
           */
          if (!sender) {
            parsed.push({
              sender: null,
              item: null,
              record:
                item.text,
              y:
                item.y,
            });

            continue;
          }

          /*
           * 不把自己當攻擊者。
           */
          if (
            sender === userName
          ) {
            continue;
          }

          parsed.push({
            sender,
            item:
              thrownItem ||
              "無法解析",
            record:
              item.text,
            y:
              item.y,
          });
        }

        /*
         * 已經是由上到下排序。
         *
         * 找第一個成功解析 sender 的紀錄。
         */
        const latest =
          parsed.find(
            (x) =>
              x.sender
          ) || null;

        return {
          latest,
          parsed,
          raw:
            unique,
        };
      },
      USER_NAME
    );

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    `📜 丟給 ${USER_NAME} 的最近紀錄`
  );

  console.log(
    "※ 越上面越新"
  );

  console.log(
    "========================================"
  );

  if (
    result.parsed.length === 0
  ) {
    console.log(
      "沒有找到符合條件的紀錄。"
    );
  } else {
    result.parsed.forEach(
      (record, index) => {
        console.log(
          `[${index + 1}] ${record.record}`
        );

        if (
          record.sender
        ) {
          console.log(
            `    誰丟的：${record.sender}`
          );

          console.log(
            `    丟什麼：${record.item}`
          );
        } else {
          console.log(
            "    ⚠️ 這筆目前無法解析"
          );
        }
      }
    );
  }

  console.log(
    "========================================"
  );

  if (!result.latest) {
    await safeScreenshot(
      page,
      "recent-records-error.png"
    );

    throw new Error(
      "找到紀錄區，但無法解析最新一筆是誰丟的"
    );
  }

  console.log("");
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

  console.log("");

  return result.latest;
}

/* =========================================================
   THROW CONTROL
========================================================= */

async function getThrowControls(page) {
  return await page.evaluate(() => {
    const all = [
      ...document.querySelectorAll(
        "body *"
      ),
    ];

    const result = [];

    for (const el of all) {
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

      result.push({
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

        tag:
          el.tagName,
      });
    }

    return result;
  });
}

/* =========================================================
   OPEN THROW PANEL
   只開面板，不丟
========================================================= */

async function openThrowPanel(page) {
  console.log(
    '尋找「丟東西」...'
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
  return await page.evaluate(
    () => {
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

      const emojiRegex =
        /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;

      const all = [
        ...document.querySelectorAll(
          "body *"
        ),
      ];

      const candidates = [];

      for (const el of all) {
        if (!visible(el)) {
          continue;
        }

        const rect =
          el.getBoundingClientRect();

        /*
         * 道具通常不會是一個超大元素。
         */
        if (
          rect.width > 300 ||
          rect.height > 220
        ) {
          continue;
        }

        const text =
          (
            el.innerText ||
            el.textContent ||
            ""
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

        const role =
          el.getAttribute(
            "role"
          ) || "";

        const name =
          dataItem ||
          dataName ||
          title ||
          aria ||
          alt ||
          text;

        if (!name) {
          continue;
        }

        const blocked =
          [
            "丟東西",
            "關閉",
            "取消",
            "登入",
            "確定",
            "返回",
          ];

        if (
          blocked.includes(
            name
          ) ||
          blocked.includes(
            text
          )
        ) {
          continue;
        }

        const explicit =
          Boolean(
            dataItem ||
            dataName
          );

        const metadata =
          Boolean(
            title ||
            aria ||
            alt
          );

        const emoji =
          emojiRegex.test(
            text
          );

        const button =
          el.tagName ===
            "BUTTON" ||
          role === "button";

        if (
          !explicit &&
          !metadata &&
          !emoji &&
          !button
        ) {
          continue;
        }

        candidates.push({
          name,

          text,

          explicit,

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

          area:
            rect.width *
            rect.height,

          tag:
            el.tagName,

          html:
            el.outerHTML.slice(
              0,
              1000
            ),
        });
      }

      /*
       * 同一位置的父子元素只留一個。
       */
      const unique = [];

      for (
        const item
        of candidates
      ) {
        const duplicate =
          unique.some(
            (x) =>
              Math.abs(
                x.x -
                  item.x
              ) < 3 &&
              Math.abs(
                x.y -
                  item.y
              ) < 3
          );

        if (duplicate) {
          continue;
        }

        unique.push(
          item
        );
      }

      /*
       * 明確 data-item 優先。
       */
      unique.sort(
        (a, b) => {
          if (
            a.explicit !==
            b.explicit
          ) {
            return a.explicit
              ? -1
              : 1;
          }

          return (
            a.area -
            b.area
          );
        }
      );

      return unique;
    }
  );
}

/* =========================================================
   RANDOM PREVIEW
   只抽，不點
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
   PREVIEW RETALIATION
========================================================= */

async function previewRetaliation(
  page,
  latest
) {
  const target =
    latest.sender;

  console.log("");
  console.log(
    `準備檢查復仇對象：${target}`
  );

  /*
   * 點真正要反擊的人。
   */
  await clickPlayerAvatar(
    page,
    target
  );

  /*
   * 打開丟東西面板。
   *
   * 注意：
   * 只開，不會丟。
   */
  await openThrowPanel(page);

  await page.waitForTimeout(
    800
  );

  const items =
    await findAvailableItems(
      page
    );

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "🎁 偵測到的可丟道具候選"
  );

  console.log(
    "========================================"
  );

  if (
    items.length === 0
  ) {
    console.log(
      "沒有找到道具候選。"
    );

    await safeScreenshot(
      page,
      "no-items.png"
    );

    return;
  }

  items.forEach(
    (item, index) => {
      console.log(
        `[${index + 1}] ${item.name}`
      );
    }
  );

  const selected =
    chooseRandomItem(
      items
    );

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "🔥 如果現在要反擊"
  );

  console.log(
    "========================================"
  );

  console.log(
    `反擊對象：${target}`
  );

  console.log(
    `隨機道具：${selected.name}`
  );

  console.log(
    ""
  );

  console.log(
    "⚠️ 本測試版不會真的點擊道具"
  );

  console.log(
    "⚠️ 沒有執行任何丟東西動作"
  );

  console.log(
    "========================================"
  );
}

/* =========================================================
   MAIN
========================================================= */

(async () => {
  console.log(
    "========================================"
  );

  console.log(
    "Cat Duke 復仇偵測測試版"
  );

  console.log(
    "⚠️ 本版本不會真的丟任何東西"
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
        width: 1440,
        height: 1000,
      },
    });

  const page =
    await context.newPage();

  try {
    /*
     * 1. 登入
     */
    await login(page);

    /*
     * 2. 點自己
     *
     * 3. 讀右側最近紀錄
     *
     * 4. 最新一筆 = 最上面
     */
    const latest =
      await readRecentRecords(
        page
      );

    /*
     * 5. 點最新攻擊者
     *
     * 6. 開丟東西面板
     *
     * 7. 隨機抽一個道具
     *
     * 8. 只列出結果，不點
     */
    await previewRetaliation(
      page,
      latest
    );

    console.log("");
    console.log(
      "✅ 偵測測試完成"
    );
  } catch (error) {
    console.error("");
    console.error(
      "❌ 執行失敗"
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