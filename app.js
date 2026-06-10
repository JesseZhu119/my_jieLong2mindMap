App({
  onLaunch() {
    this.checkMiniProgramUpdate()
  },

  onShow() {
    // 从后台回到前台时再查一次：用户可能在使用时后台已下好新版本
    this.checkMiniProgramUpdate()
  },

  /**
   * 检查并应用小程序新版本（微信客户端在后台拉包，与业务服务器无关）。
   * 发布流程：微信公众平台上传代码 → 提交审核 → 发布；用户侧需重启小程序才生效。
   */
  checkMiniProgramUpdate() {
    if (!wx.canIUse('getUpdateManager')) {
      return
    }
    const updateManager = wx.getUpdateManager()
    updateManager.onCheckForUpdate(() => {})
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
