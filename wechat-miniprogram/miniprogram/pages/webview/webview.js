const { WEB_VIEW_URL } = require('../../config');

function appendQuery(url, params) {
  const pairs = Object.keys(params)
    .filter((key) => params[key])
    .map((key) => `${key}=${encodeURIComponent(params[key])}`);
  if (!pairs.length) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${pairs.join('&')}`;
}

Page({
  data: {
    webViewUrl: WEB_VIEW_URL
  },
  onLoad(options) {
    wx.login({
      success: (res) => {
        if (!res.code) return;
        this.setData({
          webViewUrl: appendQuery(WEB_VIEW_URL, {
            wechatCode: res.code,
            scheduleId: options && options.scheduleId
          })
        });
      }
    });
  }
});
