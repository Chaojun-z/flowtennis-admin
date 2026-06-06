const { loginWithWechat, loadCoachWorkbench, TOKEN_KEY, USER_KEY } = require('../../utils/api');
const { findSchedule, formatScheduleItem } = require('../../utils/schedule');

function hasStoredCoachSession() {
  const token = wx.getStorageSync(TOKEN_KEY);
  const user = wx.getStorageSync(USER_KEY) || {};
  return !!(token && user.role === 'editor');
}

async function loadWorkbenchWithSession() {
  if (!hasStoredCoachSession()) await loginWithWechat();
  try {
    return await loadCoachWorkbench();
  } catch (err) {
    if (!/未登录|登录已过期|401/.test(err.message || '')) throw err;
    await loginWithWechat();
    return loadCoachWorkbench();
  }
}

Page({
  data: {
    loading: true,
    error: '',
    scheduleId: '',
    course: null
  },

  onLoad(options) {
    this.setData({ scheduleId: options.scheduleId || '' });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const data = await loadWorkbenchWithSession();
      const item = findSchedule(data.schedule || [], this.data.scheduleId);
      if (!item) throw new Error('没有找到这节课，可能已取消或不属于当前教练');
      this.setData({ course: formatScheduleItem(item), loading: false });
    } catch (err) {
      this.setData({ loading: false, error: err.message || '课程详情加载失败' });
    }
  },

  backToSchedule() {
    const pages = getCurrentPages();
    if (pages.length > 1) return wx.navigateBack();
    wx.redirectTo({ url: '/pages/schedule/schedule' });
  }
});
