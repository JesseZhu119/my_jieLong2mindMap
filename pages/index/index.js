const { parseJielong, toWBS, getWrappedLegendLines } = require('../../utils/parser.js')
const { buildUrl } = require('../../utils/plantumlEncoder.js')
const { DEFAULT_MEMBER_ROSTER, loadMemberRosterPreferTxt } = require('../../utils/memberRoster.js')
const {
  normalizeDate,
  buildAttendanceRows,
  buildActivityCsv,
  buildMergedCsv,
  buildActivityExcelHtml,
  buildMergedExcelHtml
} = require('../../utils/attendance.js')
const LOGO_PATH = '/dingpaoying.jpg'
const DEBUG_VERSION = 'logo-debug-v2'
const LEGEND_MAX_CJK_WIDTH = 20
const ARTIFACT_TMP_DIR = `${wx.env.USER_DATA_PATH}/tmp`
const EXPORT_TMP_DIR = `${wx.env.USER_DATA_PATH}/exports`
const ATTENDANCE_HISTORY_KEY = 'attendance_history_v1'

const DEMO_TEXT = `丁跑营接龙
5k+1.2k×？（5公里休息5分钟，1.2组休120秒）

A组（配速员冯斌）  5公里配速400-410
1.2公里配速340-345（8组）
B组（配速员祝剑）  5公里配速415-420
1.2公里配速350-355（7组）
C组（配速员丽莎） 5公里配速430-435
1.2公里配速410-415（6组）
D组（配速员权哥） 5公里配速440-445
1.2公里配速420-430（5组）
禁止超过配速员（除了最后1组），也别跟配速员并排跑，通通只能看着屁股跑
其余想慢跑的配速随意

1. 胡JF B组
2. 小冯先生 A组（配速员）
3. 李龙 A
4. 我是～郑婉珍💗  C组
5. 七秒钟的记忆 C
6. 张海波 C
7. 祝剑 B组（配速员）
8. 雪梅Snowy B
9. 袁誠 C
10. T哥 C
11. 大朱朱 A
12. 佳歌 D
13. 今年必破130 D
14. lisa C组
15. 💐毛💫子🍓 D组
16. 菜还得练 B
17. 岛主 C
18. 遇事不要方先生  D
19. 殷胤 C
20. 菜强强 争取跟住祝神
21. 挥挥  D
22. 忻斌 A组，睡眠好A组。
23. Summernmz（雪涛)B组
24. 韩医生B组
25. 功夫熊猫 B
26. 阿权 D组
27. 陈建新🚗  C C C
28. 翟金洋 D组

`

Page({
  data: {
    inputText: '',
    lineCount: 0,
    pacerInputs: {
      A: '',
      B: '',
      C: '',
      D: ''
    },
    parsed: null,
    pumlText: '',
    imageUrl: '',
    composedImageUrl: '',
    artifactPaths: null,
    rawImageUrl: '',
    debugVersion: DEBUG_VERSION,
    debugEnabled: true,
    debugLines: [],
    loading: false,
    server: 'https://www.plantuml.com/plantuml',
    activityDate: '',
    attendanceResult: null,
    historyCount: 0,
    memberCount: DEFAULT_MEMBER_ROSTER.length,
    rosterSource: 'builtin'
  },

  onLoad() {
    this.memberRoster = DEFAULT_MEMBER_ROSTER.slice()
    const server = (getApp().globalData && getApp().globalData.plantumlServer) || this.data.server
    this.setData({
      server,
      activityDate: this.getTodayDateText(),
      historyCount: this.getHistoryRecords().length
    })
    this.initRosterSource()
  },

  async initRosterSource() {
    try {
      const info = await loadMemberRosterPreferTxt()
      this.memberRoster = (info.roster || []).slice()
      this.setData({
        memberCount: this.memberRoster.length,
        rosterSource: info.source || 'builtin'
      })
      if (info.source === 'txt') {
        wx.showToast({ title: `已加载TXT名单(${this.memberRoster.length})`, icon: 'none' })
      }
      this.debugLog('roster-loaded', {
        source: info.source,
        count: this.memberRoster.length,
        usedPath: info.usedPath,
        error: info.error
      })
    } catch (err) {
      this.memberRoster = DEFAULT_MEMBER_ROSTER.slice()
      this.setData({
        memberCount: this.memberRoster.length,
        rosterSource: 'builtin'
      })
      this.debugLog('roster-load-failed', {
        message: err && err.message ? err.message : String(err)
      })
    }
  },

  getMemberRoster() {
    if (Array.isArray(this.memberRoster) && this.memberRoster.length) {
      return this.memberRoster
    }
    return DEFAULT_MEMBER_ROSTER
  },

  getTodayDateText() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  },

  onInput(e) {
    const text = e.detail.value
    const lineCount = text ? text.split(/\r?\n/).filter(l => l.trim()).length : 0
    this.setData({ inputText: text, lineCount })
  },

  onPaste() {
    wx.getClipboardData({
      success: res => {
        const text = res.data || ''
        const lineCount = text ? text.split(/\r?\n/).filter(l => l.trim()).length : 0
        this.setData({ inputText: text, lineCount })
        wx.showToast({ title: '已粘贴', icon: 'success' })
      },
      fail: () => wx.showToast({ title: '粘贴失败', icon: 'none' })
    })
  },

  onLoadDemo() {
    const text = DEMO_TEXT
    const lineCount = text.split(/\r?\n/).filter(l => l.trim()).length
    this.setData({ inputText: text, lineCount })
  },

  onClear() {
    this.setData({
      inputText: '',
      lineCount: 0,
      pacerInputs: {
        A: '',
        B: '',
        C: '',
        D: ''
      },
      parsed: null,
      pumlText: '',
      imageUrl: '',
      composedImageUrl: '',
      artifactPaths: null,
      rawImageUrl: '',
      debugLines: [],
      attendanceResult: null
    })
  },

  onDateChange(e) {
    this.setData({ activityDate: e.detail.value || this.getTodayDateText() })
  },

  onPacerInput(e) {
    const key = e.currentTarget.dataset.key
    const value = (e.detail.value || '').trim()
    if (!['A', 'B', 'C', 'D'].includes(key)) return
    this.setData({ [`pacerInputs.${key}`]: value })
  },

  async onGenerate() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴接龙内容', icon: 'none' })
      return
    }

    this.setData({ loading: true, debugLines: [] })
    this.debugLog('version', { debugVersion: DEBUG_VERSION })

    try {
      const parsed = parseJielong(text, {
        manualPacers: this.data.pacerInputs
      })
      if (!parsed.total) {
        wx.showToast({ title: '未识别到有效成员', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      const legendLines = getWrappedLegendLines(parsed, LEGEND_MAX_CJK_WIDTH)
      const pumlText = toWBS(parsed, { includeLegend: false })
      const candidateServers = this.getCandidateServers(this.data.server)
      const rawImageUrl = buildUrl(candidateServers[0], 'svg', pumlText)
      this.debugLog('start-generate', { candidateServers })

      let imageUrl = rawImageUrl
      let composedImageUrl = ''
      let artifactPaths = null
      try {
        let lastErr = null
        for (const server of candidateServers) {
          const pngUrl = buildUrl(server, 'png', pumlText)
          this.debugLog('compose-try-server', { server, pngUrl })
          try {
            const artifacts = await this.composeWithBottomLeftLogo(pngUrl, LOGO_PATH, { legendLines })
            imageUrl = artifacts.finalPath
            composedImageUrl = imageUrl
            artifactPaths = artifacts
            this.debugLog('compose-success', {
              server,
              artifacts,
              lastCompose: this._lastComposeDebug || null
            })
            break
          } catch (err) {
            lastErr = err
            this.debugLog('compose-server-failed', {
              server,
              message: err && err.message ? err.message : String(err)
            })
          }
        }

        if (!composedImageUrl && lastErr) {
          throw lastErr
        }
        // if (this._lastComposeDebug) {
        //   const d = this._lastComposeDebug
        //   wx.showToast({
        //     title: `LB(${d.logoX},${d.logoY}) ${d.logoWidth}x${d.logoHeight}`,
        //     icon: 'none',
        //     duration: 2200
        //   })
        // }
      } catch (composeErr) {
        console.warn('compose logo failed, fallback to raw image', composeErr)
        this.debugLog('compose-failed', { message: composeErr && composeErr.message ? composeErr.message : String(composeErr) })
        if (this.isDomainListError(composeErr)) {
          wx.showModal({
            title: 'logo合成失败',
            content: '原因：PlantUML 域名未配置到 downloadFile 合法域名。请在小程序后台添加 https://www.plantuml.com 和 https://plantuml.com 后重试。',
            showCancel: false
          })
        } else {
          wx.showToast({ title: '合成logo失败：' + (composeErr && composeErr.message || composeErr), icon: 'none', duration: 3000 })
        }
      }

      this.setData({
        parsed,
        pumlText,
        rawImageUrl,
        imageUrl,
        composedImageUrl,
        artifactPaths,
        loading: false,
        attendanceResult: this.buildAttendanceResult(parsed)
      })

      this.showManualPacerMissTip(parsed)
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '生成失败：' + err.message, icon: 'none' })
      this.setData({ loading: false })
    }
  },

  buildAttendanceResult(parsed) {
    return buildAttendanceRows(this.getMemberRoster(), parsed, this.data.activityDate)
  },

  onGenerateAttendance() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴接龙内容', icon: 'none' })
      return
    }

    const parsed = parseJielong(text, {
      manualPacers: this.data.pacerInputs
    })
    if (!parsed.total) {
      wx.showToast({ title: '未识别到有效成员', icon: 'none' })
      return
    }

    const attendanceResult = this.buildAttendanceResult(parsed)
    this.setData({ parsed, attendanceResult })

    wx.showToast({
      title: `统计完成 ${attendanceResult.attendedCount}/${attendanceResult.rows.length}`,
      icon: 'none'
    })
  },

  getHistoryRecords() {
    try {
      const records = wx.getStorageSync(ATTENDANCE_HISTORY_KEY)
      return Array.isArray(records) ? records : []
    } catch (e) {
      return []
    }
  },

  saveHistoryRecord(result) {
    if (!result || !result.date || !Array.isArray(result.rows)) return

    const attendedMap = {}
    result.rows.forEach(row => {
      attendedMap[row.memberName] = !!row.attended
    })

    const records = this.getHistoryRecords().filter(r => r && r.date !== result.date)
    records.push({ date: result.date, attendedMap })
    records.sort((a, b) => String(a.date).localeCompare(String(b.date)))
    wx.setStorageSync(ATTENDANCE_HISTORY_KEY, records)
    this.setData({ historyCount: records.length })
  },

  async onExportActivityCsv() {
    let result = this.data.attendanceResult
    if (!result) {
      const text = this.data.inputText.trim()
      if (!text) {
        wx.showToast({ title: '请先粘贴接龙内容', icon: 'none' })
        return
      }
      const parsed = parseJielong(text, { manualPacers: this.data.pacerInputs })
      if (!parsed.total) {
        wx.showToast({ title: '未识别到有效成员', icon: 'none' })
        return
      }
      result = buildAttendanceRows(this.getMemberRoster(), parsed, this.data.activityDate)
      this.setData({ parsed, attendanceResult: result })
    }

    if (!result || !result.rows || !result.rows.length) {
      wx.showToast({ title: '没有可导出的数据', icon: 'none' })
      return
    }

    const dateText = normalizeDate(result.date || this.data.activityDate)
    const isIOS = this.isIOSPlatform()
    const fileName = isIOS
      ? `attendance_${dateText || this.getTodayDateText()}.xls`
      : `attendance_${dateText || this.getTodayDateText()}.csv`
    const content = isIOS ? buildActivityExcelHtml(result) : buildActivityCsv(result)
    try {
      const filePath = await this.writeTableAndOpen(fileName, content)
      this.saveHistoryRecord(result)
      wx.showToast({ title: isIOS ? '已导出Excel兼容文件' : '已导出并打开文件', icon: 'success' })
      this.debugLog('attendance-export', {
        filePath,
        rows: result.rows.length,
        exportType: isIOS ? 'xls-html' : 'csv'
      })
    } catch (err) {
      wx.showToast({ title: '导出失败：' + (err.message || err), icon: 'none', duration: 2500 })
    }
  },

  async onExportMergedCsv() {
    const historyRecords = this.getHistoryRecords()
    if (!historyRecords.length) {
      wx.showToast({ title: '暂无历史记录，请先导出一次签到表', icon: 'none' })
      return
    }

    const roster = this.getMemberRoster()
    const isIOS = this.isIOSPlatform()
    const content = isIOS
      ? buildMergedExcelHtml(roster, historyRecords)
      : buildMergedCsv(roster, historyRecords)
    const fileName = isIOS
      ? `attendance_merged_${this.getTodayDateText()}.xls`
      : `attendance_merged_${this.getTodayDateText()}.csv`
    try {
      const filePath = await this.writeTableAndOpen(fileName, content)
      wx.showToast({ title: isIOS ? '总表已导出为Excel兼容文件' : '总表已导出并打开', icon: 'success' })
      this.debugLog('attendance-export-merged', {
        filePath,
        records: historyRecords.length,
        members: roster.length,
        exportType: isIOS ? 'xls-html' : 'csv'
      })
    } catch (err) {
      wx.showToast({ title: '导出失败：' + (err.message || err), icon: 'none', duration: 2500 })
    }
  },

  isIOSPlatform() {
    try {
      const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
      return String(info.platform || '').toLowerCase() === 'ios'
    } catch (e) {
      return false
    }
  },

  ensureExportDir() {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager()
      fs.mkdir({
        dirPath: EXPORT_TMP_DIR,
        recursive: true,
        success: () => resolve(EXPORT_TMP_DIR),
        fail: err => {
          if (err && err.errMsg && err.errMsg.includes('file already exists')) {
            resolve(EXPORT_TMP_DIR)
            return
          }
          reject(new Error('创建导出目录失败: ' + (err && err.errMsg)))
        }
      })
    })
  },

  sanitizeFileName(fileName) {
    return String(fileName || 'attendance.csv').replace(/[\\/:*?"<>|]/g, '_')
  },

  writeTableAndOpen(fileName, textContent) {
    return this.ensureExportDir().then(() => new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager()
      const safeName = this.sanitizeFileName(fileName)
      const target = `${EXPORT_TMP_DIR}/${safeName}`
      const content = `\ufeff${textContent}`

      fs.writeFile({
        filePath: target,
        data: content,
        encoding: 'utf8',
        success: async () => {
          try {
            await this.openDocumentWithFallback(target)
          } catch (err) {
            const msg = err && err.message ? err.message : String(err)
            wx.showModal({
              title: '文件已导出',
              content: msg,
              showCancel: false
            })
          }
          resolve(target)
        },
        fail: err => reject(new Error('writeFile失败: ' + (err && err.errMsg)))
      })
    }))
  },

  openSingleDocument(filePath, fileType) {
    return new Promise((resolve, reject) => {
      const options = {
        filePath,
        showMenu: true,
        success: () => resolve(filePath),
        fail: err => reject(err)
      }
      if (fileType) options.fileType = fileType
      wx.openDocument(options)
    })
  },

  async openDocumentWithFallback(filePath) {
    const isXls = /\.xls$/i.test(filePath)
    const attempts = isXls
      ? [
          { fileType: 'xls', label: 'xls' },
          { fileType: '', label: 'auto' }
        ]
      : [
          { fileType: 'csv', label: 'csv' },
          { fileType: '', label: 'auto' },
          { fileType: 'xls', label: 'xls' }
        ]

    let lastErr = null
    for (const item of attempts) {
      try {
        await this.openSingleDocument(filePath, item.fileType)
        this.debugLog('open-doc-success', { filePath, mode: item.label })
        return filePath
      } catch (err) {
        lastErr = err
        this.debugLog('open-doc-failed', {
          filePath,
          mode: item.label,
          message: err && err.errMsg ? err.errMsg : String(err)
        })
      }
    }

    const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {}
    const platform = info.platform || 'unknown'
    const errMsg = lastErr && lastErr.errMsg ? lastErr.errMsg : String(lastErr || 'unknown')

    if (platform === 'devtools') {
      throw new Error('文件已导出，但开发者工具可能不支持预览该文件；请在手机微信中打开。详细: ' + errMsg)
    }

    throw new Error('文件已导出，但当前设备无法直接打开，请在微信“最近文件”或WPS/Excel中打开。详细: ' + errMsg)
  },

  showManualPacerMissTip(parsed) {
    const misses = (parsed && parsed.manualPacerMisses) || []
    if (!misses.length) return

    const lines = misses.map(m => `${m.groupLabel}: ${m.inputName}`)
    wx.showModal({
      title: '手动配速员未命中',
      content: `以下手动填写的配速员未在对应组成员中匹配到：\n${lines.join('\n')}`,
      showCancel: false
    })
  },

  getCandidateServers(currentServer) {
    const list = []
    const add = (s) => {
      if (s && !list.includes(s)) list.push(s)
    }
    add(currentServer)
    add('https://www.plantuml.com/plantuml')
    add('https://plantuml.com/plantuml')
    return list
  },

  isDomainListError(err) {
    const msg = (err && err.message ? err.message : String(err || '')).toLowerCase()
    return msg.includes('url not in domain list') || msg.includes('download image fail')
  },

  onImageError(e) {
    console.error('image load error', e.detail)
    // SVG 加载失败时回退到 PNG
    if (this.data.imageUrl && this.data.imageUrl.includes('/svg/')) {
      const fallback = this.data.imageUrl.replace('/svg/', '/png/')
      this.setData({ imageUrl: fallback })
      wx.showToast({ title: '已切换为PNG模式', icon: 'none' })
    } else {
      wx.showToast({ title: '图片加载失败，请检查网络', icon: 'none' })
    }
  },

  async onPreviewImage() {
    const source = this.data.composedImageUrl || (this.data.imageUrl.includes('/svg/')
      ? this.data.imageUrl.replace('/svg/', '/png/')
      : this.data.imageUrl)
    if (!source) return

    try {
      const previewUrl = await this.resolvePreviewablePath(source)
      this.debugLog('preview-source', {
        source,
        previewUrl,
        composed: !!this.data.composedImageUrl
      })
      wx.previewImage({
        urls: [previewUrl],
        current: previewUrl
      })
    } catch (err) {
      this.debugLog('preview-resolve-failed', { source, message: err && err.message ? err.message : String(err) })
      wx.previewImage({
        urls: [source],
        current: source
      })
    }
  },

  onCopyUrl() {
    const copyValue = this.data.rawImageUrl || this.data.imageUrl
    if (!copyValue) return
    wx.setClipboardData({
      data: copyValue,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    })
  },

  onCopyPuml() {
    if (!this.data.pumlText) return
    wx.setClipboardData({
      data: this.data.pumlText,
      success: () => wx.showToast({ title: '源码已复制', icon: 'success' })
    })
  },

  async onSaveImage() {
    const saveSource = this.data.composedImageUrl || this.data.imageUrl
    if (!saveSource) return

    if (!/^https?:\/\//.test(saveSource)) {
      let filePath = saveSource
      try {
        filePath = await this.resolvePreviewablePath(saveSource)
      } catch (err) {
        this.debugLog('save-local-resolve-failed', { saveSource, message: err && err.message ? err.message : String(err) })
      }
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: err => {
          if (err.errMsg && err.errMsg.includes('auth deny')) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启相册权限后重试',
              confirmText: '去设置',
              success: r => { if (r.confirm) wx.openSetting() }
            })
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' })
          }
        }
      })
      return
    }

    const downloadUrl = saveSource.includes('/svg/')
      ? saveSource.replace('/svg/', '/png/')
      : saveSource
    wx.showLoading({ title: '下载中...' })
    wx.downloadFile({
      url: downloadUrl,
      success: res => {
        if (res.statusCode !== 200) {
          wx.hideLoading()
          wx.showToast({ title: '下载失败', icon: 'none' })
          return
        }
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading()
            wx.showToast({ title: '已保存到相册', icon: 'success' })
          },
          fail: err => {
            wx.hideLoading()
            if (err.errMsg && err.errMsg.includes('auth deny')) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中开启相册权限后重试',
                confirmText: '去设置',
                success: r => { if (r.confirm) wx.openSetting() }
              })
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' })
            }
          }
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下载失败，请检查网络', icon: 'none' })
      }
    })
  },

  async composeWithBottomLeftLogo(basePngUrl, logoPath, options = {}) {
    let basePath
    try {
      const dRes = await this.downloadFileWithRetry(basePngUrl, 3)
      this.debugLog('download-base-success', { statusCode: dRes.statusCode, tempFilePath: dRes.tempFilePath })
      if (dRes.statusCode !== 200 || !dRes.tempFilePath) {
        throw new Error('下载基础图失败 status=' + dRes.statusCode)
      }
      basePath = dRes.tempFilePath
    } catch (err) {
      this.debugLog('download-base-failed-use-imageinfo', { message: err && err.message ? err.message : String(err) })
      const info = await this.getImageInfoWithRetry(basePngUrl, 3)
      basePath = info.path
    }

    const baseInfo = await this.getImageInfo(basePath)
    const logoInfo = await this.getImageInfo(logoPath)
    const canvasWidth = baseInfo.width
    const canvasHeight = baseInfo.height
    const legendLines = Array.isArray(options.legendLines) ? options.legendLines : []
    const legendExtraLines = 2

    const margin = Math.max(16, Math.round(canvasWidth * 0.03))
    const maxLogoWidth = Math.round(canvasWidth * 0.18)
    const logoWidth = Math.max(1, Math.round(Math.min(maxLogoWidth, logoInfo.width) * 0.92))
    const logoHeight = Math.round((logoInfo.height / logoInfo.width) * logoWidth)
    const legendFontSize = Math.max(12, Math.round(canvasWidth * 0.018))
    const legendLineHeight = Math.max(16, Math.round(legendFontSize * 1.45))
    const legendPad = Math.max(10, Math.round(canvasWidth * 0.012))
    const legendExtraPadX = Math.max(6, Math.round(legendFontSize * 0.5))
    const legendExtraPadY = Math.max(8, Math.round(legendFontSize * 0.7))
    const legendGap = Math.max(10, Math.round(canvasWidth * 0.015))
    const legendOffsetY = Math.max(8, Math.round(canvasWidth * 0.01))
    const panelPad = Math.max(8, Math.round(canvasWidth * 0.008))

    const legendTextWidth = legendLines.reduce((max, line) => {
      const w = Array.from(String(line || '')).reduce((sum, ch) => {
        return sum + (this.getCjkAwareWidth(ch) >= 1 ? legendFontSize : legendFontSize * 0.62)
      }, 0)
      return Math.max(max, w)
    }, 0)

    const legendWidth = legendLines.length
      ? Math.max(
        Math.round(canvasWidth * 0.28),
        Math.round((legendTextWidth + legendPad * 2 + legendExtraPadX) * 1.12)
      )
      : 0
    const legendHeight = legendLines.length
      ? (legendPad * 2 + (legendLines.length + legendExtraLines) * legendLineHeight + legendExtraPadY)
      : 0

    const panelWidth = Math.max(logoWidth + panelPad * 2, legendWidth)
    const panelHeight = legendLines.length
      ? (logoHeight + legendGap + legendOffsetY + legendHeight + panelPad * 2)
      : (logoHeight + panelPad * 2)

    const panelLogoX = Math.max(panelPad, Math.round((panelWidth - logoWidth) / 2))
    const panelLogoY = panelPad
    const legendX = Math.max(0, Math.round((panelWidth - legendWidth) / 2))
    const legendY = panelPad + logoHeight + legendGap + legendOffsetY

    let legendPath = ''
    if (legendLines.length) {
      const legendTemp = await this.renderCanvas(legendWidth, legendHeight, async (_canvas, ctx) => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
        ctx.fillRect(0, 0, legendWidth, legendHeight)
        ctx.strokeStyle = 'rgba(44, 62, 80, 0.22)'
        ctx.lineWidth = Math.max(1, Math.round(canvasWidth * 0.0018))
        ctx.strokeRect(0, 0, legendWidth, legendHeight)
        ctx.fillStyle = '#2c3e50'
        ctx.font = `${legendFontSize}px sans-serif`
        ctx.textBaseline = 'top'
        legendLines.forEach((line, idx) => {
          const tx = legendPad
          const ty = legendPad + idx * legendLineHeight
          ctx.fillText(line, tx, ty)
        })
      })
      legendPath = await this.writeTmpArtifact(legendTemp, 'legend.png')
    }

    const wbsPath = await this.writeTmpArtifact(basePath, 'wbs.png')

    // 最终图采用左右排布，避免 panel 覆盖 WBS：左侧 panel，右侧原始 WBS
    const finalCanvasWidth = canvasWidth + panelWidth + margin
    const finalCanvasHeight = Math.max(canvasHeight, panelHeight)
    const wbsX = panelWidth + margin
    const panelX = 0
    const panelY = 0

    const finalTemp = await this.renderCanvas(finalCanvasWidth, finalCanvasHeight, async (canvas, ctx) => {
      const baseImg = await this.loadCanvasImage(canvas, basePath)
      const logoImg = await this.loadCanvasImage(canvas, logoPath)
      let legendImg = null
      if (legendPath) {
        legendImg = await this.loadCanvasImage(canvas, legendPath)
      }

      ctx.imageSmoothingEnabled = true
      if (typeof ctx.imageSmoothingQuality !== 'undefined') {
        ctx.imageSmoothingQuality = 'high'
      }

      ctx.drawImage(baseImg, wbsX, 0, canvasWidth, canvasHeight)

      if (legendImg) {
        ctx.drawImage(legendImg, panelX + legendX, panelY + legendY, legendWidth, legendHeight)
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
      ctx.fillRect(
        panelX + panelLogoX - panelPad,
        panelY + panelLogoY - panelPad,
        logoWidth + panelPad * 2,
        logoHeight + panelPad * 2
      )
      ctx.drawImage(logoImg, panelX + panelLogoX, panelY + panelLogoY, logoWidth, logoHeight)
    })

    const finalPath = await this.writeTmpArtifact(finalTemp, 'final.png')
  const panelPath = ''
    this._lastComposeDebug = {
      canvasWidth,
      canvasHeight,
      finalCanvasWidth,
      finalCanvasHeight,
      legendLineCount: legendLines.length,
      legendPath,
      panelWidth,
      panelHeight,
      panelX,
      panelY,
      wbsX,
      wbsPath,
      panelPath,
      finalPath
    }
    this.debugLog('compose-geometry', this._lastComposeDebug)
    this.debugLog('compose-output', { wbsPath, legendPath, panelPath, finalPath })

    return { wbsPath, legendPath, panelPath, finalPath }
  },

  renderCanvas(width, height, drawFn) {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery().in(this)
      query.select('#composeCanvas')
        .fields({ node: true, size: true })
        .exec(async qRes => {
          if (!qRes || !qRes[0] || !qRes[0].node) {
            reject(new Error('获取 canvas 节点失败'))
            return
          }

          try {
            const canvas = qRes[0].node
            const ctx = canvas.getContext('2d')
            const dpr = wx.getSystemInfoSync().pixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            ctx.scale(dpr, dpr)
            ctx.clearRect(0, 0, width, height)

            await drawFn(canvas, ctx)

            wx.canvasToTempFilePath({
              canvas,
              width: width * dpr,
              height: height * dpr,
              destWidth: width * dpr,
              destHeight: height * dpr,
              fileType: 'png',
              quality: 1,
              success: res => resolve(res.tempFilePath),
              fail: err => reject(new Error('canvasToTempFilePath: ' + (err && err.errMsg)))
            }, this)
          } catch (err) {
            reject(err)
          }
        })
    })
  },

  loadCanvasImage(canvas, src) {
    return new Promise((resolve, reject) => {
      const img = canvas.createImage()
      img.onload = () => resolve(img)
      img.onerror = e => reject(new Error('图片加载失败: ' + src + ' ' + JSON.stringify(e)))
      img.src = src
    })
  },

  ensureArtifactTmpDir() {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager()
      fs.mkdir({
        dirPath: ARTIFACT_TMP_DIR,
        recursive: true,
        success: () => resolve(ARTIFACT_TMP_DIR),
        fail: err => {
          if (err && err.errMsg && err.errMsg.includes('file already exists')) {
            resolve(ARTIFACT_TMP_DIR)
            return
          }
          reject(new Error('创建tmp目录失败: ' + (err && err.errMsg)))
        }
      })
    })
  },

  removeFileIfExists(filePath) {
    return new Promise((resolve) => {
      const fs = wx.getFileSystemManager()
      fs.unlink({
        filePath,
        success: () => resolve(),
        fail: () => resolve()
      })
    })
  },

  copyFileOverwrite(srcPath, destPath) {
    return this.removeFileIfExists(destPath).then(() => new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager()
      fs.copyFile({
        srcPath,
        destPath,
        success: () => resolve(destPath),
        fail: err => reject(new Error('copyFile失败: ' + (err && err.errMsg)))
      })
    }))
  },

  async writeTmpArtifact(sourcePath, fileName) {
    await this.ensureArtifactTmpDir()
    let srcPath = sourcePath
    try {
      const info = await this.getImageInfo(sourcePath)
      srcPath = info.path || sourcePath
    } catch (e) {
      srcPath = sourcePath
    }
    const destPath = `${ARTIFACT_TMP_DIR}/${fileName}`
    await this.copyFileOverwrite(srcPath, destPath)
    return destPath
  },

  resolvePreviewablePath(source) {
    return new Promise((resolve, reject) => {
      if (!source) {
        reject(new Error('empty source'))
        return
      }

      if (/^https?:\/\//.test(source)) {
        resolve(source)
        return
      }

      // 已经是稳定本地路径可直接返回
      if (source.startsWith('wxfile://')) {
        resolve(source)
        return
      }

      // 对 http://tmp 或其它临时路径，先 getImageInfo 归一化，再 saveFile 为稳定路径
      this.getImageInfo(source)
        .then(info => {
          const path = info.path || source
          if (path.startsWith('wxfile://')) {
            resolve(path)
            return
          }
          wx.saveFile({
            tempFilePath: path,
            success: r => resolve(r.savedFilePath || path),
            fail: () => resolve(path)
          })
        })
        .catch(() => {
          wx.saveFile({
            tempFilePath: source,
            success: r => resolve(r.savedFilePath || source),
            fail: () => resolve(source)
          })
        })
    })
  },

  getCjkAwareWidth(ch) {
    return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.5
  },

  debugLog(tag, payload) {
    const ts = new Date().toISOString()
    const shortTs = ts.slice(11, 19)
    const payloadText = this.toDebugText(payload)
    const line = `${shortTs} ${tag}${payloadText ? ' ' + payloadText : ''}`
    const nextLines = [line].concat(this.data.debugLines || []).slice(0, 12)
    this.setData({ debugLines: nextLines })
    try {
      console.log('[logo-debug]', ts, tag, payload || {})
    } catch (e) {
      console.log('[logo-debug]', ts, tag)
    }
  },

  toDebugText(payload) {
    if (!payload) return ''
    try {
      const text = JSON.stringify(payload)
      return text.length > 180 ? text.slice(0, 180) + '...' : text
    } catch (e) {
      return String(payload)
    }
  },

  downloadFileWithRetry(url, retries = 3) {
    return new Promise((resolve, reject) => {
      const attempt = (left) => {
        wx.downloadFile({
          url,
          success: resolve,
          fail: err => {
            if (left > 1) {
              setTimeout(() => attempt(left - 1), 250)
              return
            }
            reject(new Error('downloadFile: ' + (err && err.errMsg || 'unknown')))
          }
        })
      }
      attempt(retries)
    })
  },

  getImageInfoWithRetry(src, retries = 3) {
    return new Promise((resolve, reject) => {
      const attempt = (left) => {
        wx.getImageInfo({
          src,
          success: resolve,
          fail: err => {
            if (left > 1) {
              setTimeout(() => attempt(left - 1), 250)
              return
            }
            reject(new Error('getImageInfo: ' + (err && err.errMsg || 'unknown')))
          }
        })
      }
      attempt(retries)
    })
  },

  getImageInfo(src) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src,
        success: resolve,
        fail: reject
      })
    })
  }
})
