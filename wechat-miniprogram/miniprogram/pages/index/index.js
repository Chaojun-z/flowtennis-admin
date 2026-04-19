const { SCHEDULE_TEMPLATE_ID, COURSE_REMINDER_TEMPLATE_ID } = require('../../config');

function enterCoachPortal() {
  wx.navigateTo({ url: '/pages/webview/webview' });
}

Page({
  requestScheduleNotice() {
    wx.requestSubscribeMessage({
      tmplIds: [SCHEDULE_TEMPLATE_ID, COURSE_REMINDER_TEMPLATE_ID],
      complete: enterCoachPortal
    });
  },
  enterWithoutNotice() {
    enterCoachPortal();
  }
});
