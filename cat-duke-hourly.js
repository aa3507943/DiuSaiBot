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
  console.log("開啟網站...");

  await page.goto(URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(1200);

  console.log("點擊登入...");

  const loginButton =
    page
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

  console.log("送出登入...");

  const loginButtons =
    page.getByRole("button", {
      name: "登入",
      exact: true,
    });

  await loginButtons
    .last()
    .click();

  await page.waitForTimeout(1800);

  console.log("✅ 登入完成");
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

  await page.waitForTimeout(
    1000
  );

  const result =
    await page.evaluate(
      () => {
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

        /*
         * 找最近紀錄區
         */
        const recentContainers =
          all.filter(
            (el) => {
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

              return (
                text.includes(
                  "最近紀錄"
                ) &&
                text.includes(
                  "丟了"
                )
              );
            }
          );

        if (
          recentContainers.length ===
          0
        ) {
          return {
            latest: null,
            records: [],
            debug:
              "找不到最近紀錄區塊",
          };
        }

        /*
         * 面積小的優先
         */
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

          if (!text) {
            continue;
          }

          if (
            !text.includes(
              "丟了"
            )
          ) {
            continue;
          }

          const rect =
            el.getBoundingClientRect();

          candidates.push({
            text,
            y: rect.top,
            x: rect.left,
            width:
              rect.width,
            height:
              rect.height,
            area:
              rect.width *
              rect.height,
            tag:
              el.tagName,
          });
        }

        /*
         * 越上面越新
         */
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

        /*
         * 先去除完全相同文字
         */
        const unique = [];

        const seen =
          new Set();

        for (
          const item of candidates
        ) {
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

        const records = [];

        /*
         * 用 sender + item 去重
         *
         * 例如：
         *
         * 🩴 山大王 丟了拖鞋 6 小時前
         * 山大王 丟了拖鞋
         *
         * 都算同一筆
         */
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

          if (
            !sender ||
            !rest
          ) {
            continue;
          }

          /*
           * 移除 sender 前面的 emoji
           *
           * 🩴 山大王
           * →
           * 山大王
           */
          sender =
            sender
              .replace(
                /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/u,
                ""
              )
              .trim();

          /*
           * 移除尾端時間
           */
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

          /*
           * 抓到父容器時，
           * 裡面會還有第二個「丟了」
           */
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

          /*
           * 同 sender + item
           * 視為 DOM 重複
           */
          const recordKey =
            `${sender}|${thrownItem}`;

          if (
            recordKeys.has(
              recordKey
            )
          ) {
            continue;
          }

          recordKeys.add(
            recordKey
          );

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

        /*
         * 越上面越新
         */
        records.sort(
          (a, b) =>
            a.y - b.y
        );

        const latest =
          records.length > 0
            ? records[0]
            : null;

        return {
          latest,
          records,
          debug:
            container.innerText,
        };
      }
    );

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

  if (
    result.records.length === 0
  ) {
    console.log(
      "沒有成功解析出單筆紀錄。"
    );

    console.log("");
    console.log(
      "===== 原始紀錄區塊 ====="
    );

    console.log(
      result.debug
    );

    console.log(
      "=========================="
    );

    await safeScreenshot(
      page,
      "recent-records-error.png"
    );

    throw new Error(
      "無法解析最近紀錄"
    );
  }

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
   GET THROW CONTROLS
========================================================= */

async function getThrowControls(
  page
) {
  return await page.evaluate(
    () => {
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

      for (
        const el of all
      ) {
        if (
          forbidden.has(
            el.tagName
          )
        ) {
          continue;
        }

        const text =
          (
            el.textContent ||
            ""
          ).trim();

        if (
          text !==
          "丟東西"
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
          tag:
            el.tagName,

          id:
            el.id || "",

          className:
            typeof el.className ===
            "string"
              ? el.className
              : "",

          role:
            el.getAttribute(
              "role"
            ) || "",

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
    }
  );
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

      const forbidden =
        new Set([
          "SCRIPT",
          "STYLE",
          "PRE",
          "CODE",
        ]);

      const emojiRegex =
        /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;

      const all = [
        ...document.querySelectorAll(
          "body *"
        ),
      ];

      const candidates = [];

      for (
        const el of all
      ) {
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

        if (
          rect.width > 350 ||
          rect.height > 250
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

        const dataId =
          el.getAttribute(
            "data-id"
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
          new Set([
            "丟東西",
            "關閉",
            "取消",
            "登入",
            "確定",
            "返回",
            "最近紀錄",
          ]);

        if (
          blocked.has(
            name
          ) ||
          blocked.has(
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

        const buttonLike =
          el.tagName ===
            "BUTTON" ||
          role === "button";

        if (
          !explicit &&
          !metadata &&
          !emoji &&
          !buttonLike
        ) {
          continue;
        }

        candidates.push({
          name,
          text,
          title,
          aria,
          alt,
          dataItem,
          dataName,
          dataId,
          explicit,

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

          area:
            rect.width *
            rect.height,

          html:
            el.outerHTML.slice(
              0,
              1000
            ),
        });
      }

      /*
       * 同座標父子元素去重
       */
      const unique = [];

      for (
        const item of candidates
      ) {
        const duplicate =
          unique.some(
            (existing) =>
              Math.abs(
                existing.x -
                  item.x
              ) < 3 &&
              Math.abs(
                existing.y -
                  item.y
              ) < 3
          );

        if (
          duplicate
        ) {
          continue;
        }

        unique.push(
          item
        );
      }

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
   WAIT FOR ITEMS
========================================================= */

async function waitForThrowItems(
  page
) {
  console.log(
    "尋找可丟道具..."
  );

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
      console.log(
        `✅ 找到 ${items.length} 個道具候選`
      );

      return items;
    }

    console.log(
      `第 ${attempt} 次尚未找到道具，等待面板...`
    );

    await page.waitForTimeout(
      500
    );
  }

  await safeScreenshot(
    page,
    "no-items.png"
  );

  throw new Error(
    "丟東西面板已開，但找不到道具"
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
    "========================================"
  );

  console.log(
    "🎯 準備確認反擊對象"
  );

  console.log(
    "========================================"
  );

  console.log(
    `最新攻擊者：${target}`
  );

  console.log(
    `對方最後丟你：${latest.item}`
  );

  console.log("");

  /*
   * 點攻擊者
   */
  await clickPlayerAvatar(
    page,
    target
  );

  /*
   * 打開丟東西面板
   */
  await openThrowPanel(
    page
  );

  /*
   * 找可用道具
   */
  const items =
    await waitForThrowItems(
      page
    );

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "🎁 偵測到的道具候選"
  );

  console.log(
    "========================================"
  );

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

  if (!selected) {
    throw new Error(
      "無法隨機選擇道具"
    );
  }

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "🔥 如果現在執行反擊"
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
    `本次隨機選到：${selected.name}`
  );

  console.log("");
  console.log(
    "⚠️ 本測試版不會點擊道具"
  );

  console.log(
    "⚠️ 本測試版不會真的丟東西"
  );

  console.log(
    "========================================"
  );

  return {
    target,
    selectedItem:
      selected.name,
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
    await login(
      page
    );

    /*
     * 2. 點自己頭像
     *
     * 3. 讀最近紀錄
     *
     * 4. 最上面 = 最新
     */
    const latest =
      await readRecentRecords(
        page
      );

    /*
     * 5. 點最新攻擊者
     *
     * 6. 打開丟東西
     *
     * 7. 隨機選一個道具
     *
     * 8. 只顯示，不真的丟
     */
    await previewRetaliation(
      page,
      latest
    );

    console.log("");
    console.log(
      "✅ 偵測測試完成"
    );

    console.log(
      "✅ 沒有執行任何丟東西動作"
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