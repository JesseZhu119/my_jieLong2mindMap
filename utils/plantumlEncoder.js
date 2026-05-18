/**
 * PlantUML 编码器
 *
 * 使用 HEX 编码方式，URL 形如：
 *   https://www.plantuml.com/plantuml/svg/~h{HEX}
 *
 * 相比标准 deflate+base64 编码，HEX 方式无需引入压缩库，
 * 适合微信小程序环境使用。代价是 URL 长度更长，
 * 对超大图（几千行）可能受 URL 长度限制，但接龙场景完全够用。
 */

function toUtf8Bytes(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6))
      bytes.push(0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // 代理对
      const hi = code
      const lo = str.charCodeAt(++i)
      code = 0x10000 + (((hi & 0x3ff) << 10) | (lo & 0x3ff))
      bytes.push(0xf0 | (code >> 18))
      bytes.push(0x80 | ((code >> 12) & 0x3f))
      bytes.push(0x80 | ((code >> 6) & 0x3f))
      bytes.push(0x80 | (code & 0x3f))
    } else {
      bytes.push(0xe0 | (code >> 12))
      bytes.push(0x80 | ((code >> 6) & 0x3f))
      bytes.push(0x80 | (code & 0x3f))
    }
  }
  return bytes
}

function bytesToHex(bytes) {
  let hex = ''
  for (const b of bytes) {
    hex += (b < 16 ? '0' : '') + b.toString(16)
  }
  return hex
}

function encodeHex(text) {
  return bytesToHex(toUtf8Bytes(text))
}

function buildUrl(server, format, plantumlText) {
  const hex = encodeHex(plantumlText)
  return `${server}/${format}/~h${hex}`
}

module.exports = {
  encodeHex,
  buildUrl
}
