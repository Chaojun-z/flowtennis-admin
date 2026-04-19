const { WEB_VIEW_URL } = require('../../config');

function appendWechatCode(url, code) {
  if (!code) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}wechatCode=${encodeURIComponent(code)}`;
}

Page({
  data: {
    webViewUrl: WEB_VIEW_URL
  },
  onLoad() {
    wx.login({
      success: (res) => {
        if (!res.code) return;
        this.setData({
          webViewUrl: appendWechatCode(WEB_VIEW_URL, res.code)
        });
      }
    });
  }
});
