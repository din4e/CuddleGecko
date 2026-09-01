'use strict';
// (分号必须保留:下一行是 IIFE,否则被 ASI 解析成 'use strict'(...) 调用)
/* ============================================================
 * dida365 → CuddleGecko 待办导入核心逻辑(无 DOM 依赖)
 * 被 index.html 引用,也可在 Node 里直接 eval 做端到端测试。
 *
 * 结构:dida 清单(project)→ 根节点「📥 滴答清单」下的子任务;
 * dida 任务 → 待办(保留 parent/child 层级与截止/开始时间);
 * dida 检查清单 items → 待办子项(TodoItem)。
 *
 * 幂等:根节点 description 带有 MARKER,重跑时先级联删除旧根
 * (进回收站,可恢复),再按导出文件全量重建。
 * ============================================================ */
(function (global) {
  const MARKER = '[dida365-sync]'
  const ROOT_TITLE = '📥 滴答清单'

  /* ---------- API 封装(响应为 {code,data,message}) ---------- */
  function makeApi(baseUrl, getToken) {
    return async function api(path, opts = {}) {
      const res = await fetch(baseUrl + path, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
          ...(opts.headers || {}),
        },
      })
      let body = null
      try { body = await res.json() } catch { /* 非 JSON 响应 */ }
      if (!res.ok || !body || body.code !== 0) {
        const err = new Error(body?.message || 'HTTP ' + res.status)
        err.message_text = body?.message || ''
        throw err
      }
      return body.data
    }
  }

  /* dida 优先级(0无/1低/3中/5高)→ CG(low/normal/high) */
  function mapPriority(p) {
    return { 1: 'low', 5: 'high' }[p] || 'normal'
  }

  /* dida 时间 "2026-08-22T03:00:00.000+0000" → RFC3339;空/无效返回 "" */
  function mapTime(v) {
    if (!v) return ''
    const d = new Date(String(v).replace(/(\.\d{3})([+-]\d{2})(\d{2})$/, '$1$2:$3'))
    return isNaN(d) ? '' : d.toISOString()
  }

  async function createTodo(api, t) {
    const data = await api('/api/todos', {
      method: 'POST',
      body: JSON.stringify({
        title: (t.title || '(无标题)').slice(0, 200),
        description: t.content || '',
        status: t.status === 2 ? 'done' : 'pending',
        priority: mapPriority(t.priority),
        due_time: mapTime(t.dueDate),
        start_time: mapTime(t.startDate),
        parent_id: t._cgParent ?? null,
      }),
    })
    return data.id
  }

  async function createItems(api, todoId, items) {
    for (const it of items) {
      const created = await api(`/api/todos/${todoId}/items`, {
        method: 'POST',
        body: JSON.stringify({ content: (it.title || '(无标题)').slice(0, 500) }),
      })
      if (it.status === 2) {
        await api(`/api/todos/${todoId}/items/${created.id}/toggle`, { method: 'PATCH' })
      }
    }
  }

  /**
   * 全量同步。幂等:先删除带 MARKER 的旧根,再重建整棵树。
   * @param {object} exportData {projects: [], tasks: []} — dida365-grab.js 导出格式
   * @param {object} opts {baseUrl, token, includeDone, includeItems, log}
   *   log(text, cls) — cls ∈ 'ok' | 'err' | 'dim' | ''
   * @returns {object} {todoCount, itemCount, errorCount}
   */
  async function runSync(exportData, opts) {
    const { baseUrl = '', token, includeDone = true, includeItems = true, log = () => {} } = opts
    let currentToken = token
    const api = makeApi(baseUrl, () => currentToken)
    const tasks = exportData?.tasks || []
    const projects = exportData?.projects || []

    // 幂等清理:删除带旧同步标记的根节点(级联进回收站)
    const existing = await api('/api/todos?page_size=100000')
    const oldRoots = (existing.items || []).filter((t) => (t.description || '').startsWith(MARKER))
    for (const r of oldRoots) {
      await api('/api/todos/' + r.id, { method: 'DELETE' })
      log(`清理旧同步根节点 #${r.id}`, 'dim')
    }

    let todoCount = 0, itemCount = 0, errorCount = 0

    // 建根节点
    const rootId = await createTodo(api, {
      title: ROOT_TITLE,
      content: `${MARKER} 上次同步:${new Date().toLocaleString('zh-CN')}`,
    })
    log(`创建根节点「${ROOT_TITLE}」#${rootId}`, 'ok')
    todoCount++

    // 按清单分组;没有 projectId 的任务属于「收集箱」——它是 dida 的内置
    // 清单概念而非真实任务,不建节点,直接挂到同步根下。
    const byProject = new Map()
    for (const t of tasks) {
      if (!includeDone && t.status === 2) continue
      const pid = t.projectId || '(inbox)'
      if (!byProject.has(pid)) byProject.set(pid, [])
      byProject.get(pid).push(t)
    }
    const projName = new Map(projects.map((p) => [p.id, p.name || '(未命名清单)']))

    for (const [pid, list] of byProject) {
      // 收集箱(无 projectId,或名为 收集箱/Inbox 的清单)不建父节点
      const name = pid === '(inbox)' ? '收集箱' : (projName.get(pid) || pid)
      const isInbox = pid === '(inbox)' || name === '收集箱' || name === 'Inbox'
      const projTodoId = isInbox ? rootId : await createTodo(api, { title: `📋 ${name}`, _cgParent: rootId })
      if (!isInbox) todoCount++
      log(`${isInbox ? '收集箱' : `清单「${name}」`}(${list.length} 条)`, 'dim')

      // 组树:子任务按 dida parentId 挂到已建的父节点
      const children = new Map()
      for (const t of list) {
        const parent = t.parentId && t.parentId !== '-1' ? t.parentId : null
        if (parent && list.some((x) => x.id === parent)) {
          if (!children.has(parent)) children.set(parent, [])
          children.get(parent).push(t)
        }
      }
      const build = async (arr, cgParent) => {
        // dida sortOrder 越大越靠前
        const sorted = [...arr].sort((a, b) => (b.sortOrder || 0) - (a.sortOrder || 0))
        for (const t of sorted) {
          try {
            const id = await createTodo(api, { ...t, _cgParent: cgParent })
            todoCount++
            if (includeItems && Array.isArray(t.items) && t.items.length) {
              await createItems(api, id, t.items)
              itemCount += t.items.length
            }
            const kids = children.get(t.id)
            if (kids) await build(kids, id)
          } catch (e) {
            errorCount++
            log(`  ✗ 「${t.title}」失败:${e.message}`, 'err')
          }
        }
      }
      const top = list.filter((t) => {
        const parent = t.parentId && t.parentId !== '-1' ? t.parentId : null
        return !parent || !list.some((x) => x.id === parent)
      })
      await build(top, projTodoId)
    }

    log('—— 同步完成 ——', 'ok')
    return { todoCount, itemCount, errorCount }
  }

  global.DidaSync = { MARKER, ROOT_TITLE, makeApi, mapPriority, mapTime, createTodo, createItems, runSync }
})(typeof window !== 'undefined' ? window : globalThis)
