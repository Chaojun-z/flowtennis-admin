const { loginWithWechat, loadCoachWorkbench } = require('../../utils/api');
const { buildWeekDays, formatScheduleItem, weekRangeText, buildTimetableDays, classBlockStyle } = require('../../utils/schedule');

const studentsList = [
  { id: 1, name: '沈沉', avatarText: '沈', pinyin: 'shenchen', type: '负责学员', cumulative: 42, progress: '12 / 24', avatarClass: 'avatar-warm' },
  { id: 2, name: '董凡轩', avatarText: '董', pinyin: '', type: '负责学员', cumulative: 15, progress: '5 / 10', avatarClass: 'avatar-teal' },
  { id: 3, name: '佳妮', avatarText: '佳', pinyin: '', type: '代上学员', cumulative: 3, progress: '-', avatarClass: 'avatar-green' },
  { id: 4, name: 'Emma', avatarText: 'E', pinyin: '', type: '负责学员', cumulative: 28, progress: '1 / 10', avatarClass: 'avatar-purple' }
];

const shiftsList = [
  { id: 1, name: '青少年网球进阶 A班', course: '私教课', student: '沈沉', progress: '12 / 24', status: '进行中' },
  { id: 2, name: '成人零基础周末班', course: '私教课', student: '董凡轩', progress: '5 / 10', status: '进行中' },
  { id: 3, name: '暑期私教速成班', course: '私教课', student: '小鹿', progress: '18 / 20', status: '进行中' },
  { id: 4, name: '工作日体验班', course: '体验课', student: '佳妮', progress: '2 / 5', status: '已结束' }
];

const timetableHours = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);

function statusClass(item) {
  return String(item.statusText || '').includes('待') ? 'tag-danger' : 'tag-green';
}

function adaptSchedule(raw = []) {
  return raw.map((item) => {
    const formatted = formatScheduleItem(item);
    const block = classBlockStyle(formatted);
    return {
      ...formatted,
      type: formatted.title,
      student: formatted.studentText,
      loc: formatted.locationText,
      status: formatted.statusText,
      feedbackPending: String(formatted.statusText || '').includes('待'),
      statusClass: statusClass(formatted),
      blockStyle: `top:${block.top}rpx;height:${block.height}rpx`
    };
  });
}

Page({
  data: {
    loading: true,
    error: '',
    activeTab: 'timetable',
    isDashboard: false,
    isTimetable: true,
    isStudents: false,
    isShifts: false,
    weekOffset: 0,
    weekTitle: '本周',
    weekRange: '',
    days: [],
    timetableDays: [],
    timetableHours,
    schedule: [],
    visibleClasses: [],
    dashboardClasses: [],
    studentsList,
    shiftsList,
    stats: { month: 0, week: 0, today: 0, feedback: 0, pending: 0, conversion: '0%' },
    selectedClass: null,
    showDetail: false,
    showFeedback: false,
    showPoster: false,
    posterStyle: '蓝绿对角',
    posterStyles: ['蓝绿对角', '极简墨绿', '对角球场', '线框蓝图', '极简白框', '活力绿']
  },

  onLoad() {
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      await loginWithWechat();
      const data = await loadCoachWorkbench();
      this.setData({ schedule: adaptSchedule(data.schedule || []), loading: false });
      this.renderWeek();
    } catch (err) {
      this.setData({ loading: false, error: err.message || '请先进入完整教练端登录并绑定微信' });
    }
  },

  renderWeek() {
    const { weekOffset, schedule } = this.data;
    const days = buildWeekDays(schedule, weekOffset);
    const visibleClasses = days.reduce((all, day) => all.concat(day.items.map(item => ({ ...item, dayKey: day.key }))), []);
    const pending = visibleClasses.filter(item => item.feedbackPending).length;
    const today = days.find(day => day.isToday);
    this.setData({
      weekTitle: weekOffset === 0 ? '本周' : (weekOffset > 0 ? `后 ${weekOffset} 周` : `前 ${Math.abs(weekOffset)} 周`),
      weekRange: weekRangeText(weekOffset),
      days,
      timetableDays: buildTimetableDays(visibleClasses, weekOffset),
      visibleClasses,
      dashboardClasses: visibleClasses.slice(0, 4),
      stats: {
        month: schedule.length,
        week: visibleClasses.length,
        today: today ? today.items.length : 0,
        feedback: Math.max(0, visibleClasses.length - pending),
        pending,
        conversion: '0%'
      }
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'timetable';
    this.setData({
      activeTab,
      isDashboard: activeTab === 'dashboard',
      isTimetable: activeTab === 'timetable',
      isStudents: activeTab === 'students',
      isShifts: activeTab === 'shifts'
    });
  },

  prevWeek() {
    this.setData({ weekOffset: this.data.weekOffset - 1 }, () => this.renderWeek());
  },

  nextWeek() {
    this.setData({ weekOffset: this.data.weekOffset + 1 }, () => this.renderWeek());
  },

  goCurrentWeek() {
    this.setData({ weekOffset: 0 }, () => this.renderWeek());
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const selectedClass = this.data.schedule.find(item => String(item.id) === String(id));
    if (selectedClass) this.setData({ selectedClass, showDetail: true });
  },

  closeSheets() {
    this.setData({ showDetail: false, showFeedback: false, showPoster: false });
  },

  openFeedback() {
    if (!this.data.selectedClass) return;
    this.setData({ showDetail: false, showFeedback: true });
  },

  openPoster() {
    this.setData({ showPoster: true });
  },

  closePoster() {
    this.setData({ showPoster: false });
  },

  selectPosterStyle(event) {
    this.setData({ posterStyle: event.currentTarget.dataset.style });
  },

  stopMove() {},

  openWebview() {
    wx.navigateTo({ url: '/pages/webview/webview' });
  }
});
