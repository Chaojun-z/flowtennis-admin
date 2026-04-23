const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const projectConfig = readJson('wechat-miniprogram/project.config.json');
assert.strictEqual(projectConfig.miniprogramRoot, 'miniprogram/', 'project.config.json should point to miniprogram/');
assert.strictEqual(projectConfig.appid, 'wx7acb7603ee803923', 'project.config.json should use the real mini program AppID');

const appConfig = readJson('wechat-miniprogram/miniprogram/app.json');
assert.deepStrictEqual(appConfig.pages, ['pages/index/index', 'pages/schedule/schedule', 'pages/detail/detail', 'pages/agreement/agreement', 'pages/privacy/privacy'], 'mini program should keep only native entry pages plus agreement and privacy pages');
assert.strictEqual(appConfig.sitemapLocation, 'sitemap.json', 'mini program should include sitemap config');
assert.strictEqual(appConfig.lazyCodeLoading, 'requiredComponents', 'mini program should enable component lazy injection');
assert.strictEqual(appConfig.__usePrivacyCheck__, true, 'mini program should enable the WeChat privacy check mechanism');

const indexWxml = readText('wechat-miniprogram/miniprogram/pages/index/index.wxml');
assert.match(indexWxml, /网球兄弟/, 'index page should render the Gemini login title');
assert.match(indexWxml, /FLOWTENNIS · 管理系统/, 'index page should render the Gemini login subtitle');
assert.match(indexWxml, /请输入账号或手机号/, 'index page should render the mapped account input');
assert.match(indexWxml, /请输入密码/, 'index page should render the mapped password input');
assert.match(indexWxml, /checkbox/, 'index page should render an agreement checkbox');
assert.match(indexWxml, /我已阅读并同意/, 'index page should render the agreement consent copy');
assert.match(indexWxml, /用户协议/, 'index page should expose the user agreement link');
assert.match(indexWxml, /隐私政策/, 'index page should expose the privacy policy link');
assert.match(indexWxml, /bindtap="submitLogin"[\s\S]*登录/, 'index login button should use the real account login submit handler');
assert.match(indexWxml, /login-spinner/, 'index login button should render a centered custom loading spinner');
assert.doesNotMatch(indexWxml, /loading="\{\{loggingIn\}\}"/, 'index login button should not use the native button loading layout');
assert.doesNotMatch(indexWxml, /disabled="\{\{loggingIn\}\}"/, 'index login button should keep its visual style while logging in');
assert.doesNotMatch(indexWxml, /<web-view/, 'index page should stay native so subscribe permission can be requested by tap');
assert.doesNotMatch(indexWxml, /password-eye/, 'login page should remove the password eye icon');

const indexJs = readText('wechat-miniprogram/miniprogram/pages/index/index.js');
assert.match(indexJs, /SCHEDULE_TEMPLATE_ID/, 'index page should read the schedule subscribe template ID from config');
assert.match(indexJs, /COURSE_REMINDER_TEMPLATE_ID/, 'index page should read the course reminder subscribe template ID from config');
assert.match(indexJs, /loginWithPassword/, 'index page should call the real account password login helper');
assert.match(indexJs, /bindWechatAfterLogin/, 'index page should bind the current mini program WeChat account after password login');
assert.match(indexJs, /function assertCoachLoginUser/, 'index page should validate coach role before entering the coach mini program');
assert.match(indexJs, /user\.role !== 'editor'/, 'index page should reject non-coach accounts on the login page');
assert.match(indexJs, /loginWithPassword\(account, password\)[\s\S]*assertCoachLoginUser\(data\.user \|\| \{\}\)[\s\S]*bindWechatAfterLogin/, 'index page should check role before WeChat binding and navigation');
assert.match(indexJs, /wx\.requestSubscribeMessage/, 'index page should request schedule subscribe permission from a tap');
assert.match(indexJs, /tmplIds:\s*\[SCHEDULE_TEMPLATE_ID,\s*COURSE_REMINDER_TEMPLATE_ID\]/, 'index page should request both schedule and course reminder templates');
assert.match(indexJs, /pages\/schedule\/schedule/, 'index page should navigate into the native schedule page after the tap');
assert.match(indexJs, /agreed/, 'index page should track the agreement checkbox state');
assert.match(indexJs, /openAgreement/, 'index page should open the agreement page from the login page');
assert.match(indexJs, /openPrivacy/, 'index page should open the privacy page from the login page');
assert.doesNotMatch(indexJs, /enterWithoutNotice/, 'index page should no longer keep the fake direct-enter handler');
assert.doesNotMatch(indexJs, /passwordVisible|togglePasswordVisible/, 'index page should remove password visibility dead code');
assert.doesNotMatch(indexWxml, /passwordVisible/, 'index page should not bind removed password visibility state');
assert.match(indexWxml, /<input class="entry-input" password="\{\{true\}\}"/, 'index password input should stay masked without dead state');

const indexWxss = readText('wechat-miniprogram/miniprogram/pages/index/index.wxss');
assert.match(indexWxss, /background:\s*linear-gradient\(180deg,\s*#2b3a55 0%,\s*#1e2a38 35%,\s*#f4f6f9 60%,\s*#f4f6f9 100%\)/i, 'login page should use the requested brand gradient background');
assert.match(indexWxss, /\.entry-card\s*\{(?=[\s\S]*width:\s*345px;)(?=[\s\S]*border-radius:\s*24px;)(?=[\s\S]*padding:\s*32px;)(?=[\s\S]*box-shadow:\s*0 12px 24px rgba\(0,\s*0,\s*0,\s*0\.08\))/, 'login card should match the Gemini card token');
assert.match(indexWxss, /\.entry-title\s*\{[\s\S]*font-size:\s*24px;[\s\S]*font-weight:\s*800;[\s\S]*letter-spacing:\s*1px;/, 'login title should match the Gemini typography token');
assert.match(indexWxss, /\.entry-input\s*\{(?=[\s\S]*height:\s*48px;)(?=[\s\S]*background:\s*#f8fafc;)(?=[\s\S]*border:\s*1px solid #e2e8f0;)(?=[\s\S]*border-radius:\s*12px;)(?=[\s\S]*font-size:\s*14px;)/i, 'login inputs should match the Gemini form token');
assert.match(indexWxss, /\.login-btn\s*\{(?=[\s\S]*height:\s*48px;)(?=[\s\S]*background:\s*#2b3a55;)(?=[\s\S]*border-radius:\s*999px;)(?=[\s\S]*font-size:\s*16px;)(?=[\s\S]*letter-spacing:\s*4px;)/i, 'login button should match the Gemini button token');
assert.match(indexWxss, /\.login-btn\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/i, 'login button content should be vertically centered');
assert.match(indexWxss, /\.login-spinner\s*\{[\s\S]*animation:\s*loginSpin 0\.8s linear infinite;/i, 'login page should use a custom centered loading spinner');

const scheduleWxml = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.wxml');
assert.match(scheduleWxml, /本周|下周/, 'native schedule page should provide week navigation');
assert.match(scheduleWxml, /bindtap="openDetail"/, 'native schedule cards should open native detail');
assert.match(scheduleWxml, /student-card"[^>]*data-id="\{\{item\.id\}\}"[^>]*bindtap="openStudentDetail"/, 'native student cards should open the mapped student detail sheet');
assert.match(scheduleWxml, /今日排课/, 'native workbench should keep the today schedule section');
assert.match(scheduleWxml, /本周待办/, 'native workbench should also show a weekly todo section');
assert.match(scheduleWxml, /今日课程[\s\S]*本周课时[\s\S]*本月课时[\s\S]*本月反馈[\s\S]*未反馈[\s\S]*体验课转化/, 'native workbench should keep the six original web metrics in the requested order');
assert.match(scheduleWxml, /stats\.conversionText[\s\S]*stats\.conversionUnit[\s\S]*conversion-unit/, 'native workbench should render conversion percent with a separate small unit');
assert.match(scheduleWxml, /dashboard-hero/, 'native workbench should render the recreated SVG hero header');
assert.match(scheduleWxml, /dashboard-grid/, 'native workbench should render the two-row three-column metric grid');
assert.match(scheduleWxml, /today-lesson-card/, 'native workbench should render the larger today lesson card style');
assert.match(scheduleWxml, /week-task-card/, 'native workbench should render the weekly task card style');
assert.match(scheduleWxml, /coachGreeting/, 'native workbench should bind the greeting line dynamically');
assert.match(scheduleWxml, /coachDisplayName/, 'native workbench should bind the coach name dynamically');
assert.match(scheduleWxml, /coach-title-row/, 'native workbench should render the coach title and dropdown arrow in one aligned row');
assert.match(scheduleWxml, /bindtap="toggleCoachMenu"/, 'coach header arrow should open the account action sheet');
assert.match(scheduleWxml, /coach-menu-sheet[\s\S]*用户协议[\s\S]*隐私政策[\s\S]*退出登录[\s\S]*取消/, 'coach menu sheet should expose agreement, privacy, logout, and cancel actions');
assert.match(scheduleWxml, /coach-menu-profile[\s\S]*coach-menu-avatar[\s\S]*coach-menu-name[\s\S]*教练 ID:/, 'coach menu sheet should render the coach profile block with avatar, name, and coach id');
assert.match(scheduleWxml, /wx:if="\{\{coachMenuId\}\}"[^>]*class="coach-menu-id"/, 'coach menu should hide coach ID when backend does not return it');
assert.match(scheduleWxml, /下一节课需跨校区换场，请预留通勤时间/, 'native workbench should show lightweight cross-campus travel reminder');
assert.match(scheduleWxml, /coach-menu-group[\s\S]*coach-menu-item[\s\S]*coach-menu-divider[\s\S]*coach-menu-danger-card[\s\S]*coach-menu-cancel-card/, 'coach menu sheet should split menu actions into grouped cards for menu, logout, and cancel');
assert.match(scheduleWxml, /loading-shell[\s\S]*loading-shell-safe[\s\S]*loading-shell-nav[\s\S]*loading-shell-title[\s\S]*loading-shell-summary[\s\S]*loading-shell-tip[\s\S]*loading-shell-list[\s\S]*loading-shell-item/, 'schedule page should render the structured skeleton screen instead of plain blank cards');
assert.match(scheduleWxml, /wx:if="\{\{loading && isDashboard\}\}"/, 'dashboard skeleton should only be used for the dashboard tab');
assert.match(scheduleWxml, /wx:elif="\{\{loading\}\}"[\s\S]*class="tab-loading"/, 'non-dashboard tabs should not reuse the dashboard skeleton while loading');
assert.doesNotMatch(scheduleWxml, /课表加载中\.\.\./, 'schedule page should not show the old plain loading copy');
assert.doesNotMatch(scheduleWxml.match(/<view class="sheet coach-menu-sheet[\s\S]*?<\/view>\s*<\/view>/)[0], /进入完整教练端/, 'coach menu sheet should not expose the full web coach entry');
assert.doesNotMatch(scheduleWxml, /dashboard-topbar/, 'native workbench should not render the extra custom top bar');
assert.doesNotMatch(scheduleWxml, /hero-device-pill/, 'native workbench should not render the extra simulated top-right device pill');
assert.doesNotMatch(scheduleWxml, /已连接/, 'native workbench should not render the temporary real-device connection tag');
assert.doesNotMatch(scheduleWxml, /coach-task-panel/, 'native workbench should not show a separate large task card above the summary');
assert.match(scheduleWxml, /wx:if="\{\{reminderItems\.length\}\}"/, 'native workbench summary should only render when there are reminders');
assert.match(scheduleWxml, /metric-primary/, 'native workbench should use a consumer-style highlighted metric card');
assert.match(scheduleWxml, /schedule-location/, 'native workbench lesson cards should make location easy to scan');
assert.match(scheduleWxml, /reminder-value/, 'native workbench reminder numbers should be styled separately');
assert.match(scheduleWxml, /class="reminder-value">\s\{\{item\.value\}\}\s<\/text>/, 'native workbench reminder numbers should keep one visible space before and after the number');
assert.match(scheduleWxml, /today-lesson-separator/, 'native workbench today card should render location and student on one SVG-style meta row');
assert.match(scheduleWxml, /week-task-location[\s\S]*item\.student[\s\S]*week-task-separator[\s\S]*item\.shortLocation/, 'native workbench weekly todo card should render student before location like the SVG');
assert.match(scheduleWxml, /scroll-top="\{\{timetableScrollTop\}\}"/, 'native timetable should support vertical auto positioning');
assert.match(scheduleWxml, /scroll-left="\{\{timetableScrollLeft\}\}"/, 'native timetable should support horizontal auto positioning to today');
assert.match(scheduleWxml, /scroll-x scroll-y class="timetable-scroll"/, 'native timetable should use one native two-axis scroll for smoother movement');
assert.match(scheduleWxml, /custom-nav-title">我的课表/, 'timetable tab should render the title in a dedicated custom nav layer');
assert.match(scheduleWxml, /custom-nav-title">我的学员/, 'students tab should render the title in a dedicated custom nav layer');
assert.match(scheduleWxml, /custom-nav-title">我的班次/, 'shifts tab should render the title in a dedicated custom nav layer');
assert.match(scheduleWxml, /tt-time-axis[\s\S]*tt-now-label[\s\S]*currentTimeText[\s\S]*tt-day-columns[\s\S]*tt-now-line[\s\S]*tt-now-line-solid/, 'native timetable should keep the current-time label fixed inside the left time axis');
assert.match(scheduleWxml, /tt-day-date-dot/, 'native timetable should render the active day as a round date marker');
assert.match(scheduleWxml, /tt-course-status/, 'native timetable course cards should render pending status as a compact badge');
assert.match(scheduleWxml, /tt-course-time[\s\S]*course\.timeText[\s\S]*tt-course-type[\s\S]*course\.courseTagText/, 'native timetable course cards should split time and course type for separate typography');
assert.doesNotMatch(scheduleWxml, /反馈:/, 'native timetable course cards should not show the old feedback prefix');
assert.match(scheduleWxml, /feedbackHasSaved && !feedbackEditing[\s\S]*生成海报[\s\S]*编辑反馈/, 'saved feedback sheet should show poster and edit actions');
assert.match(scheduleWxml, /wx:else[\s\S]*取消[\s\S]*保存反馈/, 'unsaved feedback sheet should show cancel and save actions');
assert.match(scheduleWxml, /data-field="practicedToday"[\s\S]*data-field="knowledgePoint"[\s\S]*data-field="nextTraining"/, 'feedback sheet should bind all three feedback fields');
assert.match(scheduleWxml, /placeholder-class="feedback-input-placeholder"/, 'feedback inputs should use the mapped placeholder color token');
assert.match(scheduleWxml, /bindfocus="onFeedbackFocus"[\s\S]*cursor-color="#3b5bff"/, 'feedback input focus should drive the blue focus state and cursor color');
assert.doesNotMatch(scheduleWxml, /feedback-input-bar/, 'feedback sheet should not fake the input cursor with a separate blue bar');
assert.match(scheduleWxml, /feedback-course-time[\s\S]*selectedClassDetail\.basicInfo\.datetime[\s\S]*feedback-course-separator/, 'feedback course card should render full date time and styled separators');
assert.match(scheduleWxml, /scroll-top="\{\{feedbackSheetScrollTop\}\}"/, 'feedback sheet should reset its scroll position when opened from any entry');
assert.match(scheduleWxml, /今天练习了/, 'feedback sheet first field should use the requested label copy');
assert.match(scheduleWxml, /poster-sheet[\s\S]*生成反馈海报[\s\S]*posterStyles[\s\S]*feedbackPosterCanvas[\s\S]*手机端可直接长按海报保存[\s\S]*保存相册[\s\S]*分享海报/, 'poster sheet should render the real six-template canvas poster shell');
assert.match(scheduleWxml, /student-detail-sheet[\s\S]*学员详情[\s\S]*基础信息[\s\S]*教练视角摘要[\s\S]*学员备注[\s\S]*上课记录[\s\S]*关闭/, 'student detail sheet should render the SVG-mapped student profile sections');
assert.match(scheduleWxml, /shift-detail-sheet[\s\S]*班级详情[\s\S]*基础信息[\s\S]*班级概览[\s\S]*班级备注[\s\S]*最近一次排课[\s\S]*关闭/, 'shift detail sheet should render the mapped class profile sections');
assert.match(scheduleWxml, /wx:elif="\{\{!shiftsList\.length\}\}"[\s\S]*暂无班次/, 'shift page should render an empty state instead of mock cards when classes are empty');
assert.doesNotMatch(scheduleWxml, /编辑排课|取消排课|去排课|保存排课|确认取消/, 'coach mini program should not expose schedule create, edit, or cancel actions');

const scheduleJs = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.js');
assert.match(scheduleJs, /weekTodoGroups/, 'native workbench should prepare grouped weekly todo data');
assert.match(scheduleJs, /dashboardClasses,\s*weekTodoGroups/, 'native week render should expose both today cards and weekly todo groups');
assert.match(scheduleJs, /reminderItems/, 'native workbench should prepare compact reminder chips');
assert.match(scheduleJs, /coachGreeting/, 'mini program schedule page should prepare the greeting copy for the recreated dashboard header');
assert.match(scheduleJs, /coachDisplayName/, 'mini program schedule page should prepare the coach name for the recreated dashboard header');
assert.match(scheduleJs, /coachMenuId/, 'mini program schedule page should prepare the coach id for the settings action sheet');
assert.match(scheduleJs, /logout\(\)\s*\{[\s\S]*wx\.reLaunch\(\{ url: '\/pages\/index\/index' \}\)/, 'coach logout should clear storage and return to the login page');
assert.doesNotMatch(scheduleJs, /const studentsList = \[/, 'mini program students should not stay on hardcoded local list data');
assert.doesNotMatch(scheduleJs, /const shiftsList = \[/, 'mini program classes should not stay on hardcoded local list data');
assert.match(scheduleJs, /onShow\(\)\s*\{[\s\S]*this\.load\(/, 'mini program schedule page should refresh when returning to the page');
assert.match(scheduleJs, /onPullDownRefresh\(\)\s*\{[\s\S]*this\.load\(/, 'mini program schedule page should support pull-down refresh');
assert.match(scheduleJs, /saveCoachFeedback/, 'mini program schedule page should expose a real feedback save action');
assert.match(scheduleJs, /feedbackFormFromRecord/, 'feedback sheet should hydrate saved feedback into the form');
assert.match(scheduleJs, /feedbackCountsOf/, 'feedback sheet should maintain 0\/200 style counters');
assert.match(scheduleJs, /feedbackFocusedField/, 'feedback sheet should track the focused field for dynamic focus styling');
assert.match(scheduleJs, /feedbackContextParts/, 'feedback course meta should expose separate text parts for styled separators');
assert.match(scheduleJs, /openFeedbackById[\s\S]*selectedClassDetail:\s*buildDetailData/, 'workbench feedback button should reuse the same feedback sheet detail data as detail entry');
assert.match(scheduleJs, /feedbackSheetScrollTop/, 'feedback sheet should track a scroll-top value for entry reset');
assert.match(scheduleJs, /openFeedback\(\)[\s\S]*feedbackSheetScrollTop:\s*0/, 'detail-to-feedback entry should start the feedback sheet from the top');
assert.match(scheduleJs, /openFeedbackById\(event\)[\s\S]*feedbackSheetScrollTop:\s*0/, 'workbench feedback entry should start the feedback sheet from the top');
assert.match(scheduleJs, /timetableCourseTag[\s\S]*text:\s*'体验'[\s\S]*text:\s*'陪打'[\s\S]*text:\s*'私教'/, 'timetable course cards should use short course type labels');
assert.match(scheduleJs, /knowledgePoint,\s*nextTraining/, 'feedback save should include practice status and next practice fields');
assert.match(scheduleJs, /posterSheetClass/, 'poster sheet should use the same bottom-sheet show transition as other sheets');
assert.match(scheduleJs, /posterDateText/, 'poster sheet should prepare a readable class date for the preview');
assert.match(scheduleJs, /FEEDBACK_POSTER_TEMPLATES[\s\S]*blueGreenDiagonal[\s\S]*minimalDarkGreen[\s\S]*retroCourt[\s\S]*blueprintBlue[\s\S]*minimalRacket[\s\S]*activeGreen/, 'mini program poster should reuse the real six poster templates');
assert.match(scheduleJs, /drawFeedbackPoster/, 'mini program poster should draw the real poster templates on canvas');
assert.match(scheduleJs, /renderFeedbackPosterCanvas/, 'mini program poster should render the selected template instead of static fake data');
assert.match(scheduleJs, /buildStudentDetailData/, 'student detail sheet should prepare mapped student profile data');
assert.match(scheduleJs, /selectedStudentDetail/, 'student detail sheet should keep its selected student data separately');
assert.match(scheduleJs, /showStudentDetail/, 'student detail sheet should use its own visibility state');
assert.match(scheduleJs, /formatStudentClassTime[\s\S]*endText[\s\S]*`\$\{dateText\} \$\{startText\}-\$\{endText\}`/, 'student detail latest class should show the full start-end time range');
assert.match(scheduleJs, /timetableScrollTop/, 'mini program schedule page should compute a vertical scroll position for the timetable');
assert.match(scheduleJs, /timetableScrollLeft/, 'mini program schedule page should compute a horizontal scroll position for the timetable');
assert.match(scheduleJs, /currentTimeText/, 'mini program schedule page should compute the current-time marker text');
assert.match(scheduleJs, /todayLabel:\s*today \? today\.label\.replace\(\s*\/\\s\+\/,\s*' '\s*\)/, 'dashboard today date should keep exactly one space between weekday and date');
assert.match(scheduleJs, /Array\.from\(\{\s*length:\s*25\s*\}[\s\S]*String\(i\)\.padStart\(2,\s*'0'\)/, 'mini program timetable should expose a 00:00-24:00 time axis');
assert.match(scheduleJs, /TIMETABLE_START_HOUR\s*=\s*0/, 'mini program current-time marker should use a midnight-based timetable axis');
assert.match(scheduleJs, /timetableNowSolidLineStyle/, 'mini program current-time marker should expose a solid segment for today');
assert.match(scheduleJs, /lastScheduleId:\s*lastClass && lastClass\.id/, 'mini program students should still carry their latest class id for summaries');
assert.doesNotMatch(scheduleWxml, /进入完整教练端/, 'native schedule page should not expose the old webview fallback entry');
assert.doesNotMatch(scheduleJs, /openWebview\(\)/, 'native schedule page should not keep the old webview jump handler');
assert.match(scheduleJs, /openAgreement\(\)/, 'schedule page should expose the user agreement menu action');
assert.match(scheduleJs, /openPrivacy\(\)/, 'schedule page should expose the privacy policy menu action');
assert.match(scheduleJs, /coachWorkbenchStats/, 'mini program workbench should keep the backend stats payload separately');
assert.match(scheduleJs, /workbenchState/, 'mini program workbench should use the backend workbenchState enum');
assert.match(scheduleJs, /function buildLocalWorkbenchStats/, 'mini program workbench should have a local stats fallback from the loaded schedule rows');
assert.match(scheduleJs, /mergeWorkbenchStats\(coachWorkbenchStats,\s*buildLocalWorkbenchStats\(schedule,\s*this\.data\.feedbacks,\s*now\)\)/, 'mini program workbench should fall back to local schedule stats when backend stats are still zero');
assert.match(scheduleJs, /conversionText:\s*Number\(mergedStats\.monthTrialLessonCount\) > 0 \? String\(mergedStats\.trialConversionRate \|\| 0\) : '-'/, 'mini program workbench should show conversion percent only when trial conversion data exists');
assert.match(scheduleJs, /feedback:\s*mergedStats\.monthFeedbackCount \|\| 0/, 'mini program workbench should render backend or locally derived month feedback count');
assert.doesNotMatch(scheduleJs, /feedback:\s*'-'/, 'mini program workbench should not show a placeholder for month feedback count');
assert.doesNotMatch(scheduleJs, /item\.courseContent \|\| item\.productName \|\| item\.type/, 'shift cards should no longer guess course content from mixed front-end fields');
assert.doesNotMatch(scheduleJs, /item\.scheduleTime \|\| item\.classTime/, 'shift cards should no longer guess schedule time from mixed front-end fields');
assert.doesNotMatch(scheduleJs, /firstNonEmpty\(item\.remark,\s*item\.note,\s*item\.notes\)/, 'shift cards should no longer guess class remark from mixed front-end fields');

const scheduleUtils = require('../wechat-miniprogram/miniprogram/utils/schedule');
assert.strictEqual(
  scheduleUtils.classBlockStyle({ startTime: '2026-04-22 09:00', endTime: '2026-04-22 10:00' }).top,
  1350,
  'timetable course blocks should be positioned from 00:00'
);
const todoNow = new Date('2026-04-21T12:00:00+08:00');
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 15:00', endTime: '2026-04-21 16:00', status: '已排课' }, todoNow).label,
  '今日后续',
  'future later courses should use the standard later state'
);
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已排课' }, todoNow).label,
  '待反馈',
  'ended courses without feedback should become pending state'
);
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已排课', hasFeedback: true }, todoNow),
  null,
  'ended courses with feedback should not remain weekly todos'
);
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 15:00', endTime: '2026-04-21 16:00', status: '已取消' }, todoNow),
  null,
  'cancelled courses should not appear as weekly todos'
);

const detailWxml = readText('wechat-miniprogram/miniprogram/pages/detail/detail.wxml');
assert.match(detailWxml, /课程详情/, 'native detail page should render course detail content');
assert.match(detailWxml, /返回课表/, 'native detail page should let coaches return to schedule');
const detailJs = readText('wechat-miniprogram/miniprogram/pages/detail/detail.js');
assert.doesNotMatch(detailWxml, /完整工作台|进入完整教练端/, 'native detail page should not expose the old webview fallback entry');
assert.doesNotMatch(detailJs, /openWebview\(\)/, 'native detail page should not keep the old webview jump handler');

const apiJs = readText('public/assets/scripts/core/api.js');
assert.match(apiJs, /WECHAT_CODE_KEY/, 'web app should keep the mini program login code until account login succeeds');
assert.match(apiJs, /\/auth\/wechat-bind/, 'web app should call the wechat bind API after account login');
assert.match(apiJs, /PENDING_SCHEDULE_ID_KEY/, 'web app should keep notification scheduleId until data is loaded');

const stateJs = readText('public/assets/scripts/core/state.js');
assert.match(stateJs, /openPendingScheduleDeepLink/, 'page data load should try to open a pending notification schedule');

const configJs = readText('wechat-miniprogram/miniprogram/config.js');
assert.match(configJs, /API_BASE_URL:\s*'https:\/\/www\.flowtennis\.cn\/api'/, 'config should expose the API base URL for native pages');
assert.match(configJs, /SCHEDULE_TEMPLATE_ID:\s*'H_BIzR4Ca7aKldMWAlajgSwTWSos80lDZskEM4p8taI'/, 'config should include the selected schedule subscribe template ID');
assert.match(configJs, /COURSE_REMINDER_TEMPLATE_ID:\s*'ME_OpZIFDLRwN-ENibuFk4g4Dtdi8x43TAQR2nKkoUs'/, 'config should include the selected course reminder subscribe template ID');
assert.doesNotMatch(configJs, /WEB_VIEW_URL/, 'mini program config should no longer keep the removed webview URL');

const apiServerJs = readText('api/index.js');
assert.match(apiServerJs, /\/auth\/wechat-login/, 'API should support mini program login by bound openid');
assert.match(apiServerJs, /findWechatUserByOpenId/, 'API should find the bound coach account by openid');
assert.match(apiServerJs, /pages\/detail\/detail/, 'subscribe messages should deep link to native course detail');
assert.match(apiServerJs, /courseContent:/, 'workbench API should decorate class data with a courseContent field for the mini program');
assert.match(apiServerJs, /scheduleTime:/, 'workbench API should decorate class data with a scheduleTime field for the mini program');
assert.match(apiServerJs, /remark:/, 'workbench API should decorate class data with a remark field for the mini program');
assert.match(apiServerJs, /historyIssue:/, 'workbench API should decorate student data with a normalized historyIssue field');
assert.match(apiServerJs, /focusNote:/, 'workbench API should decorate student and feedback data with a normalized focusNote field');
assert.match(apiServerJs, /summary:/, 'workbench API should decorate feedback data with a normalized summary field');
assert.match(apiServerJs, /monthFinishedLessonUnits/, 'workbench API should expose standard stats fields');
assert.match(apiServerJs, /weekFinishedLessonUnits/, 'workbench API should expose standard stats fields');
assert.match(apiServerJs, /todayFinishedLessonUnits/, 'workbench API should expose standard stats fields');
assert.match(apiServerJs, /pendingFeedbackCount/, 'workbench API should expose standard stats fields');
assert.match(apiServerJs, /trialConversionRate/, 'workbench API should expose standard stats fields');
assert.match(apiServerJs, /workbenchState:/, 'workbench API should expose standard state enum for each schedule');

const miniApiJs = readText('wechat-miniprogram/miniprogram/utils/api.js');
assert.match(miniApiJs, /function saveCoachFeedback/, 'mini program API helper should provide feedback save');
assert.match(miniApiJs, /request\('\/feedbacks'/, 'mini program feedback save should call the feedback API');
assert.match(miniApiJs, /function loginWithPassword/, 'mini program API helper should provide account password login');
assert.match(miniApiJs, /function bindWechatAfterLogin/, 'mini program API helper should provide WeChat bind after login');
assert.match(miniApiJs, /\/auth\/login/, 'mini program API helper should call the account login API');
assert.match(miniApiJs, /\/auth\/wechat-bind/, 'mini program API helper should call the WeChat bind API');
assert.doesNotMatch(miniApiJs, /function saveCoachSchedule/, 'mini program API helper should not keep coach schedule write helper');
assert.doesNotMatch(miniApiJs, /request\('\/schedule'/, 'mini program API helper should not call schedule write APIs');
assert.doesNotMatch(miniApiJs, /request\(`\/schedule\//, 'mini program API helper should not call schedule update APIs');

const schedulePageJs = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.js');
assert.doesNotMatch(schedulePageJs, /王教练|待补充/, 'native schedule page should not show fake coach fallback values');
assert.match(schedulePageJs, /function assertCoachUser/, 'native schedule page should reject non-coach login payloads');
assert.match(schedulePageJs, /user\.role !== 'editor'/, 'native schedule page should only allow coach role payloads');
assert.match(schedulePageJs, /function ensureCoachSession/, 'native schedule page should prefer the password-login coach session before WeChat login');
assert.match(schedulePageJs, /wx\.getStorageSync\(TOKEN_KEY\)[\s\S]*wx\.getStorageSync\(USER_KEY\)[\s\S]*assertCoachUser\(storedUser\)/, 'native schedule page should not overwrite a valid coach token with WeChat login');
assert.match(schedulePageJs, /handleCoachAuthError/, 'native schedule page should return invalid-role users to login instead of trapping them on reload');
assert.match(schedulePageJs, /lessonUnitsCompleted/, 'native student cards should read backend lessonUnitsCompleted');
assert.match(schedulePageJs, /function scheduleLessonUnits/, 'native student cards should calculate lesson units only as a short fallback');
assert.match(schedulePageJs, /nextTravelReminder/, 'native workbench reminders should include a travel reminder flag');
assert.doesNotMatch(scheduleWxml, /发送给学员/, 'mini program poster action should not pretend it can target a specific student chat');
assert.match(scheduleWxml, /分享海报/, 'mini program poster action should use the real share poster wording');
assert.match(schedulePageJs, /showShareImageMenu/, 'mini program poster sharing should use WeChat image share capability');
assert.match(schedulePageJs, /function feedbackScopeForSchedule/, 'mini program feedback save should decide student vs class feedback scope');
assert.match(schedulePageJs, /feedbackScope:\s*feedbackScope/, 'mini program feedback save should send the feedback scope contract');
assert.match(schedulePageJs, /String\(item\.classId \|\| ''\)\.trim\(\) === String\(shift\.id \|\| ''\)\.trim\(\)/, 'shift detail should first link schedules by classId');
assert.match(schedulePageJs, /String\(item\.id \|\| ''\) === String\(selectedClass && selectedClass\.classId \|\| ''\)/, 'schedule detail should first link classes by classId');
assert.doesNotMatch(schedulePageJs, /className && className === shift\.name/, 'shift detail should not use class name guessing as the primary link');
assert.doesNotMatch(schedulePageJs, /classes\.find\(item => studentIdsOf\(item\)\.some\(id => studentIds\.includes\(id\)\)\)/, 'schedule detail should not link classes by studentIds intersection');
assert.doesNotMatch(schedulePageJs, /student && student\.studentRemark[\s\S]*student && student\.note[\s\S]*student && student\.notes/, 'mini program detail should not guess multiple student remark fields on the frontend');
assert.doesNotMatch(schedulePageJs, /student && student\.issueHistory[\s\S]*student && student\.issueNote[\s\S]*student && student\.healthNote/, 'mini program detail should not guess multiple history issue fields on the frontend');
assert.doesNotMatch(schedulePageJs, /item\.courseContent \|\| '课程内容待补充'/, 'mini program shift cards should trust the backend courseContent contract');
assert.doesNotMatch(schedulePageJs, /student\.phone,\s*student\.mobile,\s*student\.phoneNumber/, 'mini program student detail should trust the backend phone contract');
assert.doesNotMatch(schedulePageJs, /student\.studentType,\s*student\.type,\s*student\.category/, 'mini program student detail should trust the backend student type contract');
assert.doesNotMatch(schedulePageJs, /student\.campus,[\s\S]*student\.campusName,[\s\S]*student\.primaryCampus/, 'mini program student detail should trust the backend campus contract');

const agreementWxml = readText('wechat-miniprogram/miniprogram/pages/agreement/agreement.wxml');
assert.match(agreementWxml, /用户服务协议/, 'mini program should provide a native user agreement page');
assert.match(agreementWxml, /doc-meta/, 'agreement page should render the latest updated meta line');
assert.match(agreementWxml, /doc-section-head[\s\S]*doc-section-marker/, 'agreement page should render each section with the branded vertical marker');
const agreementWxss = readText('wechat-miniprogram/miniprogram/pages/agreement/agreement.wxss');
assert.match(agreementWxss, /\.doc-card\s*\{[\s\S]*margin:\s*16px 16px 24px;[\s\S]*padding:\s*24px 24px 36px;/i, 'agreement page should keep larger outer spacing and bottom breathing room');
assert.match(agreementWxss, /\.doc-section-marker\s*\{[\s\S]*width:\s*4px;[\s\S]*height:\s*14px;/i, 'agreement page should use the requested 4x14 section marker');

const privacyWxml = readText('wechat-miniprogram/miniprogram/pages/privacy/privacy.wxml');
assert.match(privacyWxml, /隐私政策/, 'mini program should provide a native privacy policy page');
assert.match(privacyWxml, /doc-meta/, 'privacy page should render the latest updated meta line');
assert.match(privacyWxml, /doc-link-card[\s\S]*doc-link-icon[\s\S]*查看微信隐私保护指引[\s\S]*doc-link-chevron/, 'privacy page should render the WeChat privacy link as a light card action instead of a primary button');
const privacyWxss = readText('wechat-miniprogram/miniprogram/pages/privacy/privacy.wxss');
assert.match(privacyWxss, /\.doc-link-icon\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;[\s\S]*%2307C160/i, 'privacy page should render the WeChat icon with the requested 20px green SVG');
assert.match(privacyWxss, /\.doc-link-card\s*\{[\s\S]*width:\s*313px;[\s\S]*height:\s*56px;[\s\S]*border:\s*1px solid #e2e8f0;/i, 'privacy page should size the WeChat link card to the requested 313x56 spec');
assert.match(privacyWxss, /\.doc-link-chevron\s*\{[\s\S]*width:\s*6px;[\s\S]*height:\s*12px;/i, 'privacy page should use the slimmer 6x12 chevron icon');
assert.match(privacyWxss, /\.doc-title\s*\{[\s\S]*font-size:\s*22px;[\s\S]*color:\s*#0f172a;/i, 'privacy page title should use the requested 22px dark token');
assert.match(privacyWxss, /\.doc-section-title\s*\{[\s\S]*font-size:\s*15px;[\s\S]*font-weight:\s*700;/i, 'privacy page section titles should use the requested 15px bold token');
assert.match(privacyWxss, /\.doc-paragraph\s*\{[\s\S]*color:\s*#475569;/i, 'privacy page body copy should use the requested slate body color');
assert.match(privacyWxss, /\.doc-paragraph\s*\{[\s\S]*font-size:\s*13px;/i, 'privacy page body copy should use the requested 13px regular size');

const appJs = readText('wechat-miniprogram/miniprogram/app.js');
assert.match(appJs, /onNeedPrivacyAuthorization/, 'mini program app should implement the WeChat privacy authorization hook');
assert.match(appJs, /openPrivacyContract/, 'mini program app should provide a helper to open the WeChat privacy contract');

const scheduleWxss = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.wxss');
assert.match(scheduleWxss, /\.coach-menu-icon-agreement\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/i, 'settings action sheet should use the 20px agreement icon slot');
assert.match(scheduleWxss, /\.coach-menu-icon-privacy\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/i, 'settings action sheet should use the 20px privacy icon slot');
assert.match(scheduleWxss, /\.coach-menu-avatar\s*\{[\s\S]*width:\s*52px;[\s\S]*height:\s*52px;/, 'settings action sheet should use the larger avatar size from the refined spec');
assert.match(scheduleWxss, /\.coach-menu-sheet\s*\{[\s\S]*padding:\s*0 16px calc\(36px \+ env\(safe-area-inset-bottom\)\);/i, 'settings action sheet should keep extra bottom safe-area spacing');
assert.match(scheduleWxss, /\.student-detail-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 180rpx\);/i, 'student detail sheet should sit below the top-right capsule area');
assert.match(scheduleWxss, /\.custom-nav-title\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*74px;[\s\S]*left:\s*16px;[\s\S]*font-size:\s*17px;/i, 'tab top titles should be absolutely positioned in the top-left operation bar area with 17px type');
assert.match(scheduleWxss, /\.dashboard-top\s*\{[\s\S]*background:\s*linear-gradient\(135deg,\s*#2b3a55 0%,\s*#1e2a38 100%\)/i, 'mini program workbench should use the SVG dark header gradient');
assert.match(scheduleWxss, /\.dashboard-top\s*\{[\s\S]*height:\s*230px;/, 'dashboard header should use the requested 230px height');
assert.match(scheduleWxss, /\.dashboard-hero\s*\{[\s\S]*padding:\s*122px 32rpx 0;/, 'dashboard coach header should stop with the avatar bottom 20px above the metric card');
assert.match(scheduleWxss, /\.coach-title\s*\{[\s\S]*font-size:\s*20px;[\s\S]*font-weight:\s*700;/, 'dashboard coach title should use the requested 20px bold token');
assert.match(scheduleWxss, /\.coach-subtitle\s*\{[\s\S]*color:\s*#ffffff;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*400;/i, 'dashboard coach subtitle should use the requested white 13px regular token');
assert.match(scheduleWxss, /\.coach-avatar\s*\{[\s\S]*width:\s*48px;[\s\S]*height:\s*48px;[\s\S]*border:\s*2px solid rgba\(255,\s*255,\s*255,\s*0\.2\);[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*700;/i, 'dashboard coach avatar should match the requested 48px token');
assert.match(scheduleWxss, /\.coach-arrow\s*\{[\s\S]*width:\s*8px;[\s\S]*height:\s*4px;[\s\S]*background-image:\s*url\("data:image\/svg\+xml/, 'dashboard coach dropdown icon should use the provided SVG without distortion');
assert.match(scheduleWxss, /\.dashboard-shell\s*\{[\s\S]*margin-top:\s*-40px;/, 'dashboard metric card should overlap the header by 40px');
assert.match(scheduleWxss, /\.mini-metrics\s*\{[\s\S]*height:\s*170px;[\s\S]*padding:\s*16px;[\s\S]*gap:\s*6px;/, 'dashboard metric shell should match the requested 361x170 token with 16px padding and 6px gap');
assert.match(scheduleWxss, /\.mini-metric\s*\{[\s\S]*height:\s*66px;[\s\S]*padding:\s*16px;/, 'dashboard metric cells should match the requested 104x66 token');
assert.match(scheduleWxss, /\.mini-metric text\s*\{[\s\S]*transform:\s*translateY\(-6px\);/, 'dashboard metric label and number should move upward by 6px');
assert.match(scheduleWxss, /\.mini-metric text\.danger\s*\{[\s\S]*color:\s*#D97706;/, 'dashboard pending feedback metric should use the requested warning color');
assert.match(scheduleWxss, /\.conversion-value\s*\{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*400;[\s\S]*color:\s*#64748B;/, 'empty conversion value should use the requested muted regular style');
assert.match(scheduleWxss, /\.conversion-value\.has-data\s*\{[\s\S]*color:\s*#0f172a;[\s\S]*font-size:\s*24px;[\s\S]*font-weight:\s*700;/, 'conversion number should keep the normal metric number style when data exists');
assert.match(scheduleWxss, /\.conversion-unit\s*\{[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*400;[\s\S]*color:\s*#64748B;/, 'conversion percent unit should use requested 13px muted regular style');
assert.match(scheduleWxss, /\.reminder-bar\s*\{[\s\S]*height:\s*38px;[\s\S]*margin-top:\s*12px;[\s\S]*border:\s*0\.8px solid #e2e8f0;/i, 'dashboard reminder bar should match the requested size and border token');
assert.match(scheduleWxss, /\.reminder-bar\s*\{[\s\S]*align-items:\s*center;[\s\S]*line-height:\s*1;/i, 'dashboard reminder bar content should be vertically centered');
assert.match(scheduleWxss, /\.reminder-bar \.summary-icon\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;[\s\S]*background-image:[\s\S]*circle cx='8' cy='8' r='6\.5'/, 'dashboard reminder icon should reuse the shifts reminder icon');
assert.match(scheduleWxss, /\.reminder-list\s*\{[\s\S]*align-items:\s*center;/, 'dashboard reminder text should align with the icon vertically');
assert.match(scheduleWxss, /\.today-lesson-card\s*\{[\s\S]*height:\s*84px;/, 'dashboard today course card should match the requested 84px height');
assert.match(scheduleWxss, /\.today-lesson-clock\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*40px;[\s\S]*background:\s*#f1f5f9;/i, 'dashboard today course clock background should be 40x40 slate-100');
assert.match(scheduleWxss, /\.icon-clock\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;[\s\S]*background-image:\s*url\("data:image\/svg\+xml/, 'dashboard today course clock icon should use the provided SVG at 16x16');
assert.match(scheduleWxss, /\.week-task-card\s*\{[\s\S]*width:\s*361px;[\s\S]*height:\s*130px;/, 'dashboard week todo card should match the requested 361x130 size');
assert.match(scheduleWxss, /\.week-task-accent\s*\{[\s\S]*width:\s*4px;[\s\S]*height:\s*38px;[\s\S]*background:\s*#94a3b8;[\s\S]*transform:\s*translateY\(-20px\);/i, 'dashboard week todo card should use the requested left gray bar');
assert.doesNotMatch(scheduleWxss.match(/\.week-task-accent\s*\{[^}]*\}/)[0], /margin-left:/, 'dashboard week todo gray bar should sit flush against the card edge');
assert.match(scheduleWxss, /\.week-task-date\s*\{[\s\S]*transform:\s*translateY\(6px\);/, 'dashboard week todo date should align with the status tag');
assert.match(scheduleWxss, /\.week-task-status\s*\{[\s\S]*transform:\s*translateY\(10px\);/, 'dashboard week todo status should use the requested vertical offset');
assert.match(scheduleWxss, /\.week-task-time-row\s*\{[\s\S]*transform:\s*translateY\(-2px\);/, 'dashboard week todo time row should use the requested vertical offset');
assert.match(scheduleWxss, /\.week-task-location\s*\{[\s\S]*transform:\s*translateY\(-7px\);/, 'dashboard week todo meta row should use the requested vertical offset');
assert.match(scheduleWxss, /\.week-task-divider\s*\{[\s\S]*width:\s*325px;[\s\S]*height:\s*1px;[\s\S]*margin-top:\s*8px;[\s\S]*transform:\s*translateY\(-6px\);/, 'dashboard week todo divider should match requested size and spacing');
assert.match(scheduleWxss, /\.week-task-actions\s*\{[\s\S]*transform:\s*translateY\(-8px\);/, 'dashboard week todo actions should use the requested vertical offset');
assert.match(scheduleWxss, /\.week-task-outline\s*\{[\s\S]*width:\s*70px;[\s\S]*height:\s*28px;[\s\S]*border:\s*1px solid #e2e8f0;/i, 'dashboard week todo outline button should match requested token');
assert.match(scheduleWxss, /\.week-task-status\s*\{[\s\S]*width:\s*48px;[\s\S]*height:\s*24px;[\s\S]*background:\s*#fef3c7;/i, 'dashboard pending feedback tag should match requested token');
assert.match(scheduleWxss, /\.today-course-pill\s*\{[\s\S]*width:\s*44px;[\s\S]*height:\s*18px;[\s\S]*border-radius:\s*4px;/, 'dashboard course type tags should use the requested 44x18 4px-radius token');
assert.match(scheduleWxss, /\.dashboard-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'mini program workbench should use a fixed three-column grid like the SVG');
assert.match(scheduleWxss, /\.today-lesson-card\s*\{[\s\S]*border-radius:\s*34rpx;/, 'mini program today lesson card should use the larger rounded card style');
assert.match(scheduleWxss, /\.tabbar\s*\{[\s\S]*background:\s*#fff;/, 'mini program tabbar should stay white like the SVG bottom bar');
assert.match(scheduleWxss, /\.tabbar\s*\{[\s\S]*height:\s*166rpx;/, 'mini program tabbar should lock to the 83px SVG height');
assert.match(scheduleWxss, /\.tab-icon\s*\{[\s\S]*width:\s*24px;[\s\S]*height:\s*24px;/, 'mini program tab icons should lock to 24x24');
assert.match(scheduleWxss, /\.tab-workdesk-icon\.active\s*\{[\s\S]*fill='%232B3A55'/, 'active workdesk tab should use the provided filled SVG path');
assert.match(scheduleWxss, /\.tab-workdesk-icon:not\(\.active\)\s*\{[\s\S]*stroke='%2394A3B8'[\s\S]*stroke-width='2'/, 'inactive workdesk tab should use the provided outline SVG path');
assert.match(scheduleWxss, /\.tab-schedule-icon\.active\s*\{[\s\S]*rect x='4' y='5' width='16' height='15' rx='2' fill='%232B3A55'[\s\S]*stroke='%23FFFFFF' stroke-width='2'/, 'active schedule tab should use the latest calendar SVG with white negative-space divider');
assert.match(scheduleWxss, /\.tab-schedule-icon:not\(\.active\)\s*\{[\s\S]*rect x='4' y='5' width='16' height='15' rx='2' stroke='%2394A3B8' stroke-width='2'[\s\S]*M8 3v4M16 3v4M4 11h16[\s\S]*stroke='%2394A3B8' stroke-width='2'/, 'inactive schedule tab should use the latest outline calendar SVG');
assert.match(scheduleWxss, /\.tab-classes-icon\.active\s*\{[\s\S]*fill='%23FFFFFF'/, 'active classes tab should preserve the white negative-space SVG detail');
assert.match(scheduleWxss, /\.timetable-top\s*\{[\s\S]*height:\s*210px;[\s\S]*padding:\s*115px 16px 0;[\s\S]*background:\s*linear-gradient\(135deg,\s*#2b3a55 0%,\s*#1e2a38 100%\)/i, 'timetable top should match the requested dark header shell');
assert.match(scheduleWxss, /\.week-switch\s*\{[\s\S]*width:\s*160px;[\s\S]*height:\s*36px;[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.1\);[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.15\);/i, 'timetable week switch should match the SVG 160x36 translucent pill');
assert.match(scheduleWxss, /\.week-switch\s*\{[^}]*gap:\s*20px;/, 'timetable week switch should keep 20px spacing around the date text');
assert.match(scheduleWxss, /\.switch-btn::before\s*\{[\s\S]*width:\s*8px;[\s\S]*height:\s*10px;[\s\S]*background-image:\s*url\("data:image\/svg\+xml/, 'timetable switch arrows should use the provided SVG chevron shape without distortion');
assert.match(scheduleWxss, /\.week-range\s*\{[\s\S]*font-size:\s*15px;[\s\S]*font-weight:\s*500;/, 'timetable week range text should use 15px medium');
assert.match(scheduleWxss, /\.back-week-btn\s*\{[\s\S]*width:\s*80px;[\s\S]*height:\s*36px;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*500;/, 'timetable back-to-week button should match the SVG token');
assert.match(scheduleWxss, /\.timetable-scroll\s*\{[\s\S]*margin-top:\s*-45px;[\s\S]*border-top-left-radius:\s*40rpx;[\s\S]*border-top-right-radius:\s*40rpx;/, 'timetable grid should sit in the SVG rounded white panel with 45px overlap');
assert.match(scheduleWxss, /\.timetable-top\s*\{[\s\S]*height:\s*210px;/i, 'timetable top blue panel should use the unified 210px height');
assert.match(scheduleWxss, /\.students-top\s*\{[\s\S]*height:\s*210px;/i, 'students top blue panel should use the unified 210px height');
assert.match(scheduleWxss, /\.shifts-top\s*\{[\s\S]*height:\s*210px;/i, 'shifts top blue panel should use the unified 210px height');
assert.match(scheduleWxss, /\.students-summary\s*\{[\s\S]*width:\s*361px;[\s\S]*height:\s*90px;/i, 'students summary card should keep the 361x90 token');
assert.match(scheduleWxss, /\.shift-summary-card\s*\{[\s\S]*height:\s*90px;/i, 'shifts summary card should keep the 90px height token');
assert.match(scheduleWxss, /\.custom-nav-title\s*\{[\s\S]*font-size:\s*20px;[\s\S]*line-height:\s*26px;/i, 'top tab titles should use the requested 20px typography');
assert.match(scheduleWxss, /\.loading-shell-top\s*\{[\s\S]*height:\s*210px;[\s\S]*background:\s*linear-gradient\(135deg,\s*#2b3a55 0%,\s*#1e2a38 100%\)/i, 'loading shell should keep the same dark header height and gradient');
assert.match(scheduleWxss, /\.loading-shell-summary\s*\{[\s\S]*width:\s*361px;[\s\S]*height:\s*90px;[\s\S]*margin:\s*-45px auto 0;/i, 'loading shell summary card should overlap the header by 45px with the same 361x90 footprint');
assert.match(scheduleWxss, /\.loading-shell-pulse\s*\{[\s\S]*animation:\s*loadingPulse 1\.4s ease-in-out infinite;/i, 'loading shell placeholders should use the pulse animation');
assert.match(scheduleWxss, /@keyframes loadingPulse[\s\S]*0%[\s\S]*opacity:\s*0\.45[\s\S]*50%[\s\S]*opacity:\s*1[\s\S]*100%[\s\S]*opacity:\s*0\.45/i, 'loading shell should define the pulse keyframes');
assert.match(scheduleWxss, /\.tt-header\s*\{[\s\S]*position:\s*sticky;/, 'timetable header should stay fixed during vertical scrolling');
assert.match(scheduleWxss, /\.tt-time-axis\s*\{[\s\S]*position:\s*sticky;[\s\S]*left:\s*0;/, 'timetable time axis should stay fixed during horizontal scrolling');
assert.match(scheduleWxss, /\.tt-header\s*\{[\s\S]*z-index:\s*60;/, 'timetable weekday header should stay above the scrolling time axis');
assert.match(scheduleWxss, /\.tt-time-axis\s*\{[\s\S]*z-index:\s*30;/, 'timetable time axis should scroll underneath the weekday header');
assert.match(scheduleWxss, /\.tt-time-corner\s*\{[\s\S]*z-index:\s*70;/, 'timetable top-left corner should stay above both header and time axis');
assert.match(scheduleWxss, /\.tt-header\s*\{[\s\S]*height:\s*60px;[\s\S]*border-bottom:\s*1px solid #eef2f7;/, 'timetable weekday header should keep the bottom divider line');
assert.doesNotMatch(scheduleWxss.match(/\.tt-time-corner\s*\{[^}]*\}/)[0], /border-right:/, 'timetable top-left header corner should not draw the time-axis divider');
assert.match(scheduleWxss, /\.tt-day-head,\s*\.tt-day-column\s*\{[\s\S]*width:\s*228rpx;/, 'timetable day columns should use the requested 114px visual width');
assert.doesNotMatch(scheduleWxss.match(/\.tt-day-head,\s*\.tt-day-column\s*\{[^}]*\}/)[0], /border-right:/, 'timetable weekday header should not show vertical divider lines');
assert.match(scheduleWxss, /\.tt-day-column\s*\{[\s\S]*border-right:\s*1px solid #eef2f7;/, 'timetable schedule area should keep vertical divider lines');
assert.match(scheduleWxss, /\.tt-grid-hour\s*\{[\s\S]*border-bottom:\s*1px solid #f1f5f9;/, 'timetable schedule area should keep horizontal divider lines');
assert.match(scheduleWxss, /\.tt-hour-cell text\s*\{[\s\S]*color:\s*#94a3b8;[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*400;/i, 'timetable time axis should use the requested 11px regular token');
assert.match(scheduleWxss, /\.tt-day-name\s*\{[\s\S]*color:\s*#64748b;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*400;/i, 'timetable weekday names should use the SVG header typography');
assert.match(scheduleWxss, /\.tt-day-date\s*\{[\s\S]*margin-top:\s*4px;[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*400;/, 'timetable day dates should use 11px regular with compact day/date spacing');
assert.match(scheduleWxss, /\.tt-day-date-dot\s*\{[\s\S]*width:\s*22px;[\s\S]*height:\s*22px;[\s\S]*background:\s*#2b3a55;[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*700;/, 'active timetable day should use the SVG dark 22px circular date marker');
assert.match(scheduleWxml, /tt-day-date[\s\S]*item\.displayDate/, 'active timetable date should render the mapped display date without the trailing day suffix');
assert.match(scheduleJs, /displayDate:\s*item\.isToday[\s\S]*replace\('日', ''\)/, 'timetable day data should strip the active date suffix');
assert.doesNotMatch(scheduleJs, /saveCoachSchedule|openShiftScheduler|saveShiftSchedule|openEditSchedule|openCancelSchedule|saveScheduleCancellation/, 'coach mini program should not keep schedule create, edit, or cancel handlers');
assert.doesNotMatch(scheduleJs, /onTimetableScrollX/, 'timetable should avoid JS scroll syncing that causes horizontal lag');
assert.match(scheduleJs, /activeTab === 'timetable'[\s\S]*this\.renderWeek\(\)/, 'timetable tab should refresh current-time positioning when opened');
assert.match(scheduleWxss, /\.tt-time-axis::after\s*\{[\s\S]*top:\s*0;[\s\S]*background:\s*#eef2f7;/, 'timetable time axis divider should start at the 00:00 row');
assert.match(scheduleWxss, /\.tt-now-line\s*\{[\s\S]*height:\s*1\.5px;[\s\S]*background:\s*rgba\(239,\s*68,\s*68,\s*0\.18\);/i, 'timetable should dim the current-time line outside today');
assert.match(scheduleWxss, /\.tt-now-line-solid\s*\{[\s\S]*height:\s*1\.5px;[\s\S]*background:\s*#ef4444;/i, 'timetable should keep a solid current-time line within today');
assert.match(scheduleWxss, /\.tt-now-label\s*\{[\s\S]*transform:\s*translateY\(-9px\);/, 'timetable current-time label should align vertically with the red line');
assert.match(scheduleWxss, /\.tt-now-label text\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*18px;[\s\S]*background:\s*#ef4444;[\s\S]*font-size:\s*10px;[\s\S]*font-weight:\s*700;/i, 'timetable current-time marker should show the fixed 40x18 left time pill');
assert.match(scheduleWxss, /\.tt-now-line-solid::after\s*\{[\s\S]*width:\s*9px;[\s\S]*height:\s*9px;[\s\S]*box-shadow:\s*0 0 0 4\.5px rgba\(239,\s*68,\s*68,\s*0\.2\);/i, 'timetable current-time dot should use the requested solid dot and soft ring style');
assert.match(scheduleWxss, /\.tt-course::before\s*\{[\s\S]*width:\s*8rpx;[\s\S]*background:\s*var\(--course-accent\);/, 'timetable course cards should use the SVG left accent bar');
assert.match(scheduleWxss, /\.tt-course-time\s*\{[\s\S]*font-size:\s*9px;[\s\S]*font-weight:\s*700;/, 'timetable course time should use 9px bold typography');
assert.match(scheduleWxss, /\.tt-course-type\s*\{[\s\S]*font-size:\s*9px;[\s\S]*font-weight:\s*400;/, 'timetable course type should use 9px regular typography');
assert.match(scheduleWxss, /\.tt-course-name\s*\{[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*700;/, 'timetable course student name should use 14px bold typography');
assert.match(scheduleWxss, /\.tt-course-status\s*\{[\s\S]*width:\s*36px;[\s\S]*height:\s*14px;[\s\S]*border-radius:\s*3px;[\s\S]*font-size:\s*9px;[\s\S]*font-weight:\s*400;/, 'timetable pending badge should use the requested 36x14 token');
assert.match(scheduleWxss, /\.tt-course-meta\s*\{[\s\S]*font-size:\s*10px;[\s\S]*font-weight:\s*400;/, 'timetable course location should use 10px regular typography');
assert.match(scheduleWxss, /\.detail-sheet-body\s*\{[\s\S]*background:\s*#f8fafc;/, 'detail sheet body should use slate-50 background');
assert.match(scheduleWxml, /enhanced show-scrollbar="\{\{false\}\}"/, 'detail sheet scroll view should hide the native right scrollbar');
assert.match(scheduleWxss, /\.detail-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 416rpx\);/, 'detail sheet should move 60px lower');
assert.match(scheduleWxss, /\.feedback-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 352rpx\);/, 'feedback sheet should move 60px lower');
assert.match(scheduleWxss, /\.detail-section-card\s*\{[\s\S]*padding:\s*40rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*box-shadow:\s*0 2rpx 4rpx rgba\(15,\s*23,\s*42,\s*0\.06\);/, 'detail cards should match the white rounded p-5 shadow-sm token');
assert.match(scheduleWxss, /\.detail-section-title\s*\{[\s\S]*font-size:\s*15px;[\s\S]*font-weight:\s*700;/, 'detail section title should use 15px bold slate typography');
assert.match(scheduleWxss, /\.detail-info-label\s*\{[\s\S]*flex:\s*0 0 144rpx;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*400;/, 'detail labels should use fixed 72px width and 13px regular typography');
assert.match(scheduleWxss, /\.detail-info-value\.is-strong\s*\{[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*600;/, 'detail values should use 14px semibold typography');
assert.match(scheduleWxss, /\.detail-inline-tag\s*\{[\s\S]*padding:\s*4rpx 16rpx;[\s\S]*border-radius:\s*8rpx;[\s\S]*font-size:\s*10px;/, 'detail tags should use compact badge tokens');
assert.match(scheduleWxss, /\.detail-info-row\.is-split \.detail-info-cell\s*\{[\s\S]*align-items:\s*center;/, 'detail split tag rows should vertically center labels and badges');
assert.match(scheduleWxss, /\.detail-inline-tag\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/, 'detail inline tags should center text inside the badge');
assert.match(scheduleWxss, /\.detail-section-card\.is-empty-state \.detail-note-block\s*\{[\s\S]*display:\s*flex;/, 'empty detail note sections should use compact inline rows');
assert.match(scheduleWxss, /\.detail-section-card\.is-empty-state \.detail-note-grid\s*\{[\s\S]*display:\s*flex;/, 'empty pre-class history and focus fields should stay on one row');
assert.match(scheduleWxss, /\.detail-section-card\.is-empty-state \.detail-note-col\s*\{[\s\S]*display:\s*flex;/, 'empty pre-class note fields should keep label and value inline');
assert.match(scheduleWxss, /\.detail-section-card\.is-filled \.detail-note-grid\s*\{[\s\S]*display:\s*block;/, 'filled detail note sections should stack long text fields vertically');
assert.match(scheduleWxss, /\.detail-feedback-cell\s*\{[\s\S]*display:\s*flex;/, 'feedback lesson counts should keep label and value on one line');
assert.match(scheduleWxss, /\.detail-feedback-card\.is-empty-state \.detail-note-block\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*baseline;/, 'empty feedback fields should align label and value on one baseline');
assert.match(scheduleJs, /feedbackSummary\.text = '待填写反馈'/, 'empty feedback summary copy should be pending feedback');
assert.match(scheduleWxss, /\.detail-sheet-title\s*\{[\s\S]*line-height:\s*48rpx;/, 'detail title should have enough vertical height');
assert.match(scheduleWxss, /\.detail-sheet-actions\s*\{[\s\S]*padding:\s*24rpx 32rpx 64rpx;[\s\S]*border-top:\s*1px solid #f1f5f9;/, 'detail action bar should match sticky bottom action tokens');
assert.match(scheduleWxss, /\.detail-sheet\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*120;/, 'detail sheet should float above the timetable header instead of being clipped inside the grid');
assert.match(scheduleWxss, /\.mask\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*100;/, 'detail overlay mask should cover the whole page above the timetable content');
assert.match(scheduleWxss, /\.feedback-course-card\s*\{[\s\S]*background:\s*#f8fafc;[\s\S]*border:\s*1px solid #f1f5f9;/, 'feedback course summary should match the slate-50 card token');
assert.match(scheduleWxss, /\.feedback-course-time\s*\{[\s\S]*font-size:\s*14px;[\s\S]*color:\s*#0f172a;[\s\S]*font-weight:\s*700;/, 'feedback course time should use the requested 14px bold slate token');
assert.match(scheduleWxss, /\.feedback-course-separator\s*\{[\s\S]*color:\s*#cbd5e1;[\s\S]*font-size:\s*12px;/, 'feedback course separators should use the requested muted token');
assert.match(scheduleWxss, /\.feedback-divider view\s*\{[\s\S]*background:\s*#f1f5f9;/, 'feedback divider line should use slate-100');
assert.match(scheduleWxss, /\.feedback-field-label\s*\{[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*700;/, 'feedback field labels should use 14px bold typography');
assert.match(scheduleWxss, /\.feedback-field-label\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*baseline;/, 'feedback labels and optional text should align on one baseline');
assert.match(scheduleWxss, /\.feedback-input-wrap\.is-active\s*\{[\s\S]*border:\s*2rpx solid #3b5bff;/, 'focused feedback input should show the active blue border');
assert.doesNotMatch(scheduleWxss, /\.feedback-input-bar\s*\{/, 'feedback sheet should not use a decorative fake cursor bar');
assert.match(scheduleWxss, /\.feedback-input\s*\{[\s\S]*color:\s*#334155;[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*400;/, 'feedback input text should use the requested 14px regular slate token');
assert.match(scheduleWxss, /\.feedback-input-placeholder\s*\{[\s\S]*color:\s*#94a3b8;[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*400;/, 'feedback placeholder text should use the requested 14px regular muted token');
assert.match(scheduleWxss, /\.feedback-action-btn\s*\{[\s\S]*height:\s*88rpx;[\s\S]*border-radius:\s*44rpx;[\s\S]*font-size:\s*15px;/, 'feedback bottom buttons should use the 44px pill token');
assert.match(scheduleWxss, /\.poster-style-chip\s*\{[\s\S]*height:\s*64rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*font-size:\s*13px;/, 'poster style chips should match the 32px capsule token');
assert.match(scheduleWxss, /\.feedback-poster-canvas\s*\{[\s\S]*width:\s*560rpx;[\s\S]*height:\s*996rpx;[\s\S]*border-radius:\s*32rpx;/, 'poster canvas should keep the mapped preview container');
assert.match(scheduleWxss, /\.poster-action-btn\s*\{[\s\S]*height:\s*88rpx;[\s\S]*border-radius:\s*44rpx;[\s\S]*font-size:\s*15px;/, 'poster bottom buttons should use the 44px pill token');
assert.match(scheduleWxss, /\.student-detail-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 180rpx\);[\s\S]*background:\s*#f4f6f9;/, 'student detail sheet should match the lowered modal top offset and background');
assert.match(scheduleWxss, /\.schedule-create-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 180rpx\);/, 'native shift scheduling sheet should sit below the mini program top-right capsule');
assert.match(scheduleWxss, /\.cancel-schedule-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 320rpx\);/, 'native cancel schedule sheet should use a shorter lower sheet');
assert.match(scheduleWxss, /\.shift-empty\s*\{[\s\S]*height:\s*160px;[\s\S]*border-radius:\s*16px;/, 'shift empty state should use the new native empty panel instead of mock cards');
assert.match(scheduleWxss, /\.student-detail-card\s*\{[\s\S]*padding:\s*40rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*background:\s*#fff;/, 'student detail cards should match the white rounded mapped sections');
assert.match(scheduleWxss, /\.student-detail-btn\s*\{[\s\S]*height:\s*96rpx;[\s\S]*border-radius:\s*48rpx;[\s\S]*background:\s*#f8fafc;/, 'student detail close button should match the bottom pill token');
assert.match(scheduleWxss, /\.coach-title-row\s*\{[\s\S]*align-items:\s*center;/, 'mini program coach name row should vertically center the dropdown arrow');
assert.doesNotMatch(scheduleWxss, /\.dashboard-topbar\s*\{/, 'mini program workbench should not keep the removed custom top bar styles');
assert.doesNotMatch(scheduleWxss, /\.coach-status-pill\s*\{/, 'mini program workbench should not keep the removed connection pill styles');
assert.match(scheduleWxss, /\.sheet\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/, 'mini program bottom sheets should use a flex column layout so the body can scroll');
assert.doesNotMatch(scheduleWxss, /\.sheet-actions\s*\{[\s\S]*position:\s*absolute;/, 'mini program bottom sheet footer should not pin absolutely over scrollable content');

console.log('miniprogram shell tests passed');
