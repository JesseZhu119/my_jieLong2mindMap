const { CANONICAL_NAME_ALIASES } = require('./nameAliases.js')

const EXTRA_ALIAS_TO_ROSTER = {
  '小冯先生': '冯教',
  '冯斌': '冯教',
  '雪梅snowy': '雪梅',
  'summernmz': '雪涛',
  '丽莎': '曾丽莎',
  'lisa': '曾丽莎'
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[\s\-—_·.。\(\)（）\[\]【】]/g, '')
    .trim()
}

function normalizeDate(dateText) {
  if (!dateText) return ''
  const text = String(dateText).trim()
  const m = text.match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/) || text.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return text
  const y = m[1]
  const mm = String(parseInt(m[2], 10)).padStart(2, '0')
  const dd = String(parseInt(m[3], 10)).padStart(2, '0')
  return `${y}-${mm}-${dd}`
}

function collectSignupNames(parsed) {
  if (!parsed || !Array.isArray(parsed.groups)) return []
  const out = []
  parsed.groups.forEach(group => {
    ;(group.members || []).forEach(m => {
      if (m && m.name) out.push(String(m.name).trim())
    })
  })
  return out
}

function buildAliasToRosterMap(roster) {
  const aliasMap = {}
  const rosterSet = new Set((roster || []).map(x => String(x || '').trim()).filter(Boolean))

  Object.keys(EXTRA_ALIAS_TO_ROSTER).forEach(alias => {
    const rosterName = EXTRA_ALIAS_TO_ROSTER[alias]
    if (rosterSet.has(rosterName)) {
      aliasMap[normalizeName(alias)] = rosterName
    }
  })

  Object.keys(CANONICAL_NAME_ALIASES || {}).forEach(canonical => {
    const aliases = CANONICAL_NAME_ALIASES[canonical] || []
    const targetRosterName = findBestRosterTarget(roster, canonical, aliases)
    if (!targetRosterName) return

    aliasMap[normalizeName(canonical)] = targetRosterName
    aliases.forEach(alias => {
      aliasMap[normalizeName(alias)] = targetRosterName
    })
  })

  return aliasMap
}

function findBestRosterTarget(roster, canonical, aliases) {
  const direct = (roster || []).find(name => normalizeName(name) === normalizeName(canonical))
  if (direct) return direct

  const allNames = [canonical].concat(aliases || [])
  for (const src of allNames) {
    const key = normalizeName(src)
    if (!key) continue
    const contain = (roster || []).find(name => {
      const rk = normalizeName(name)
      return rk.includes(key) || key.includes(rk)
    })
    if (contain) return contain
  }

  return ''
}

function chooseBestFuzzyRoster(signupName, roster) {
  const key = normalizeName(signupName)
  if (!key || key.length < 2) return ''

  let best = ''
  let bestScore = 0

  ;(roster || []).forEach(rosterName => {
    const rk = normalizeName(rosterName)
    if (!rk) return

    if (rk.includes(key) || key.includes(rk)) {
      const score = Math.min(rk.length, key.length)
      if (score > bestScore) {
        best = rosterName
        bestScore = score
      }
      return
    }

    let overlap = 0
    for (const ch of key) {
      if (/^[a-z0-9]$/.test(ch)) continue
      if (rk.includes(ch)) overlap++
    }

    if (overlap >= 2 && overlap > bestScore) {
      best = rosterName
      bestScore = overlap
    }
  })

  return best
}

function buildAttendanceRows(roster, parsed, dateText) {
  const members = Array.isArray(roster) ? roster.slice() : []
  const signupNames = collectSignupNames(parsed)
  const aliasToRoster = buildAliasToRosterMap(members)

  const rosterKeyMap = {}
  members.forEach(name => {
    rosterKeyMap[normalizeName(name)] = name
  })

  const matchedMap = {}
  const unmatched = []

  signupNames.forEach(signup => {
    const signupKey = normalizeName(signup)
    if (!signupKey) return

    let rosterName = rosterKeyMap[signupKey] || aliasToRoster[signupKey] || ''
    if (!rosterName) {
      rosterName = chooseBestFuzzyRoster(signup, members)
    }

    if (rosterName) {
      if (!matchedMap[rosterName]) matchedMap[rosterName] = []
      matchedMap[rosterName].push(signup)
      return
    }

    unmatched.push(signup)
  })

  const date = normalizeDate(dateText)
  const uniqueUnmatched = Array.from(new Set(unmatched))
  const rows = members.map(name => {
    const signupList = matchedMap[name] || []
    return {
      memberName: name,
      activityDate: date,
      attended: signupList.length > 0,
      signupNames: signupList.join(' | ')
    }
  })

  return {
    date,
    rows,
    signupTotal: signupNames.length,
    attendedCount: rows.filter(r => r.attended).length,
    absentCount: rows.filter(r => !r.attended).length,
    unmatchedSignupNames: uniqueUnmatched,
    unmatchedText: uniqueUnmatched.join('、')
  }
}

function csvEscape(value) {
  const text = String(value == null ? '' : value)
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function buildActivityCsv(result) {
  const header = ['成员昵称', '活动日期', '是否出席', '匹配到的报名昵称']
  const lines = [header.map(csvEscape).join(',')]

  ;(result.rows || []).forEach(row => {
    lines.push([
      row.memberName,
      row.activityDate,
      row.attended ? '是' : '否',
      row.signupNames || ''
    ].map(csvEscape).join(','))
  })

  return lines.join('\n')
}

function buildMergedCsv(roster, historyRecords) {
  const members = Array.isArray(roster) ? roster.slice() : []
  const records = Array.isArray(historyRecords) ? historyRecords.slice() : []
  records.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))

  const dateColumns = records.map(r => r.date)
  const header = ['成员昵称'].concat(dateColumns)
  const lines = [header.map(csvEscape).join(',')]

  members.forEach(member => {
    const row = [member]
    records.forEach(record => {
      const attendedMap = record.attendedMap || {}
      row.push(attendedMap[member] ? '是' : '否')
    })
    lines.push(row.map(csvEscape).join(','))
  })

  return lines.join('\n')
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildExcelHtml(title, headers, rowValues) {
  const headCells = (headers || []).map(h => `<th>${escapeHtml(h)}</th>`).join('')
  const bodyRows = (rowValues || [])
    .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')

  return [
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title || 'attendance')}</title>`,
    '<style>',
    'table { border-collapse: collapse; width: 100%; }',
    'th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }',
    'th { background: #f5f5f5; }',
    '</style>',
    '</head>',
    '<body>',
    `<h3>${escapeHtml(title || 'attendance')}</h3>`,
    `<table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`,
    '</body>',
    '</html>'
  ].join('')
}

function buildActivityExcelHtml(result) {
  const headers = ['成员昵称', '活动日期', '是否出席', '匹配到的报名昵称']
  const rows = (result.rows || []).map(row => [
    row.memberName,
    row.activityDate,
    row.attended ? '是' : '否',
    row.signupNames || ''
  ])
  const title = `单次出勤表 ${result.date || ''}`.trim()
  return buildExcelHtml(title, headers, rows)
}

function buildMergedExcelHtml(roster, historyRecords) {
  const members = Array.isArray(roster) ? roster.slice() : []
  const records = Array.isArray(historyRecords) ? historyRecords.slice() : []
  records.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))

  const dateColumns = records.map(r => r.date)
  const headers = ['成员昵称'].concat(dateColumns)
  const rows = members.map(member => {
    const row = [member]
    records.forEach(record => {
      const attendedMap = record.attendedMap || {}
      row.push(attendedMap[member] ? '是' : '否')
    })
    return row
  })

  const title = `累计出勤总表 (${records.length} 次活动)`
  return buildExcelHtml(title, headers, rows)
}

module.exports = {
  normalizeDate,
  buildAttendanceRows,
  buildActivityCsv,
  buildMergedCsv,
  buildActivityExcelHtml,
  buildMergedExcelHtml
}
