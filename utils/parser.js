/**
 * 接龙文本解析器
 * 输入：接龙原始文本（每行通常是「序号. 昵称 [备注/分组]」）
 * 输出：{ title, groups: [{ name, members: [{ name, note }] }], total }
 *
 * 模糊分组策略（优先级从高到低）：
 *  1. 精确关键词匹配（含"慢跑/放松/轻松"）
 *  2. 重复同字母匹配：DD / DDD → D
 *  3. 范围写法取首字母：A→C / B-D / A~C → A
 *  4. 孤立单字母：内容里找到唯一的 A-F 字母
 *
 * "跟上/跟住 xx" 二阶段策略：
 *  第一阶段：提取被跟随人的名字，标记为待解析
 *  第二阶段：所有行解析完毕后，按名字索引查找被跟随者的分组并回填
 */

// 精确关键词规则
const GROUP_RULES = [
  { key: 'A',    label: 'A组' },
  { key: 'B',    label: 'B组' },
  { key: 'C',    label: 'C组' },
  { key: 'D',    label: 'D组' },
  { key: 'E',    label: 'E组' },
  { key: 'F',    label: 'F组' },
  { key: 'slow', label: '慢跑组' }
]

const GROUP_KEY_MAP = {}
GROUP_RULES.forEach(r => { GROUP_KEY_MAP[r.key] = r.label })

const OTHER_LABEL = '其他'
const FOLLOW_PENDING = '__follow__'   // 待解析占位符

/**
 * 精确+模糊识别组别，返回 groupKey 或 OTHER_LABEL
 */
function detectGroup(content) {
  const s = content.toUpperCase()

  // 1. 慢跑/放松/轻松
  if (/慢跑|放松|轻松/.test(content)) return 'slow'

  // 2. 精确单字母 + "组" 可选：A组 / A 组 / A
  //    用边界判断，防止误匹配 "starl-魏"
  for (const key of ['A','B','C','D','E','F']) {
    // 单独的 X 或 X组（X 前后不是其他字母）
    if (new RegExp('(?<![A-Z])' + key + '{1}(?:组)?(?![A-Z])', 'i').test(s)) {
      return key
    }
  }

  return OTHER_LABEL
}

/**
 * 模糊分组：在精确识别基础上增加以下规则
 *  - DD/DDD → D（重复字母）
 *  - A→C / B-D / A~C → 取首字母
 *  - 孤立单字母（更宽松）
 */
function fuzzyDetectGroup(content) {
  // 1. 先走精确路径
  const exact = detectGroup(content)
  if (exact !== OTHER_LABEL) return exact

  const s = content.toUpperCase()

  // 2. 重复字母：DD / DDD / Ddd → D
  const repeatMatch = s.match(/(?<![A-Z])([A-F])\1+(?![A-Z])/)
  if (repeatMatch) return repeatMatch[1]

  // 3. 范围写法取首字母：A→C / A-C / A~C / A—C / A to C
  const rangeMatch = s.match(/(?<![A-Z])([A-F])[\s]*(?:→|->|—|-|~|TO)[\s]*[A-F](?![A-Z])/)
  if (rangeMatch) return rangeMatch[1]

  // 4. 慢跑/放松/轻松 (重复保险)
  if (/慢跑|放松|轻松/.test(content)) return 'slow'

  return OTHER_LABEL
}

/**
 * 识别"跟上/跟住/跟着/跟紧/跟随 + 人名关键词"，返回被跟随者的名字片段
 * 若未匹配则返回 null
 */
function detectFollow(content) {
  const m = content.match(/跟[上住着紧随][\s]*([\u4e00-\u9fa5a-zA-Z0-9_\-]{1,10})/)
  if (m) return m[1].trim()
  return null
}

/**
 * 去除常见emoji与多余空白，保留中英文与基本标点
 */
function cleanName(s) {
  if (!s) return ''
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/[💝💪💫🍓🐉💗💰👑🍀🌸]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 解析单行接龙，返回 null 表示跳过
 */
function parseLine(rawLine) {
  const line = rawLine.trim()
  if (!line) return null

  // 去掉序号前缀：1. / 1、/ 1) / 1．
  const m = line.match(/^\s*(\d+)\s*[\.、\)．]\s*(.+)$/)
  if (!m) return null

  const content = m[2].trim()

  // 切分昵称与备注
  let name = content
  let note = ''
  const splitMatch = content.match(/^([^\s\u3000\-—]+)[\s\u3000\-—]+(.+)$/)
  if (splitMatch) {
    name = splitMatch[1]
    note = splitMatch[2]
  }

  // 模糊识别分组（从完整内容里识别）
  let groupKey = fuzzyDetectGroup(content)

  // 检测"跟上xx"引用（仅在无明确分组时生效）
  let followRef = null
  if (groupKey === OTHER_LABEL) {
    followRef = detectFollow(content)
    if (followRef) groupKey = FOLLOW_PENDING
  }

  // 清理备注中的纯分组标记
  const noteStripped = note
    .replace(/^[A-Fa-f]{1,3}\s*组?$/, '')
    .replace(/^慢跑$|^放松$|^轻松$/, '')
    .replace(/^[A-Fa-f]\s*[\-—→~to]+\s*[A-Fa-f]\s*组?$/i, '')
    .trim()
  note = note
    .replace(/^[A-Fa-f]{1,3}\s*组?\s*/i, '')
    .replace(/^慢跑\s*|^放松\s*|^轻松\s*/, '')
    .trim()
  if (!noteStripped) note = ''

  return {
    index: parseInt(m[1], 10),
    name: cleanName(name) || name,
    note: cleanName(note),
    groupKey,
    groupLabel: GROUP_KEY_MAP[groupKey] || (groupKey === FOLLOW_PENDING ? FOLLOW_PENDING : OTHER_LABEL),
    followRef   // 被跟随者的名字片段（待第二阶段解析）
  }
}

/**
 * 主解析函数（两阶段）
 */
function parseJielong(text, options = {}) {
  const title = (options.title || '接龙分组').trim()
  const lines = String(text || '').split(/\r?\n/)

  // 提取首行可能的标题（非数字开头的有意义文本）
  let detectedTitle = ''
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (/^\s*\d+\s*[\.、\)．]/.test(t)) break
    detectedTitle = cleanName(t) || t
    break
  }

  // ── 第一阶段：基础解析 ───────────────────────────────────────────────
  const parsed = lines.map(parseLine).filter(Boolean)

  // 建立"昵称 → groupKey"索引（用于第二阶段查找）
  const nameGroupIndex = {}
  for (const item of parsed) {
    if (item.groupKey !== FOLLOW_PENDING && item.groupKey !== OTHER_LABEL) {
      nameGroupIndex[item.name] = item.groupKey
    }
  }

  // ── 第二阶段：解析"跟上xx"引用 ──────────────────────────────────────
  for (const item of parsed) {
    if (item.groupKey !== FOLLOW_PENDING) continue

    const ref = item.followRef
    if (!ref) { item.groupKey = OTHER_LABEL; continue }

    const knownNames = Object.keys(nameGroupIndex)

    // 策略1：子串包含（ref 包含在名字里，或名字包含在 ref 里）
    let found = null
    for (const n of knownNames) {
      if (n.includes(ref) || ref.includes(n)) { found = nameGroupIndex[n]; break }
    }

    // 策略2：按字符匹配得分（取得分最高的名字）
    if (!found) {
      let bestScore = 0
      for (const n of knownNames) {
        let score = 0
        for (const ch of ref) {
          if (/[\u4e00-\u9fa5]/.test(ch) && n.includes(ch)) score++
        }
        if (score > bestScore) { bestScore = score; found = nameGroupIndex[n] }
      }
      if (bestScore === 0) found = null
    }

    if (found) {
      item.groupKey = found
      item.groupLabel = GROUP_KEY_MAP[found]
    } else {
      item.groupKey = OTHER_LABEL
      item.groupLabel = OTHER_LABEL
    }
  }

  // ── 聚合分组 ──────────────────────────────────────────────────────────
  const groupOrder = []
  const groupMap = {}
  for (const item of parsed) {
    const key = item.groupKey
    const label = GROUP_KEY_MAP[key] || OTHER_LABEL
    if (!groupMap[key]) {
      groupMap[key] = { key, label, members: [] }
      groupOrder.push(key)
    }
    groupMap[key].members.push({ name: item.name, note: item.note })
  }

  // 排序：A B C D E F 慢跑 其他
  const orderRank = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, slow: 7, [OTHER_LABEL]: 8 }
  groupOrder.sort((a, b) => (orderRank[a] || 99) - (orderRank[b] || 99))

  const groups = groupOrder.map(k => groupMap[k])

  return {
    title: detectedTitle || title,
    groups,
    total: parsed.length
  }
}

/**
 * 生成 PlantUML WBS 图
 */
function toWBS(parsed) {
  const lines = ['@startwbs']
  lines.push('<style>')
  lines.push('wbsDiagram {')
  lines.push('  .root   { BackgroundColor #2c3e50; FontColor white;   FontSize 18; FontStyle bold; }')
  lines.push('  .group  { BackgroundColor #3498db; FontColor white;   FontSize 14; FontStyle bold; }')
  lines.push('  .slow   { BackgroundColor #7f8c8d; FontColor white;   FontSize 14; }')
  lines.push('  .other  { BackgroundColor #bdc3c7; FontColor #2c3e50; FontSize 14; }')
  lines.push('  .member { BackgroundColor #ecf0f1; FontColor #2c3e50; FontSize 12; }')
  lines.push('}')
  lines.push('</style>')

  lines.push(`* ${escapeText(parsed.title)}\\n共${parsed.total}人 <<root>>`)

  for (const g of parsed.groups) {
    const style = g.key === 'slow' ? 'slow' : (g.key === OTHER_LABEL ? 'other' : 'group')
    lines.push(`** ${escapeText(g.label)} (${g.members.length}人) <<${style}>>`)
    for (const m of g.members) {
      const display = m.note ? `${escapeText(m.name)}\\n${escapeText(m.note)}` : escapeText(m.name)
      lines.push(`*** ${display} <<member>>`)
    }
  }

  lines.push('@endwbs')
  return lines.join('\n')
}

function escapeText(s) {
  return String(s || '').replace(/\*/g, '＊').replace(/\|/g, '｜')
}

module.exports = {
  parseJielong,
  toWBS
}
