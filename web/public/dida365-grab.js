/*!
 * dida365(滴答清单)全量数据抓取 — 浏览器控制台脚本
 *
 * 用法:
 *   1. 用浏览器打开 https://dida365.com/webapp/ 并确保已登录
 *   2. F12 → Console,粘贴本文件全部内容并回车
 *   3. 浏览器会下载 dida365-export-<日期>.json
 *   4. 打开局域网服务器上的 /dida-sync/ 页面,上传该文件完成导入
 *
 * 原理:脚本运行在 dida365.com 源下,携带登录 Cookie 调用网页版自用的
 * 内部 API(batch/check/0 返回全部清单与任务;已完成任务按清单逐个补拉,
 * 失败则跳过)。导出的 JSON 只包含任务数据,不含账号凭据。
 */
(async () => {
  const API = 'https://api.dida365.com'

  const getJSON = async (path) => {
    const r = await fetch(API + path, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`)
    return r.json()
  }

  // ---- 1. 全量同步数据(网页版自用的接口) ----
  const bean = await getJSON('/batch/check/0')

  // 不同版本的接口把任务放在不同的字段里,逐个兜底
  const tasks = bean?.syncTaskBean?.update
    ?? bean?.syncBean?.update
    ?? bean?.syncBean?.syncTaskBean?.update
    ?? bean?.tasks
    ?? []
  const projects = bean?.projectProfiles
    ?? bean?.syncBean?.projectProfiles
    ?? bean?.projectGroups // 兜底:至少保留分组名
    ?? []
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('未取到任务数据——接口返回结构可能已变化,请把控制台里的返回内容反馈给维护者')
  }

  // ---- 2. 已完成任务(best-effort:batch/check/0 有时不含已完成) ----
  const seen = new Set(tasks.map((t) => t.id))
  let completedFetched = 0
  for (const p of projects) {
    if (!p?.id) continue
    for (const path of [`/project/${p.id}/completed`, `/v2/project/${p.id}/completed`]) {
      try {
        const arr = await getJSON(path)
        if (Array.isArray(arr)) {
          for (const t of arr) {
            if (t?.id && !seen.has(t.id)) { seen.add(t.id); tasks.push(t); completedFetched++ }
          }
          break
        }
      } catch { /* 该清单无已完成接口或无权限,跳过 */ }
    }
  }

  // ---- 3. 导出 ----
  const exportData = {
    source: 'dida365',
    version: 1,
    exported_at: new Date().toISOString(),
    projects,
    tasks,
  }
  const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `dida365-export-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)

  const done = tasks.filter((t) => t.status === 2).length
  console.log('[dida365 导出] 清单:', projects, '任务:', tasks)
  alert(
    `导出完成,文件已开始下载\n\n`
    + `清单:${projects.length} 个\n`
    + `任务:${tasks.length} 条(已完成 ${done} 条,其中补拉 ${completedFetched} 条)\n\n`
    + `下一步:打开局域网服务器的 /dida-sync/ 页面上传导入`,
  )
})().catch((e) => {
  console.error('[dida365 导出] 失败:', e)
  alert(`导出失败:${e.message}\n\n请确认已登录 dida365 网页版后重试`)
})
