const { parseJielong, toMindmap } = require('../../utils/parser.js')
const { buildUrl } = require('../../utils/plantumlEncoder.js')

const DEMO_TEXT = `丁跑营接龙
1. 小冯先生 A组
2. 祝剑 C
3. 笑波 慢跑
4. 芳芳
5. 行者 D
6. 胡JF C
7. 李龙 A 咬住冯神
8. 必破130 B
9. 反向冲刺 D 争取跟住
10. 七秒钟 D 争取跟住
11. 挥挥 慢跑
12. 珍珍 D
13. 大朱朱 B
14. 兆方 B
15. 阿权 D
16. 雪梅 C
17. 佳爷 慢跑
18. 阿三 D 争取跟住
19. 沈磊 A 争取跟上冯神
20. 岛主 D
21. 武崇显 D
22. 何东锋 D
23. 阿进 C 菜就多练
24. lisa D
25. 张平 D`

Page({
  data: {
    inputText: '',
    lineCount: 0,
    parsed: null,
    pumlText: '',
    imageUrl: '',
    loading: false,
    server: 'https://www.plantuml.com/plantuml'
  },

  onLoad() {
    const server = (getApp().globalData && getApp().globalData.plantumlServer) || this.data.server
    this.setData({ server })
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
      parsed: null,
      pumlText: '',
      imageUrl: ''
    })
  },

  onGenerate() {
    const text = this.data.inputText.trim()
    if (!text) {
      wx.showToast({ title: '请先粘贴接龙内容', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const parsed = parseJielong(text)
      if (!parsed.total) {
        wx.showToast({ title: '未识别到有效成员', icon: 'none' })
        this.setData({ loading: false })
        return
      }

      const pumlText = toMindmap(parsed)
      const imageUrl = buildUrl(this.data.server, 'svg', pumlText)

      this.setData({
        parsed,
        pumlText,
        imageUrl,
        loading: false
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '生成失败：' + err.message, icon: 'none' })
      this.setData({ loading: false })
    }
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

  onPreviewImage() {
    if (!this.data.imageUrl) return
    // SVG 不支持预览，预览时切换 PNG 链接
    const previewUrl = this.data.imageUrl.replace('/svg/', '/png/')
    wx.previewImage({
      urls: [previewUrl],
      current: previewUrl
    })
  },

  onCopyUrl() {
    if (!this.data.imageUrl) return
    wx.setClipboardData({
      data: this.data.imageUrl,
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

  onSaveImage() {
    if (!this.data.imageUrl) return
    const downloadUrl = this.data.imageUrl.replace('/svg/', '/png/')
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
  }
})
