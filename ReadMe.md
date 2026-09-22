# DiuSaiBot

自動化操作「貓咪公爵｜瑪奇 Mobile · 成員關係圖」的 GitHub Actions + Playwright 腳本。

目前用途：

- 自動登入指定角色
- 自動找到指定公會成員
- 打開「丟東西」面板
- 自動選擇「貓黃金」
- 每小時自動執行一次
- 由 cron-job.org 觸發 GitHub Actions，密碼$P這個
- 不需要人工手動按 `Run workflow`

---

## 系統架構

目前整體流程如下：

```text
cron-job.org
    ↓
每小時 XX:02 發送 POST
    ↓
GitHub REST API
    ↓
workflow_dispatch
    ↓
GitHub Actions
    ↓
Playwright
    ↓
登入網站
    ↓
找到指定角色
    ↓
打開「丟東西」
    ↓
丟指定次數的「貓黃金」
    ↓
完成