const { loginWithPassword, loginWithWechat, bindWechatAfterLogin, TOKEN_KEY, USER_KEY } = require('../../utils/api');

const AGREEMENT_ACCEPTED_KEY = 'ft_mini_agreement_accepted_v1';

function enterCoachPortal() {
  wx.redirectTo({ url: '/pages/schedule/schedule' });
}

function noop() {}

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
    loggingIn: false,
    wechatLoggingIn: false
  },
  onLoad() {
    const agreed = !!wx.getStorageSync(AGREEMENT_ACCEPTED_KEY);
    this.setData({ agreed });
    if (agreed) this.markPrivacyAccepted();
    if (this.hasStoredCoachSession()) enterCoachPortal();
  },
  hasStoredCoachSession() {
    const token = wx.getStorageSync(TOKEN_KEY);
    const user = wx.getStorageSync(USER_KEY) || {};
    if (!token || !user.role) return false;
    try {
      assertCoachLoginUser(user);
      return true;
    } catch (error) {
      return false;
    }
  },
  markPrivacyAccepted() {
    const app = getApp();
    if (app && app.globalData) app.globalData.privacyAccepted = true;
  },
  saveAgreementAccepted() {
    wx.setStorageSync(AGREEMENT_ACCEPTED_KEY, true);
    this.markPrivacyAccepted();
  },
  onAccountInput(event) {
    this.setData({ account: event.detail.value });
  },
  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },
  onAgreementChange(event) {
    const values = event.detail.value || [];
    const agreed = values.includes('agree');
    this.setData({ agreed });
    if (agreed) this.saveAgreementAccepted();
  },
  openAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },
  openPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
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
      .then(() => {
        this.saveAgreementAccepted();
        enterCoachPortal();
        bindWechatAfterLogin()
          .catch(noop);
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
  },
  submitWechatLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    if (this.data.wechatLoggingIn) return;
    this.setData({ wechatLoggingIn: true });
    loginWithWechat()
      .then((data) => {
        assertCoachLoginUser(data.user || {});
        this.saveAgreementAccepted();
        enterCoachPortal();
      })
      .catch((error) => {
        const message = error.message || '微信登录失败';
        wx.showToast({
          title: /未绑定/.test(message) ? '请先用账号密码登录一次，系统会自动绑定微信' : message,
          icon: 'none'
        });
      })
      .finally(() => {
        this.setData({ wechatLoggingIn: false });
      });
  }
});
