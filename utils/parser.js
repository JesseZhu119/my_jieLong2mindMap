/**
 * 接龙文本解析器
 * 输入：接龙原始文本（每行通常是「序号. 昵称 [备注/分组]」）
 * 输出：{ title, groups: [{ name, members: [{ name, note }] }], total }
 *
 * 模糊分组策略（优先级从高到低）：
 *  1. 精确关键词匹配（含"慢跑/放松/轻松"）
 *  2. 重复同字母匹配：DD / DDD → D
 *  3. 范围写法取首字母：A→C / B-D / A~C → A
 *  4. 孤立单字母：内容里找到唯一的 A-D 字母
 *
 * "跟上/跟住 xx" 二阶段策略：
 *  第一阶段：提取被跟随人的名字，标记为待解析
 *  第二阶段：所有行解析完毕后，按名字索引查找被跟随者的分组并回填
 *            若原名未命中，再尝试“别称 -> 主名”映射
 */

const { buildAliasToCanonicalMap } = require('./nameAliases.js')

// 精确关键词规则
const GROUP_RULES = [
  { key: 'A',    label: 'A组' },
  { key: 'B',    label: 'B组' },
  { key: 'C',    label: 'C组' },
  { key: 'D',    label: 'D组' },
  { key: 'slow', label: '慢跑组' }
]

const GROUP_KEY_MAP = {}
GROUP_RULES.forEach(r => { GROUP_KEY_MAP[r.key] = r.label })

const UNKNOWN_GROUP_KEY = '__unknown__'
const FALLBACK_GROUP_KEY = 'slow'
const FOLLOW_PENDING = '__follow__'   // 待解析占位符
const LEGEND_MAX_CJK_WIDTH = 20
const PACER_GROUP_KEYS = ['A', 'B', 'C', 'D']

function isMemberLine(line) {
  // Avoid matching decimal schedule lines like "1.2公里配速..."
  return /^\s*\d+\s*[\.、\)．](?!\d)/.test(line)
}

function normalizeTitleLine(line) {
  return cleanName(String(line || '').replace(/^[#＃]+\s*/, '').trim())
}

function extractPacerNameFromGroupDesc(desc) {
  const text = cleanName(String(desc || ''))
  if (!text) return ''

  // 兼容：配速员冯斌 / 配速员: 冯斌 / 配速员（冯斌）
  const patterns = [
    /配速员[：:]?\s*([\u4e00-\u9fa5A-Za-z0-9_\-]{1,16})/,
    /配速员[（(]\s*([^）)\s]{1,16})\s*[）)]/
  ]

  for (const re of patterns) {
    const m = text.match(re)
    if (!m || !m[1]) continue
    const name = cleanName(m[1])
    if (name) return name
  }

  return ''
}

/**
 * 提取接龙头部信息（成员清单之前）：
 * - 标题
 * - 课程内容简介
 * - 分组说明（A/B/C/D...）
 */
function extractHeaderMeta(lines) {
  const firstMemberIndex = lines.findIndex(isMemberLine)
  const headerLines = (firstMemberIndex === -1 ? lines : lines.slice(0, firstMemberIndex))
    .map(l => String(l || '').trim())
    .filter(Boolean)

  if (!headerLines.length) {
    return {
      headerTitle: '',
      introLines: [],
      introText: '',
      groupBriefs: [],
      headerPacerByGroup: {}
    }
  }

  const headerTitle = normalizeTitleLine(headerLines[0])
  const introLines = []
  const groupBriefMap = {}
  const groupBriefOrder = []
  const headerPacerByGroup = {}
  let currentGroupKey = null

  const pushGroupBrief = (key, desc) => {
    const text = cleanName(desc)
    if (!text) return
    if (!groupBriefMap[key]) {
      groupBriefMap[key] = text
      groupBriefOrder.push(key)
    } else {
      groupBriefMap[key] += `；${text}`
    }
  }

  for (let i = 0; i < headerLines.length; i++) {
    const raw = headerLines[i]
    const line = cleanName(raw)
    if (!line) continue

    if (i === 0 && normalizeTitleLine(raw) === headerTitle) {
      currentGroupKey = null
      continue
    }

    // 兼容多种写法：A组 8公里... / A组:8公里... / A 8公里... / A组8公里...
    const groupMatch = line.match(/^([A-Da-d])\s*组?\s*(?:[：:\-]\s*)?(.+)$/)
    if (groupMatch) {
      currentGroupKey = groupMatch[1].toUpperCase()
      const desc = groupMatch[2]
      const pacerName = extractPacerNameFromGroupDesc(desc)
      if (pacerName && !headerPacerByGroup[currentGroupKey]) {
        headerPacerByGroup[currentGroupKey] = pacerName
      }
      pushGroupBrief(currentGroupKey, desc)
      continue
    }

    if (/^(其余|其他).*(慢跑|放松|轻松)|^(慢跑|放松|轻松)/.test(line)) {
      currentGroupKey = 'slow'
      pushGroupBrief(currentGroupKey, line)
      continue
    }

    // 紧跟在分组行后的非空行视作该组补充说明（如 400 米配速）
    if (currentGroupKey && !/^([A-Da-d])\s*组?/.test(line)) {
      pushGroupBrief(currentGroupKey, line)
      continue
    }

    currentGroupKey = null
    introLines.push(line)
  }

  const rank = { A: 1, B: 2, C: 3, D: 4, slow: 5 }
  groupBriefOrder.sort((a, b) => (rank[a] || 99) - (rank[b] || 99))

  const groupBriefs = groupBriefOrder.map(key => ({
    key,
    label: GROUP_KEY_MAP[key] || (key === 'slow' ? '慢跑组' : key),
    desc: groupBriefMap[key]
  }))

  return {
    headerTitle,
    introLines,
    introText: introLines.join('；'),
    groupBriefs,
    headerPacerByGroup
  }
}

/**
 * 精确+模糊识别组别，返回 groupKey 或 UNKNOWN_GROUP_KEY
 */
function detectGroup(content) {
  const s = content.toUpperCase()

  // 1. 慢跑/放松/轻松
  if (/慢跑|放松|轻松/.test(content)) return 'slow'

  // 2. 精确单字母 + "组" 可选：A组 / A 组 / A
  //    用边界判断，防止误匹配 "starl-魏"
  for (const key of ['A', 'B', 'C', 'D']) {
    // 单独的 X 或 X组（X 前后不是其他字母）
    if (new RegExp('(?<![A-Z])' + key + '{1}(?:组)?(?![A-Z])', 'i').test(s)) {
      return key
    }
  }

  return UNKNOWN_GROUP_KEY
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
  if (exact !== UNKNOWN_GROUP_KEY) return exact

  const s = content.toUpperCase()

  // 2. 重复字母：DD / DDD / Ddd → D
  const repeatMatch = s.match(/(?<![A-Z])([A-D])\1+(?![A-Z])/)
  if (repeatMatch) return repeatMatch[1]

  // 3. 范围写法取首字母：A→C / A-C / A~C / A—C / A to C
  const rangeMatch = s.match(/(?<![A-Z])([A-D])[\s]*(?:→|->|—|-|~|TO)[\s]*[A-D](?![A-Z])/)
  if (rangeMatch) return rangeMatch[1]

  // 4. 慢跑/放松/轻松 (重复保险)
  if (/慢跑|放松|轻松/.test(content)) return 'slow'

  return UNKNOWN_GROUP_KEY
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

function cleanPacerTagText(s) {
  return String(s || '')
    .replace(/[\(（\[]?\s*配速员\s*[\)）\]]?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCompareName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-—_·.。\(\)（）\[\]【】]/g, '')
}

function isSameOrSimilarName(a, b) {
  const aKey = normalizeCompareName(a)
  const bKey = normalizeCompareName(b)
  if (!aKey || !bKey) return false
  return aKey === bKey || aKey.includes(bKey) || bKey.includes(aKey)
}

/**
 * 解析单行接龙，返回 null 表示跳过
 */
function parseLine(rawLine) {
  const line = rawLine.trim()
  if (!line) return null

  // 去掉序号前缀：1. / 1、/ 1) / 1．
  const m = line.match(/^\s*(\d+)\s*[\.、\)．](?!\d)\s*(.+)$/)
  if (!m) return null

  const content = m[2].trim()
  const hasPacerTag = /配速员/.test(content)

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
  if (groupKey === UNKNOWN_GROUP_KEY) {
    followRef = detectFollow(content)
    if (followRef) groupKey = FOLLOW_PENDING
  }

  // 清理备注中的纯分组标记
  const noteStripped = note
    .replace(/^[A-Da-d]{1,3}\s*组?$/, '')
    .replace(/^慢跑$|^放松$|^轻松$/, '')
    .replace(/^[A-Da-d]\s*[\-—→~to]+\s*[A-Da-d]\s*组?$/i, '')
    .trim()
  note = note
    .replace(/^[A-Da-d]{1,3}\s*组?\s*/i, '')
    .replace(/^慢跑\s*|^放松\s*|^轻松\s*/, '')
    .trim()
  if (!noteStripped) note = ''

  const cleanedName = cleanName(cleanPacerTagText(name)) || cleanName(name) || name
  const cleanedNote = cleanName(cleanPacerTagText(note))

  return {
    index: parseInt(m[1], 10),
    name: cleanedName,
    note: cleanedNote,
    groupKey,
    groupLabel: GROUP_KEY_MAP[groupKey] || (groupKey === FOLLOW_PENDING ? FOLLOW_PENDING : GROUP_KEY_MAP[FALLBACK_GROUP_KEY]),
    followRef,  // 被跟随者的名字片段（待第二阶段解析）
    selfMarkedPacer: hasPacerTag
  }
}

/**
 * 主解析函数（两阶段）
 */
function parseJielong(text, options = {}) {
  const title = (options.title || '接龙分组').trim()
  const lines = String(text || '').split(/\r?\n/)
  const headerMeta = extractHeaderMeta(lines)

  // ── 第一阶段：基础解析 ───────────────────────────────────────────────
  const parsed = lines.map(parseLine).filter(Boolean)

  // 建立"昵称 → groupKey"索引（用于第二阶段查找）
  const nameGroupIndex = {}
  for (const item of parsed) {
    if (item.groupKey !== FOLLOW_PENDING && item.groupKey !== UNKNOWN_GROUP_KEY) {
      nameGroupIndex[item.name] = item.groupKey
    }
  }
  const knownNames = Object.keys(nameGroupIndex)
  const aliasToCanonical = buildAliasToCanonicalMap(knownNames)

  // ── 第二阶段：解析"跟上xx"引用 ──────────────────────────────────────
  for (const item of parsed) {
    if (item.groupKey !== FOLLOW_PENDING) continue

    const ref = item.followRef
    if (!ref) {
      item.groupKey = FALLBACK_GROUP_KEY
      item.groupLabel = GROUP_KEY_MAP[FALLBACK_GROUP_KEY]
      continue
    }

    const refCandidates = [ref]
    const canonicalByAlias = aliasToCanonical[ref]
    if (canonicalByAlias && !refCandidates.includes(canonicalByAlias)) {
      refCandidates.push(canonicalByAlias)
    }

    // 策略1：子串包含（ref 包含在名字里，或名字包含在 ref 里）
    let found = null
    for (const candidate of refCandidates) {
      for (const n of knownNames) {
        if (n.includes(candidate) || candidate.includes(n)) {
          found = nameGroupIndex[n]
          break
        }
      }
      if (found) break
    }

    // 策略2：按字符匹配得分（取得分最高的名字）
    if (!found) {
      let bestScore = 0
      for (const candidate of refCandidates) {
        for (const n of knownNames) {
          let score = 0
          for (const ch of candidate) {
            if (/[\u4e00-\u9fa5]/.test(ch) && n.includes(ch)) score++
          }
          if (score > bestScore) { bestScore = score; found = nameGroupIndex[n] }
        }
      }
      if (bestScore === 0) found = null
    }

    if (found) {
      item.groupKey = found
      item.groupLabel = GROUP_KEY_MAP[found]
    } else {
      item.groupKey = FALLBACK_GROUP_KEY
      item.groupLabel = GROUP_KEY_MAP[FALLBACK_GROUP_KEY]
    }
  }

  // 未识别到 A/B/C/D/慢跑 的条目，统一归到慢跑组
  for (const item of parsed) {
    if (item.groupKey === UNKNOWN_GROUP_KEY) {
      item.groupKey = FALLBACK_GROUP_KEY
      item.groupLabel = GROUP_KEY_MAP[FALLBACK_GROUP_KEY]
    }
  }

  const manualPacers = options.manualPacers || {}
  const headerPacerByGroup = headerMeta.headerPacerByGroup || {}
  const pacerCandidatesByGroup = {}
  const manualPacerInputByGroup = {}
  const manualPacerMisses = []
  for (const key of PACER_GROUP_KEYS) {
    const manualName = String(manualPacers[key] || '').trim()
    manualPacerInputByGroup[key] = manualName
    const candidates = []

    if (manualName) {
      candidates.push(manualName)
      pacerCandidatesByGroup[key] = candidates
      continue
    }

    const headerPacerName = String(headerPacerByGroup[key] || '').trim()
    if (headerPacerName) {
      candidates.push(headerPacerName)
    }

    const autoPacer = parsed.find(p => p.groupKey === key && p.selfMarkedPacer)
    if (autoPacer) candidates.push(autoPacer.name)

    pacerCandidatesByGroup[key] = candidates
  }

  // ── 聚合分组 ──────────────────────────────────────────────────────────
  const groupOrder = []
  const groupMap = {}
  for (const item of parsed) {
    const key = item.groupKey
    const label = GROUP_KEY_MAP[key] || GROUP_KEY_MAP[FALLBACK_GROUP_KEY]
    if (!groupMap[key]) {
      groupMap[key] = { key, label, members: [] }
      groupOrder.push(key)
    }
    groupMap[key].members.push({ name: item.name, note: item.note, isPacer: false })
  }

  // 排序：A B C D 慢跑
  const orderRank = { A: 1, B: 2, C: 3, D: 4, slow: 5 }
  groupOrder.sort((a, b) => (orderRank[a] || 99) - (orderRank[b] || 99))

  for (const key of groupOrder) {
    const group = groupMap[key]
    const pacerCandidates = pacerCandidatesByGroup[key] || []
    if (!group || !pacerCandidates.length || !Array.isArray(group.members) || !group.members.length) continue

    const expandedCandidates = []
    const addCandidate = (name) => {
      const v = String(name || '').trim()
      if (v && !expandedCandidates.includes(v)) expandedCandidates.push(v)
    }

    for (const candidate of pacerCandidates) {
      addCandidate(candidate)
      addCandidate(aliasToCanonical[candidate])
    }

    let pacerIndex = -1
    for (const pacerName of expandedCandidates) {
      pacerIndex = group.members.findIndex(m => isSameOrSimilarName(m.name, pacerName))
      if (pacerIndex >= 0) break
    }

    if (pacerIndex < 0) {
      if (manualPacerInputByGroup[key]) {
        manualPacerMisses.push({
          groupKey: key,
          groupLabel: GROUP_KEY_MAP[key] || `${key}组`,
          inputName: manualPacerInputByGroup[key]
        })
      }
      continue
    }

    const pacerMember = group.members[pacerIndex]
    group.members.forEach(m => { m.isPacer = false })
    pacerMember.isPacer = true

    if (pacerIndex > 0) {
      group.members.splice(pacerIndex, 1)
      group.members.unshift(pacerMember)
    }
  }

  const groups = groupOrder.map(k => groupMap[k])

  return {
    title: headerMeta.headerTitle || title,
    groups,
    total: parsed.length,
    introText: headerMeta.introText,
    introLines: headerMeta.introLines,
    groupBriefs: headerMeta.groupBriefs,
    manualPacerMisses
  }
}

/**
 * 生成 PlantUML WBS 图
 */
function toWBS(parsed, options = {}) {
  const lines = ['@startwbs']
  lines.push('<style>')
  lines.push('wbsDiagram {')
  lines.push('  .root   { BackgroundColor #2c3e50; FontColor white;   FontSize 18; FontStyle bold; }')
  lines.push('  .group  { BackgroundColor #3498db; FontColor white;   FontSize 14; FontStyle bold; }')
  lines.push('  .slow   { BackgroundColor #7f8c8d; FontColor white;   FontSize 14; }')
  lines.push('  .other  { BackgroundColor #bdc3c7; FontColor #2c3e50; FontSize 14; }')
  lines.push('  .member { BackgroundColor #ecf0f1; FontColor #2c3e50; FontSize 12; }')
  lines.push('  .pacer  { BackgroundColor #f7dc6f; FontColor #2c3e50; FontSize 12; FontStyle bold; }')
  lines.push('}')
  lines.push('</style>')

  lines.push(`* ${escapeText(parsed.title)} (共${parsed.total}人) <<root>>`)

  // 成员分组
  for (const g of parsed.groups) {
    const style = g.key === 'slow' ? 'slow' : 'group'
    lines.push(`** ${escapeText(g.label)} (${g.members.length}人) <<${style}>>`)
    for (const m of g.members) {
      const displayName = m.isPacer ? `${m.name} [PACER]` : m.name
      const display = m.note ? `${escapeText(displayName)}\\n${escapeText(m.note)}` : escapeText(displayName)
      const memberStyle = m.isPacer ? 'pacer' : 'member'
      lines.push(`*** ${display} <<${memberStyle}>>`)
    }
  }

  const wrappedLegendLines = getWrappedLegendLines(parsed, LEGEND_MAX_CJK_WIDTH)
  if (options.includeLegend && wrappedLegendLines.length) {
    lines.push('legend left')
    wrappedLegendLines.forEach(line => lines.push(escapeText(line)))
    lines.push('endlegend')
  }

  lines.push('@endwbs')
  return lines.join('\n')
}

function buildLegendLines(parsed) {
  const out = []

  ;(parsed.introLines || []).forEach(line => {
    const text = String(line || '').trim()
    if (text) out.push(text)
  })

  const briefs = parsed.groupBriefs || []
  if (briefs.length) {
    if (out.length) out.push('')
    briefs.forEach(brief => {
      const parts = String(brief.desc || '').split('；').map(s => s.trim()).filter(Boolean)
      if (!parts.length) return
      out.push(`${brief.label}  ${parts[0]}`)
      for (let i = 1; i < parts.length; i++) {
        out.push(parts[i])
      }
    })
  }

  return out
}

function getWrappedLegendLines(parsed, maxWidth = LEGEND_MAX_CJK_WIDTH) {
  return wrapLegendLines(buildLegendLines(parsed), maxWidth)
}

function wrapLegendLines(lines, maxWidth) {
  const out = []
  ;(lines || []).forEach(line => {
    if (!line) {
      out.push('')
      return
    }
    out.push(...wrapLineByCjkWidth(String(line), maxWidth))
  })
  return out
}

function wrapLineByCjkWidth(line, maxWidth) {
  const out = []
  let current = ''
  let width = 0

  for (const ch of line) {
    const w = getCjkAwareWidth(ch)
    if (current && width + w > maxWidth) {
      out.push(current)
      current = ch
      width = w
    } else {
      current += ch
      width += w
    }
  }

  if (current) out.push(current)
  return out.length ? out : ['']
}

function getCjkAwareWidth(ch) {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.5
}

function escapeText(s) {
  return String(s || '').replace(/\*/g, '＊').replace(/\|/g, '｜')
}

module.exports = {
  parseJielong,
  toWBS,
  getWrappedLegendLines
}
