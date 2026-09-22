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
    process.env.THROW_COUNT ||
    "1"
  );

const CLICK_GAP_MS =
  Number(
    process.env.CLICK_GAP_MS ||
    "1000"
  );

const sleep = (ms) =>
  new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );

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
  !Number.isInteger(
    THROW_COUNT
  ) ||
  THROW_COUNT < 1 ||
  THROW_COUNT > 100
) {
  console.error(
    "❌ THROW_COUNT 必須是 1～100 的整數"
  );

  process.exit(1);
}

if (
  !Number.isFinite(
    CLICK_GAP_MS
  ) ||
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
      .locator(
        "select"
      )
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
    page.locator(
      "input"
    );

  let pinInput =
    null;

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
        .catch(
          () => false
        );

    if (!isVisible) {
      continue;
    }

    const type =
      (
        await input
          .getAttribute(
            "type"
          )
      ) || "";

    const placeholder =
      (
        await input
          .getAttribute(
            "placeholder"
          )
      ) || "";

    if (
      type ===
        "password" ||
      placeholder
        .toLowerCase()
        .includes(
          "pin"
        ) ||
      placeholder
        .includes(
          "6"
        )
    ) {
      pinInput =
        input;

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

  await pinInput.fill(
    PIN
  );

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
      .locator(
        "text.name"
      )
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

  let point =
    null;

  for (
    let attempt = 1;
    attempt <= 30;
    attempt++
  ) {
    point =
      await targetText.evaluate(
        (
          textEl
        ) => {
          const group =
            textEl.closest(
              "g"
            );

          if (!group) {
            return null;
          }

          const candidates =
            [
              group.querySelector(
                "image"
              ),

              group.querySelector(
                "circle"
              ),

              textEl,

              group,
            ].filter(
              Boolean
            );

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
        function visible(
          el
        ) {
          const rect =
            el.getBoundingClientRect();

          const style =
            getComputedStyle(
              el
            );

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

        const all =
          [
            ...document.querySelectorAll(
              "body *"
            ),
          ];

        /*
         * 先確認「最近紀錄」區存在。
         *
         * 這一步跟「今天沒有人丟」分開判斷。
         */
        const recentTitleCandidates =
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

              return text.includes(
                "最近紀錄"
              );
            }
          );

        /*
         * 完全沒有最近紀錄區：
         * 視為 UI / DOM 異常。
         */
        if (
          recentTitleCandidates.length ===
          0
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

        /*
         * 找同時包含：
         *
         * 最近紀錄
         * 丟了
         *
         * 的容器。
         *
         * 如果沒有，代表紀錄區存在，
         * 但目前沒有被丟紀錄。
         */
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
          recentContainers.length ===
          0
        ) {
          return {
            status:
              "NO_RECORDS",

            latest:
              null,

            records:
              [],

            debug:
              "最近紀錄區存在，但目前沒有「丟了」紀錄",
          };
        }

        /*
         * 面積最小的容器優先，
         * 避免抓到整個右側 panel。
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

        const descendants =
          [
            container,

            ...container
              .querySelectorAll(
                "*"
              ),
          ];

        const candidates =
          [];

        for (
          const el
          of descendants
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

            y:
              rect.top,

            x:
              rect.left,

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
         * 先去除完全相同的 DOM 文字
         */
        const unique =
          [];

        const seen =
          new Set();

        for (
          const item
          of candidates
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

        const records =
          [];

        /*
         * 用 sender + item 再去除
         * 父子 DOM 重複。
         */
        const recordKeys =
          new Set();

        for (
          const item
          of unique
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
           * 去掉名字前面的 emoji
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
           * 去除尾端時間：
           *
           * 6 小時前
           * 10 分鐘前
           * 30 秒前
           * 1 天前
           * 剛剛
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
           * 父容器裡可能包含多筆「丟了」
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
         * 如果有「丟了」文字，
         * 但完全解析不到，
         * 這不是「沒人丟」，
         * 而是格式改變。
         */
        if (
          records.length ===
          0
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

        /*
         * 越上面越新
         */
        records.sort(
          (a, b) =>
            a.y - b.y
        );

        const latest =
          records[0];

        return {
          status:
            "OK",

          latest,

          records,

          debug:
            container.innerText,
        };
      }
    );

  /*
   * 情況 1：
   * 最近紀錄區根本不存在
   */
  if (
    result.status ===
    "NO_RECORD_PANEL"
  ) {
    await safeScreenshot(
      page,
      "recent-records-error.png"
    );

    throw new Error(
      "找不到最近紀錄區塊，可能是頁面尚未載入或網站 DOM 已變更"
    );
  }

  /*
   * 情況 2：
   * 最近紀錄區存在，
   * 但今天沒有人丟你。
   */
  if (
    result.status ===
    "NO_RECORDS"
  ) {
    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "ℹ️ 目前沒有任何人丟東西給你"
    );

    console.log(
      "ℹ️ 本次不執行反擊"
    );

    console.log(
      "========================================"
    );

    return null;
  }

  /*
   * 情況 3：
   * 有紀錄，但格式解析失敗
   */
  if (
    result.status ===
    "PARSE_ERROR"
  ) {
    console.log("");
    console.log(
      "===== 原始最近紀錄區塊 ====="
    );

    console.log(
      result.debug
    );

    console.log(
      "=============================="
    );

    await safeScreenshot(
      page,
      "recent-records-error.png"
    );

    throw new Error(
      "最近紀錄存在，但無法解析，可能是網站紀錄格式已變更"
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

      const all =
        [
          ...document.querySelectorAll(
            "body *"
          ),
        ];

      const matches =
        [];

      for (
        const el
        of all
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
          getComputedStyle(
            el
          );

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
      /*
       * 小元素優先，
       * 避免點到父容器。
       */
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
        `x=${target.x.toFixed(1)}, ` +
        `y=${target.y.toFixed(1)}`
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
      function visible(
        el
      ) {
        const rect =
          el.getBoundingClientRect();

        const style =
          getComputedStyle(
            el
          );

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

      const all =
        [
          ...document.querySelectorAll(
            "body *"
          ),
        ];

      const candidates =
        [];

      for (
        const el
        of all
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

        /*
         * 排除巨大容器
         */
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
          role ===
            "button";

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
       * 同座標父子 DOM 去重
       */
      const unique =
        [];

      for (
        const item
        of candidates
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

        if (duplicate) {
          continue;
        }

        unique.push(
          item
        );
      }

      /*
       * data-item / data-name
       * 優先。
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
   WAIT FOR THROW ITEMS
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

  /*
   * 點最新攻擊者
   */
  await clickPlayerAvatar(
    page,
    target
  );

  /*
   * 打開丟東西
   */
  await openThrowPanel(
    page
  );

  let successCount =
    0;

  const throwLog =
    [];

  for (
    let i = 0;
    i < THROW_COUNT;
    i++
  ) {
    try {
      /*
       * 每次重新抓 DOM，
       * 避免點完後 UI rerender。
       */
      const items =
        await waitForThrowItems(
          page
        );

      if (
        items.length === 0
      ) {
        throw new Error(
          "目前沒有可丟道具"
        );
      }

      const selected =
        chooseRandomItem(
          items
        );

      if (!selected) {
        throw new Error(
          "隨機選擇道具失敗"
        );
      }

      console.log("");
      console.log(
        `🎲 第 ${i + 1}/${THROW_COUNT} 次`
      );

      console.log(
        `隨機選到：${selected.name}`
      );

      /*
       * 真實滑鼠點擊
       */
      await page.mouse.move(
        selected.x,
        selected.y
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

      throwLog.push(
        selected.name
      );

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

  /*
   * 統計本次道具
   */
  const stats =
    {};

  for (
    const itemName
    of throwLog
  ) {
    stats[
      itemName
    ] =
      (
        stats[
          itemName
        ] ||
        0
      ) + 1;
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
    `成功次數：${successCount}/${THROW_COUNT}`
  );

  console.log("");
  console.log(
    "本次道具統計："
  );

  for (
    const [
      itemName,
      count,
    ]
    of Object.entries(
      stats
    )
  ) {
    console.log(
      `- ${itemName}: ${count} 次`
    );
  }

  console.log(
    "========================================"
  );

  return {
    target,
    successCount,
    throwLog,
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
     * 1. 登入
     */
    await login(
      page
    );

    /*
     * 2. 點自己
     *
     * 3. 讀最近紀錄
     */
    const latest =
      await readRecentRecords(
        page
      );

    /*
     * 沒有人丟：
     * 正常結束，不反擊。
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

    /*
     * 額外安全檢查
     */
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
     * 4. 真正反擊
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

    process.exitCode =
      1;
  } finally {
    await browser.close();
  }
})();