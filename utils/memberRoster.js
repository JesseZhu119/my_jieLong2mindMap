const DEFAULT_MEMBER_ROSTER = [
  '毛毛',
  '宝昆',
  '珍珍',
  '文营',
  '冯教',
  '李龙',
  '胡JF',
  '朱苏园',
  '天苍苍',
  '雪梅',
  '兆方',
  '海斌',
  '东海岛主',
  '功夫熊猫',
  '挥挥',
  '光照',
  '七秒',
  '月神',
  '军团',
  '忻斌',
  '熙城',
  '李文元',
  '以乐',
  '阿三',
  '方卿钰',
  '阿进',
  '阿权',
  '陆飘飘',
  '郑婉珍',
  'Melia',
  '丁磊',
  '张利明',
  '龙先生',
  '汪老板',
  '芳芳',
  '雪涛',
  '小月',
  '祝剑',
  '何东锋',
  '笑波',
  '沈磊',
  '曾丽莎',
  '颜怀亮',
  '张海波',
  '武哥',
  '仲达',
  '韩业红',
  '魏柳红',
  '翟金洋',
  '张平',
  '佳爷',
  '笑笑',
  '陈建新',
  '赵丹',
  '尤浩',
  '袁诚',
  '罗肖',
  '殷胤',
  '刘富成',
  '阿天',
  '佳歌'
]

const TXT_ROSTER_FILE = 'DingPaoYing_0805_list_61members.txt'

function parseRosterText(text) {
  const rows = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const out = []
  const seen = {}
  rows.forEach(name => {
    if (seen[name]) return
    seen[name] = true
    out.push(name)
  })
  return out
}

function readFileUtf8(filePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath,
      encoding: 'utf8',
      success: res => resolve(String(res.data || '')),
      fail: err => reject(err)
    })
  })
}

async function loadMemberRosterPreferTxt() {
  const candidates = [
    `/utils/${TXT_ROSTER_FILE}`,
    `utils/${TXT_ROSTER_FILE}`,
    `./utils/${TXT_ROSTER_FILE}`,
    `/${TXT_ROSTER_FILE}`,
    TXT_ROSTER_FILE
  ]

  let lastErr = null
  for (const path of candidates) {
    try {
      const text = await readFileUtf8(path)
      const roster = parseRosterText(text)
      if (roster.length) {
        return {
          roster,
          source: 'txt',
          usedPath: path,
          error: ''
        }
      }
    } catch (err) {
      lastErr = err
    }
  }

  return {
    roster: DEFAULT_MEMBER_ROSTER.slice(),
    source: 'builtin',
    usedPath: '',
    error: lastErr && lastErr.errMsg ? lastErr.errMsg : ''
  }
}

module.exports = {
  DEFAULT_MEMBER_ROSTER,
  TXT_ROSTER_FILE,
  loadMemberRosterPreferTxt
}
