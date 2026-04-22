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
assert.deepStrictEqual(appConfig.pages, ['pages/index/index', 'pages/schedule/schedule', 'pages/detail/detail', 'pages/webview/webview'], 'mini program should keep entry, native schedule/detail pages, and the web-view fallback');
assert.strictEqual(appConfig.sitemapLocation, 'sitemap.json', 'mini program should include sitemap config');
assert.strictEqual(appConfig.lazyCodeLoading, 'requiredComponents', 'mini program should enable component lazy injection');

const indexWxml = readText('wechat-miniprogram/miniprogram/pages/index/index.wxml');
assert.match(indexWxml, /接收排课通知并进入教练端/, 'index page should ask the coach to subscribe before entering');
assert.doesNotMatch(indexWxml, /<web-view/, 'index page should stay native so subscribe permission can be requested by tap');

const indexJs = readText('wechat-miniprogram/miniprogram/pages/index/index.js');
assert.match(indexJs, /SCHEDULE_TEMPLATE_ID/, 'index page should read the schedule subscribe template ID from config');
assert.match(indexJs, /COURSE_REMINDER_TEMPLATE_ID/, 'index page should read the course reminder subscribe template ID from config');
assert.match(indexJs, /wx\.requestSubscribeMessage/, 'index page should request schedule subscribe permission from a tap');
assert.match(indexJs, /tmplIds:\s*\[SCHEDULE_TEMPLATE_ID,\s*COURSE_REMINDER_TEMPLATE_ID\]/, 'index page should request both schedule and course reminder templates');
assert.match(indexJs, /pages\/schedule\/schedule/, 'index page should navigate into the native schedule page after the tap');

const scheduleWxml = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.wxml');
assert.match(scheduleWxml, /本周|下周/, 'native schedule page should provide week navigation');
assert.match(scheduleWxml, /bindtap="openDetail"/, 'native schedule cards should open native detail');
assert.match(scheduleWxml, /student-card"[^>]*data-id="\{\{item\.id\}\}"[^>]*bindtap="openStudentDetail"/, 'native student cards should open the mapped student detail sheet');
assert.match(scheduleWxml, /今日排课/, 'native workbench should keep the today schedule section');
assert.match(scheduleWxml, /本周待办/, 'native workbench should also show a weekly todo section');
assert.match(scheduleWxml, /今日课程[\s\S]*本周课时[\s\S]*本月课时[\s\S]*本月反馈[\s\S]*未反馈[\s\S]*体验转化/, 'native workbench should keep the six original web metrics in the requested order');
assert.match(scheduleWxml, /dashboard-hero/, 'native workbench should render the recreated SVG hero header');
assert.match(scheduleWxml, /dashboard-grid/, 'native workbench should render the two-row three-column metric grid');
assert.match(scheduleWxml, /today-lesson-card/, 'native workbench should render the larger today lesson card style');
assert.match(scheduleWxml, /week-task-card/, 'native workbench should render the weekly task card style');
assert.match(scheduleWxml, /coachGreeting/, 'native workbench should bind the greeting line dynamically');
assert.match(scheduleWxml, /coachDisplayName/, 'native workbench should bind the coach name dynamically');
assert.match(scheduleWxml, /coach-title-row/, 'native workbench should render the coach title and dropdown arrow in one aligned row');
assert.doesNotMatch(scheduleWxml, /dashboard-topbar/, 'native workbench should not render the extra custom top bar');
assert.doesNotMatch(scheduleWxml, /hero-device-pill/, 'native workbench should not render the extra simulated top-right device pill');
assert.doesNotMatch(scheduleWxml, /已连接/, 'native workbench should not render the temporary real-device connection tag');
assert.doesNotMatch(scheduleWxml, /coach-task-panel/, 'native workbench should not show a separate large task card above the summary');
assert.match(scheduleWxml, /wx:if="\{\{reminderItems\.length\}\}"/, 'native workbench summary should only render when there are reminders');
assert.match(scheduleWxml, /metric-primary/, 'native workbench should use a consumer-style highlighted metric card');
assert.match(scheduleWxml, /schedule-location/, 'native workbench lesson cards should make location easy to scan');
assert.match(scheduleWxml, /reminder-value/, 'native workbench reminder numbers should be styled separately');
assert.match(scheduleWxml, /today-lesson-separator/, 'native workbench today card should render location and student on one SVG-style meta row');
assert.match(scheduleWxml, /week-task-location[\s\S]*item\.student[\s\S]*week-task-separator[\s\S]*item\.shortLocation/, 'native workbench weekly todo card should render student before location like the SVG');
assert.match(scheduleWxml, /scroll-top="\{\{timetableScrollTop\}\}"/, 'native timetable should support vertical auto positioning');
assert.match(scheduleWxml, /scroll-left="\{\{timetableScrollLeft\}\}"/, 'native timetable should support horizontal auto positioning to today');
assert.match(scheduleWxml, /scroll-x scroll-y class="timetable-scroll"/, 'native timetable should use one native two-axis scroll for smoother movement');
assert.match(scheduleWxml, /tt-time-axis[\s\S]*tt-now-label[\s\S]*currentTimeText[\s\S]*tt-day-columns[\s\S]*tt-now-line/, 'native timetable should keep the current-time label fixed inside the left time axis');
assert.match(scheduleWxml, /tt-day-date-dot/, 'native timetable should render the active day as a round date marker');
assert.match(scheduleWxml, /tt-course-status/, 'native timetable course cards should render pending status as a compact badge');
assert.doesNotMatch(scheduleWxml, /反馈:/, 'native timetable course cards should not show the old feedback prefix');
assert.match(scheduleWxml, /feedbackHasSaved && !feedbackEditing[\s\S]*生成海报[\s\S]*编辑反馈/, 'saved feedback sheet should show poster and edit actions');
assert.match(scheduleWxml, /wx:else[\s\S]*取消[\s\S]*保存反馈/, 'unsaved feedback sheet should show cancel and save actions');
assert.match(scheduleWxml, /data-field="practicedToday"[\s\S]*data-field="knowledgePoint"[\s\S]*data-field="nextTraining"/, 'feedback sheet should bind all three feedback fields');
assert.match(scheduleWxml, /placeholder-class="feedback-input-placeholder"/, 'feedback inputs should use the mapped placeholder color token');
assert.match(scheduleWxml, /bindfocus="onFeedbackFocus"[\s\S]*cursor-color="#3b5bff"/, 'feedback input focus should drive the blue focus state and cursor color');
assert.doesNotMatch(scheduleWxml, /feedback-input-bar/, 'feedback sheet should not fake the input cursor with a separate blue bar');
assert.match(scheduleWxml, /feedback-course-time[\s\S]*selectedClassDetail\.basicInfo\.datetime[\s\S]*feedback-course-separator/, 'feedback course card should render full date time and styled separators');
assert.match(scheduleWxml, /poster-sheet[\s\S]*生成反馈海报[\s\S]*posterStyles[\s\S]*feedbackPosterCanvas[\s\S]*手机端可直接长按海报保存[\s\S]*保存相册[\s\S]*发送给学员/, 'poster sheet should render the real six-template canvas poster shell');
assert.match(scheduleWxml, /student-detail-sheet[\s\S]*学员详情[\s\S]*基础信息[\s\S]*教练视角摘要[\s\S]*学员备注[\s\S]*上课记录[\s\S]*关闭/, 'student detail sheet should render the SVG-mapped student profile sections');

const scheduleJs = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.js');
assert.match(scheduleJs, /weekTodoGroups/, 'native workbench should prepare grouped weekly todo data');
assert.match(scheduleJs, /dashboardClasses,\s*weekTodoGroups/, 'native week render should expose both today cards and weekly todo groups');
assert.match(scheduleJs, /reminderItems/, 'native workbench should prepare compact reminder chips');
assert.match(scheduleJs, /coachGreeting/, 'mini program schedule page should prepare the greeting copy for the recreated dashboard header');
assert.match(scheduleJs, /coachDisplayName/, 'mini program schedule page should prepare the coach name for the recreated dashboard header');
assert.doesNotMatch(scheduleJs, /const studentsList = \[/, 'mini program students should not stay on hardcoded local list data');
assert.doesNotMatch(scheduleJs, /const shiftsList = \[/, 'mini program classes should not stay on hardcoded local list data');
assert.match(scheduleJs, /onShow\(\)\s*\{[\s\S]*this\.load\(/, 'mini program schedule page should refresh when returning to the page');
assert.match(scheduleJs, /onPullDownRefresh\(\)\s*\{[\s\S]*this\.load\(/, 'mini program schedule page should support pull-down refresh');
assert.match(scheduleJs, /saveCoachFeedback/, 'mini program schedule page should expose a real feedback save action');
assert.match(scheduleJs, /feedbackFormFromRecord/, 'feedback sheet should hydrate saved feedback into the form');
assert.match(scheduleJs, /feedbackCountsOf/, 'feedback sheet should maintain 0\/200 style counters');
assert.match(scheduleJs, /feedbackFocusedField/, 'feedback sheet should track the focused field for dynamic focus styling');
assert.match(scheduleJs, /feedbackContextParts/, 'feedback course meta should expose separate text parts for styled separators');
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
assert.match(scheduleJs, /Array\.from\(\{\s*length:\s*25\s*\}[\s\S]*String\(i\)\.padStart\(2,\s*'0'\)/, 'mini program timetable should expose a 00:00-24:00 time axis');
assert.match(scheduleJs, /TIMETABLE_START_HOUR\s*=\s*0/, 'mini program current-time marker should use a midnight-based timetable axis');
assert.match(scheduleJs, /lastScheduleId:\s*lastClass && lastClass\.id/, 'mini program students should still carry their latest class id for summaries');
assert.match(scheduleJs, /\/pages\/webview\/webview\?fallback=1/, 'schedule fallback button should mark deliberate web-view entry');

const scheduleUtils = require('../wechat-miniprogram/miniprogram/utils/schedule');
assert.strictEqual(
  scheduleUtils.classBlockStyle({ startTime: '2026-04-22 09:00', endTime: '2026-04-22 10:00' }).top,
  1350,
  'timetable course blocks should be positioned from 00:00'
);
const todoNow = new Date('2026-04-21T12:00:00+08:00');
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 15:00', endTime: '2026-04-21 16:00', status: '已排课' }, todoNow).label,
  '待上课',
  'future active courses should be weekly todos'
);
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已排课' }, todoNow).label,
  '待反馈',
  'ended courses without feedback should become feedback todos'
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
assert.match(detailJs, /fallback=1/, 'detail fallback button should mark deliberate web-view entry');

const webviewWxml = readText('wechat-miniprogram/miniprogram/pages/webview/webview.wxml');
assert.match(webviewWxml, /<web-view\s+src="\{\{webViewUrl\}\}"/, 'web-view page should render the PWA through web-view');

const webviewJs = readText('wechat-miniprogram/miniprogram/pages/webview/webview.js');
assert.match(webviewJs, /WEB_VIEW_URL/, 'web-view page should read the PWA URL from config');
assert.match(webviewJs, /options\.fallback !== '1'[\s\S]*wx\.redirectTo/, 'web-view page should redirect accidental opens back to native pages');
assert.doesNotMatch(webviewJs, /https:\/\/[^'"]+/, 'web-view page should not hardcode the business domain');
assert.match(webviewJs, /wx\.login/, 'web-view page should request a mini program login code');
assert.match(webviewJs, /wechatCode/, 'web-view page should pass the mini program login code into the web-view URL');
assert.match(webviewJs, /scheduleId/, 'web-view page should pass notification scheduleId into the PWA URL');

const apiJs = readText('public/assets/scripts/core/api.js');
assert.match(apiJs, /WECHAT_CODE_KEY/, 'web app should keep the mini program login code until account login succeeds');
assert.match(apiJs, /\/auth\/wechat-bind/, 'web app should call the wechat bind API after account login');
assert.match(apiJs, /PENDING_SCHEDULE_ID_KEY/, 'web app should keep notification scheduleId until data is loaded');

const stateJs = readText('public/assets/scripts/core/state.js');
assert.match(stateJs, /openPendingScheduleDeepLink/, 'page data load should try to open a pending notification schedule');

const configJs = readText('wechat-miniprogram/miniprogram/config.js');
assert.match(configJs, /WEB_VIEW_URL:\s*'https:\/\/www\.flowtennis\.cn'/, 'config should use the verified business domain');
assert.match(configJs, /API_BASE_URL:\s*'https:\/\/www\.flowtennis\.cn\/api'/, 'config should expose the API base URL for native pages');
assert.match(configJs, /SCHEDULE_TEMPLATE_ID:\s*'H_BIzR4Ca7aKldMWAlajgSwTWSos80lDZskEM4p8taI'/, 'config should include the selected schedule subscribe template ID');
assert.match(configJs, /COURSE_REMINDER_TEMPLATE_ID:\s*'ME_OpZIFDLRwN-ENibuFk4g4Dtdi8x43TAQR2nKkoUs'/, 'config should include the selected course reminder subscribe template ID');

const apiServerJs = readText('api/index.js');
assert.match(apiServerJs, /\/auth\/wechat-login/, 'API should support mini program login by bound openid');
assert.match(apiServerJs, /findWechatUserByOpenId/, 'API should find the bound coach account by openid');
assert.match(apiServerJs, /pages\/detail\/detail/, 'subscribe messages should deep link to native course detail');

const miniApiJs = readText('wechat-miniprogram/miniprogram/utils/api.js');
assert.match(miniApiJs, /function saveCoachFeedback/, 'mini program API helper should provide feedback save');
assert.match(miniApiJs, /request\('\/feedbacks'/, 'mini program feedback save should call the feedback API');

const scheduleWxss = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.wxss');
assert.match(scheduleWxss, /\.dashboard-top\s*\{[\s\S]*background:\s*linear-gradient\(135deg,\s*#2b3a55 0%,\s*#1e2a38 100%\)/i, 'mini program workbench should use the SVG dark header gradient');
assert.match(scheduleWxss, /\.dashboard-top\s*\{[\s\S]*height:\s*230px;/, 'dashboard header should use the requested 230px height');
assert.match(scheduleWxss, /\.dashboard-hero\s*\{[\s\S]*padding:\s*122px 32rpx 0;/, 'dashboard coach header should stop with the avatar bottom 20px above the metric card');
assert.match(scheduleWxss, /\.coach-title\s*\{[\s\S]*font-size:\s*20px;[\s\S]*font-weight:\s*700;/, 'dashboard coach title should use the requested 20px bold token');
assert.match(scheduleWxss, /\.coach-subtitle\s*\{[\s\S]*color:\s*#ffffff;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*400;/i, 'dashboard coach subtitle should use the requested white 13px regular token');
assert.match(scheduleWxss, /\.coach-avatar\s*\{[\s\S]*width:\s*48px;[\s\S]*height:\s*48px;[\s\S]*border:\s*2px solid rgba\(255,\s*255,\s*255,\s*0\.2\);[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*700;/i, 'dashboard coach avatar should match the requested 48px token');
assert.match(scheduleWxss, /\.coach-arrow\s*\{[\s\S]*width:\s*8px;[\s\S]*height:\s*4px;/, 'dashboard coach dropdown icon should use the requested 8x4 size');
assert.match(scheduleWxss, /\.dashboard-shell\s*\{[\s\S]*margin-top:\s*-40px;/, 'dashboard metric card should overlap the header by 40px');
assert.match(scheduleWxss, /\.mini-metrics\s*\{[\s\S]*height:\s*170px;[\s\S]*padding:\s*16px;[\s\S]*gap:\s*6px;/, 'dashboard metric shell should match the requested 361x170 token with 16px padding and 6px gap');
assert.match(scheduleWxss, /\.mini-metric\s*\{[\s\S]*height:\s*66px;[\s\S]*padding:\s*16px;/, 'dashboard metric cells should match the requested 104x66 token');
assert.match(scheduleWxss, /\.reminder-bar\s*\{[\s\S]*height:\s*38px;[\s\S]*margin-top:\s*12px;[\s\S]*border:\s*0\.8px solid #e2e8f0;/i, 'dashboard reminder bar should match the requested size and border token');
assert.match(scheduleWxss, /\.reminder-bar \.summary-icon\s*\{[\s\S]*width:\s*12px;[\s\S]*height:\s*12px;/, 'dashboard reminder icon should use the requested 12x12 size');
assert.match(scheduleWxss, /\.today-lesson-card\s*\{[\s\S]*height:\s*84px;/, 'dashboard today course card should match the requested 84px height');
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
assert.match(scheduleWxss, /\.tab-icon\s*\{[\s\S]*width:\s*44rpx;[\s\S]*height:\s*44rpx;/, 'mini program tab icons should stay inside a compact visual box');
assert.match(scheduleWxss, /\.tab-grid-icon\s*\{[\s\S]*width:\s*36rpx;[\s\S]*height:\s*36rpx;/, 'workbench icon should use its own smaller visual size');
assert.match(scheduleWxss, /\.tab-list-icon\s*\{[\s\S]*width:\s*42rpx;[\s\S]*height:\s*34rpx;/, 'class list icon should use a narrower visual size');
assert.match(scheduleWxss, /\.tab-item\.active \.tab-grid-icon view\s*\{[\s\S]*background:\s*#2b3a55;/, 'active workbench icon should render as solid blocks');
assert.match(scheduleWxss, /\.tab-item:not\(\.active\) \.tab-grid-icon view\s*\{[\s\S]*border:\s*3rpx solid #94a3b8;/, 'inactive workbench icon should render as outline blocks');
assert.match(scheduleWxss, /\.timetable-top\s*\{[\s\S]*height:\s*190px;[\s\S]*padding:\s*124px 16px 0;[\s\S]*background:\s*linear-gradient\(135deg,\s*#2b3a55 0%,\s*#1e2a38 100%\)/i, 'timetable top should match the requested dark header shell');
assert.match(scheduleWxss, /\.week-switch\s*\{[\s\S]*width:\s*160px;[\s\S]*height:\s*36px;[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.1\);[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.15\);/i, 'timetable week switch should match the SVG 160x36 translucent pill');
assert.match(scheduleWxss, /\.week-switch\s*\{[^}]*gap:\s*20px;/, 'timetable week switch should keep 20px spacing around the date text');
assert.match(scheduleWxss, /\.switch-btn\s*\{[\s\S]*width:\s*6px;[\s\S]*height:\s*8px;/, 'timetable switch arrows should use the requested 6x8 size');
assert.match(scheduleWxss, /\.week-range\s*\{[\s\S]*font-size:\s*15px;[\s\S]*font-weight:\s*500;/, 'timetable week range text should use 15px medium');
assert.match(scheduleWxss, /\.back-week-btn\s*\{[\s\S]*width:\s*80px;[\s\S]*height:\s*36px;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*500;/, 'timetable back-to-week button should match the SVG token');
assert.match(scheduleWxss, /\.timetable-scroll\s*\{[\s\S]*border-top-left-radius:\s*40rpx;[\s\S]*border-top-right-radius:\s*40rpx;/, 'timetable grid should sit in the SVG rounded white panel');
assert.match(scheduleWxss, /\.tt-header\s*\{[\s\S]*position:\s*sticky;/, 'timetable header should stay fixed during vertical scrolling');
assert.match(scheduleWxss, /\.tt-time-axis\s*\{[\s\S]*position:\s*sticky;[\s\S]*left:\s*0;/, 'timetable time axis should stay fixed during horizontal scrolling');
assert.match(scheduleWxss, /\.tt-hour-cell text\s*\{[\s\S]*color:\s*#94a3b8;[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*400;/i, 'timetable time axis should use the requested 11px regular token');
assert.match(scheduleWxss, /\.tt-day-name\s*\{[\s\S]*color:\s*#64748b;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*400;/i, 'timetable weekday names should use the SVG header typography');
assert.match(scheduleWxss, /\.tt-day-date\s*\{[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*400;/, 'timetable day dates should use 11px regular');
assert.match(scheduleWxss, /\.tt-day-date-dot\s*\{[\s\S]*width:\s*22px;[\s\S]*height:\s*22px;[\s\S]*background:\s*#2b3a55;[\s\S]*font-size:\s*11px;[\s\S]*font-weight:\s*700;/, 'active timetable day should use the SVG dark 22px circular date marker');
assert.match(scheduleWxml, /tt-day-date[\s\S]*item\.displayDate/, 'active timetable date should render the mapped display date without the trailing day suffix');
assert.match(scheduleJs, /displayDate:\s*item\.isToday[\s\S]*replace\('日', ''\)/, 'timetable day data should strip the active date suffix');
assert.doesNotMatch(scheduleJs, /onTimetableScrollX/, 'timetable should avoid JS scroll syncing that causes horizontal lag');
assert.match(scheduleJs, /activeTab === 'timetable'[\s\S]*this\.renderWeek\(\)/, 'timetable tab should refresh current-time positioning when opened');
assert.match(scheduleWxss, /\.tt-now-line\s*\{[\s\S]*background:\s*#ef4444;/i, 'timetable should show the requested current-time marker');
assert.match(scheduleWxss, /\.tt-now-label\s*\{[\s\S]*transform:\s*translateY\(-9px\);/, 'timetable current-time label should align vertically with the red line');
assert.match(scheduleWxss, /\.tt-now-label text\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*18px;[\s\S]*background:\s*#ef4444;[\s\S]*font-size:\s*10px;[\s\S]*font-weight:\s*700;/i, 'timetable current-time marker should show the fixed 40x18 left time pill');
assert.match(scheduleWxss, /\.tt-now-line::after\s*\{[\s\S]*width:\s*14px;[\s\S]*height:\s*14px;[\s\S]*box-shadow:\s*0 0 0 10px rgba\(239,\s*68,\s*68,\s*0\.14\);/i, 'timetable current-time dot should use the requested solid dot and soft ring style');
assert.match(scheduleWxss, /\.tt-course::before\s*\{[\s\S]*width:\s*8rpx;[\s\S]*background:\s*var\(--course-accent\);/, 'timetable course cards should use the SVG left accent bar');
assert.match(scheduleWxss, /\.detail-sheet-body\s*\{[\s\S]*background:\s*#f8fafc;/, 'detail sheet body should use slate-50 background');
assert.match(scheduleWxml, /enhanced show-scrollbar="\{\{false\}\}"/, 'detail sheet scroll view should hide the native right scrollbar');
assert.match(scheduleWxss, /\.detail-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 296rpx\);/, 'detail sheet should move 60px lower than the previous top position');
assert.match(scheduleWxss, /\.detail-section-card\s*\{[\s\S]*padding:\s*40rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*box-shadow:\s*0 2rpx 4rpx rgba\(15,\s*23,\s*42,\s*0\.06\);/, 'detail cards should match the white rounded p-5 shadow-sm token');
assert.match(scheduleWxss, /\.detail-section-title\s*\{[\s\S]*font-size:\s*15px;[\s\S]*font-weight:\s*700;/, 'detail section title should use 15px bold slate typography');
assert.match(scheduleWxss, /\.detail-info-label\s*\{[\s\S]*flex:\s*0 0 144rpx;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*400;/, 'detail labels should use fixed 72px width and 13px regular typography');
assert.match(scheduleWxss, /\.detail-info-value\.is-strong\s*\{[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*600;/, 'detail values should use 14px semibold typography');
assert.match(scheduleWxss, /\.detail-inline-tag\s*\{[\s\S]*padding:\s*4rpx 16rpx;[\s\S]*border-radius:\s*8rpx;[\s\S]*font-size:\s*10px;/, 'detail tags should use compact badge tokens');
assert.match(scheduleWxss, /\.detail-section-card\.is-empty-state \.detail-note-block\s*\{[\s\S]*display:\s*flex;/, 'empty detail note sections should use compact inline rows');
assert.match(scheduleWxss, /\.detail-section-card\.is-empty-state \.detail-note-grid\s*\{[\s\S]*display:\s*flex;/, 'empty pre-class history and focus fields should stay on one row');
assert.match(scheduleWxss, /\.detail-section-card\.is-empty-state \.detail-note-col\s*\{[\s\S]*display:\s*flex;/, 'empty pre-class note fields should keep label and value inline');
assert.match(scheduleWxss, /\.detail-section-card\.is-filled \.detail-note-grid\s*\{[\s\S]*display:\s*block;/, 'filled detail note sections should stack long text fields vertically');
assert.match(scheduleWxss, /\.detail-feedback-cell\s*\{[\s\S]*display:\s*flex;/, 'feedback lesson counts should keep label and value on one line');
assert.match(scheduleWxss, /\.detail-feedback-card\.is-empty-state \.detail-note-block\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*baseline;/, 'empty feedback fields should align label and value on one baseline');
assert.match(scheduleJs, /feedbackSummary\.text = '待填写反馈'/, 'empty feedback summary copy should be pending feedback');
assert.match(scheduleWxss, /\.detail-sheet-title\s*\{[\s\S]*line-height:\s*48rpx;/, 'detail title should have enough vertical height');
assert.match(scheduleWxss, /\.detail-sheet-actions\s*\{[\s\S]*padding:\s*24rpx 32rpx 64rpx;[\s\S]*border-top:\s*1px solid #f1f5f9;/, 'detail action bar should match sticky bottom action tokens');
assert.match(scheduleWxss, /\.feedback-course-card\s*\{[\s\S]*background:\s*#f8fafc;[\s\S]*border:\s*1px solid #f1f5f9;/, 'feedback course summary should match the slate-50 card token');
assert.match(scheduleWxss, /\.feedback-course-time\s*\{[\s\S]*font-size:\s*14px;[\s\S]*color:\s*#0f172a;[\s\S]*font-weight:\s*700;/, 'feedback course time should use the requested 14px bold slate token');
assert.match(scheduleWxss, /\.feedback-course-separator\s*\{[\s\S]*color:\s*#cbd5e1;[\s\S]*font-size:\s*12px;/, 'feedback course separators should use the requested muted token');
assert.match(scheduleWxss, /\.feedback-divider view\s*\{[\s\S]*background:\s*#f1f5f9;/, 'feedback divider line should use slate-100');
assert.match(scheduleWxss, /\.feedback-field-label\s*\{[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*700;/, 'feedback field labels should use 14px bold typography');
assert.match(scheduleWxss, /\.feedback-field-label\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*baseline;/, 'feedback labels and optional text should align on one baseline');
assert.match(scheduleWxss, /\.feedback-input-wrap\.is-active\s*\{[\s\S]*border:\s*2rpx solid #3b5bff;/, 'focused feedback input should show the active blue border');
assert.doesNotMatch(scheduleWxss, /\.feedback-input-bar\s*\{/, 'feedback sheet should not use a decorative fake cursor bar');
assert.match(scheduleWxss, /\.feedback-input\s*\{[\s\S]*color:\s*#334155;[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*400;/, 'feedback input text should use the requested 14px regular slate token');
assert.match(scheduleWxss, /\.feedback-action-btn\s*\{[\s\S]*height:\s*88rpx;[\s\S]*border-radius:\s*44rpx;[\s\S]*font-size:\s*15px;/, 'feedback bottom buttons should use the 44px pill token');
assert.match(scheduleWxss, /\.poster-style-chip\s*\{[\s\S]*height:\s*64rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*font-size:\s*13px;/, 'poster style chips should match the 32px capsule token');
assert.match(scheduleWxss, /\.feedback-poster-canvas\s*\{[\s\S]*width:\s*560rpx;[\s\S]*height:\s*996rpx;[\s\S]*border-radius:\s*32rpx;/, 'poster canvas should keep the mapped preview container');
assert.match(scheduleWxss, /\.poster-action-btn\s*\{[\s\S]*height:\s*88rpx;[\s\S]*border-radius:\s*44rpx;[\s\S]*font-size:\s*15px;/, 'poster bottom buttons should use the 44px pill token');
assert.match(scheduleWxss, /\.student-detail-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 120rpx\);[\s\S]*background:\s*#f4f6f9;/, 'student detail sheet should match the SVG modal top offset and background');
assert.match(scheduleWxss, /\.student-detail-card\s*\{[\s\S]*padding:\s*40rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*background:\s*#fff;/, 'student detail cards should match the white rounded mapped sections');
assert.match(scheduleWxss, /\.student-detail-btn\s*\{[\s\S]*height:\s*96rpx;[\s\S]*border-radius:\s*48rpx;[\s\S]*background:\s*#f8fafc;/, 'student detail close button should match the bottom pill token');
assert.match(scheduleWxss, /\.coach-title-row\s*\{[\s\S]*align-items:\s*center;/, 'mini program coach name row should vertically center the dropdown arrow');
assert.doesNotMatch(scheduleWxss, /\.dashboard-topbar\s*\{/, 'mini program workbench should not keep the removed custom top bar styles');
assert.doesNotMatch(scheduleWxss, /\.coach-status-pill\s*\{/, 'mini program workbench should not keep the removed connection pill styles');
assert.match(scheduleWxss, /\.sheet\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/, 'mini program bottom sheets should use a flex column layout so the body can scroll');
assert.doesNotMatch(scheduleWxss, /\.sheet-actions\s*\{[\s\S]*position:\s*absolute;/, 'mini program bottom sheet footer should not pin absolutely over scrollable content');

console.log('miniprogram shell tests passed');
