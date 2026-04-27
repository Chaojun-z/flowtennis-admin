const { SCHEDULE_TEMPLATE_ID, COURSE_REMINDER_TEMPLATE_ID } = require('../../config');
const { loginWithPassword, bindWechatAfterLogin, TOKEN_KEY, USER_KEY } = require('../../utils/api');

function enterCoachPortal() {
  wx.navigateTo({ url: '/pages/schedule/schedule' });
}

function assertCoachLoginUser(user = {}) {
  if (user.role !== 'editor') {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(USER_KEY);
    throw new Error('当前账号不是教练账号，无法进入教练端');
  }
}

Page({
  data: {
    account: '',
    password: '',
    agreed: false,
    loggingIn: false
  },
  onAccountInput(event) {
    this.setData({ account: event.detail.value });
  },
  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },
  onAgreementChange(event) {
    const values = event.detail.value || [];
    this.setData({ agreed: values.includes('agree') });
  },
  openAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },
  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },
  requestScheduleNotice() {
    wx.requestSubscribeMessage({
      tmplIds: [SCHEDULE_TEMPLATE_ID, COURSE_REMINDER_TEMPLATE_ID],
      complete: enterCoachPortal
    });
  },
  submitLogin() {
    const account = String(this.data.account || '').trim();
    const password = String(this.data.password || '');
    if (!account || !password) {
      wx.showToast({ title: '请填写账号和密码', icon: 'none' });
      return;
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true });
    loginWithPassword(account, password)
      .then((data) => {
        assertCoachLoginUser(data.user || {});
        return data;
      })
      .then((data) => bindWechatAfterLogin().then(() => data))
      .then(() => {
        const app = getApp();
        if (app && app.globalData) app.globalData.privacyAccepted = true;
        this.requestScheduleNotice();
      })
      .catch((error) => {
        wx.showToast({
          title: error.message || '登录失败',
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({ loggingIn: false });
      });
  }
});
