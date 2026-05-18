/**
 * 接龙文本解析器
 * 输入：接龙原始文本（每行通常是「序号. 昵称 [备注/分组]」）
 * 输出：{ title, groups: [{ name, members: [{ name, note }] }], total }
 */

// 默认分组关键词识别规则（按优先级匹配）
const DEFAULT_GROUP_RULES = [
  { key: 'A',    pattern: /(^|[^a-zA-Z])A组?([^a-zA-Z]|$)/i, label: 'A组' },
  { key: 'B',    pattern: /(^|[^a-zA-Z])B组?([^a-zA-Z]|$)/i, label: 'B组' },
  { key: 'C',    pattern: /(^|[^a-zA-Z])C组?([^a-zA-Z]|$)/i, label: 'C组' },
  { key: 'D',    pattern: /(^|[^a-zA-Z])D组?([^a-zA-Z]|$)/i, label: 'D组' },
  { key: 'E',    pattern: /(^|[^a-zA-Z])E组?([^a-zA-Z]|$)/i, label: 'E组' },
  { key: 'F',    pattern: /(^|[^a-zA-Z])F组?([^a-zA-Z]|$)/i, label: 'F组' },
  { key: 'slow', pattern: /慢跑|放松|轻松/,                  label: '慢跑组' }
]

const OTHER_LABEL = '其他'

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
 * 解析单行接龙
 */
function parseLine(rawLine) {
  const line = rawLine.trim()
  if (!line) return null

  // 去掉序号前缀：1. / 1、/ 1) / 1．
  const m = line.match(/^\s*(\d+)\s*[\.、\)．]\s*(.+)$/)
  if (!m) return null

  const content = m[2].trim()

  // 识别分组
  let groupKey = OTHER_LABEL
  let groupLabel = OTHER_LABEL
  for (const rule of DEFAULT_GROUP_RULES) {
    if (rule.pattern.test(content)) {
      groupKey = rule.key
      groupLabel = rule.label
      break
    }
  }

  // 尝试切分昵称与备注：以第一个空格/全角空格/破折号为界
  let name = content
  let note = ''
  const splitMatch = content.match(/^([^\s\u3000\-—]+)[\s\u3000\-—]+(.+)$/)
  if (splitMatch) {
    name = splitMatch[1]
    note = splitMatch[2]
  }

  // 备注里若仅是分组标记（A/B/C/D/E/F/慢跑/放松/轻松），视为空备注
  const noteStripped = note
    .replace(/^[A-Fa-f]\s*组?$/, '')
    .replace(/^慢跑$|^放松$|^轻松$/, '')
    .replace(/^[A-Fa-f]\s*[\-—→to]+\s*[A-Fa-f]\s*组?$/i, '')
    .trim()
  // 若有更多内容，去掉开头的分组词
  note = note
    .replace(/^[A-Fa-f]\s*组?\s*/i, '')
    .replace(/^慢跑\s*|^放松\s*|^轻松\s*/, '')
    .trim()
  if (!noteStripped) note = ''

  return {
    index: parseInt(m[1], 10),
    name: cleanName(name) || name,
    note: cleanName(note),
    groupKey,
    groupLabel
  }
}

/**
 * 主解析函数
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
    detectedTitle = t
    break
  }

  const parsed = lines.map(parseLine).filter(Boolean)

  // 按分组聚合，保持出现顺序
  const groupOrder = []
  const groupMap = {}
  for (const item of parsed) {
    if (!groupMap[item.groupKey]) {
      groupMap[item.groupKey] = { key: item.groupKey, label: item.groupLabel, members: [] }
      groupOrder.push(item.groupKey)
    }
    groupMap[item.groupKey].members.push({ name: item.name, note: item.note })
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
 * 生成 PlantUML mindmap
 */
function toMindmap(parsed) {
  const lines = ['@startmindmap']
  lines.push('<style>')
  lines.push('mindmapDiagram {')
  lines.push('  .root { BackgroundColor #2c3e50; FontColor white; FontSize 18; }')
  lines.push('  .group { BackgroundColor #3498db; FontColor white; FontSize 14; }')
  lines.push('  .slow  { BackgroundColor #95a5a6; FontColor white; FontSize 14; }')
  lines.push('  .other { BackgroundColor #bdc3c7; FontColor white; FontSize 14; }')
  lines.push('  .member { BackgroundColor #ecf0f1; FontColor #2c3e50; FontSize 12; }')
  lines.push('}')
  lines.push('</style>')

  lines.push(`* ${escapeText(parsed.title)}\\n共${parsed.total}人 <<root>>`)

  for (const g of parsed.groups) {
    const style = g.key === 'slow' ? 'slow' : (g.key === '其他' ? 'other' : 'group')
    lines.push(`** ${escapeText(g.label)} (${g.members.length}人) <<${style}>>`)
    for (const m of g.members) {
      const display = m.note ? `${m.name}\\n${escapeText(m.note)}` : m.name
      lines.push(`*** ${escapeText(display)} <<member>>`)
    }
  }

  lines.push('@endmindmap')
  return lines.join('\n')
}

function escapeText(s) {
  return String(s || '').replace(/\*/g, '＊').replace(/\|/g, '｜')
}

module.exports = {
  parseJielong,
  toMindmap
}
