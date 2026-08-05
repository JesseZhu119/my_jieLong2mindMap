/**
 * 人名别称配置（主名 -> 别称列表）
 * 仅用于“跟上xx”场景下的补充匹配。
 */
const CANONICAL_NAME_ALIASES = {
  '毛毛': ['毛姐', '毛💫子', '💐毛💫子🍓', '毛子'],
  '笑波': ['波波'],
  '大朱朱': ['朱朱', '径山掌门'],
  '祝剑': ['祝神'],
  'lisa': ['丽莎', 'Lisa', 'LISA'],
  '阿权': ['权哥'],
  '小冯先生': ['冯斌'],
  '军团': ['菜还得练'],
  '张平': ['菜强强'],
  '韩业红': ['韩医生'],
  '袁诚': ['袁誠'],
  '刘富成': ['T哥'],
  '飘飘': ['今年必破130']
}

function normalizeNameKey(name) {
  return String(name || '').trim()
}

/**
 * 基于本次接龙已出现的昵称，构建 alias -> canonical 的反查表。
 * 只有主名真实出现在接龙里时，才会启用对应别称，避免误匹配。
 */
function buildAliasToCanonicalMap(knownNames = []) {
  const knownSet = new Set(knownNames.map(normalizeNameKey).filter(Boolean))
  const aliasToCanonical = {}

  for (const canonical of Object.keys(CANONICAL_NAME_ALIASES)) {
    const canonicalKey = normalizeNameKey(canonical)
    if (!knownSet.has(canonicalKey)) continue

    const aliases = CANONICAL_NAME_ALIASES[canonical] || []
    for (const alias of aliases) {
      const aliasKey = normalizeNameKey(alias)
      if (!aliasKey) continue
      aliasToCanonical[aliasKey] = canonicalKey
    }
  }

  return aliasToCanonical
}

module.exports = {
  CANONICAL_NAME_ALIASES,
  buildAliasToCanonicalMap
}
