App({
  onLaunch() {
    this.checkMiniProgramUpdate()
  },

  /**
   * 检查并应用小程序新版本（微信客户端在后台拉包，与业务服务器无关）。
   * 发布流程：微信公众平台上传代码 → 提交审核 → 发布；用户侧需重启小程序才生效。
   *
   * 说明：
   * - 监听器只绑定一次，避免 onShow 重复注册在部分机型上引发异常。
   * - 开发者工具（envVersion === 'develop'）里 getUpdateManager 常出现 timeout 等内部错误，
   *   与真机体验无关，故在 develop 下跳过。
   */
  checkMiniProgramUpdate() {
    if (!wx.canIUse('getUpdateManager')) {
      return
    }
    try {
      const { miniProgram } = wx.getAccountInfoSync()
      if (miniProgram.envVersion === 'develop') {
        return
      }
    } catch (e) {
      // getAccountInfoSync 不可用时仍尝试绑定（真机一般可用）
    }
    if (this._updateManagerHooksBound) {
      return
    }
    this._updateManagerHooksBound = true

    const updateManager = wx.getUpdateManager()
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '发现新版本',
        content: '新版本已下载完成，请重启小程序以使用最新功能。',
        confirmText: '立即重启',
        showCancel: false,
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate()
          }
        }
      })
    })
    updateManager.onUpdateFailed(() => {
      wx.showToast({
        title: '新版本下载失败，请检查网络后重试',
        icon: 'none'
      })
    })
  },

  globalData: {
    plantumlServer: 'https://www.plantuml.com/plantuml'
  }
})
