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
assert.deepStrictEqual(appConfig.pages, ['pages/index/index', 'pages/schedule/schedule', 'pages/detail/detail', 'pages/agreement/agreement', 'pages/privacy/privacy'], 'mini program should register coach pages only');
assert.strictEqual(appConfig.sitemapLocation, 'sitemap.json', 'mini program should include sitemap config');
assert.strictEqual(appConfig.lazyCodeLoading, 'requiredComponents', 'mini program should enable component lazy injection');
assert.strictEqual(appConfig.__usePrivacyCheck__, true, 'mini program should enable the WeChat privacy check mechanism');

const indexWxml = readText('wechat-miniprogram/miniprogram/pages/index/index.wxml');
assert.match(indexWxml, /网球兄弟/, 'index page should render the Gemini login title');
assert.match(indexWxml, /FLOWTENNIS · 管理系统/, 'index page should render the Gemini login subtitle');
assert.match(indexWxml, /请输入账号或手机号/, 'index page should render the unified account input');
assert.doesNotMatch(indexWxml, /请输入账号ID（不是姓名）/, 'index page should not force account-id-only copy');
assert.match(indexWxml, /请输入密码/, 'index page should render the mapped password input');
assert.match(indexWxml, /checkbox/, 'index page should render an agreement checkbox');
assert.match(indexWxml, /我已阅读并同意/, 'index page should render the agreement consent copy');
assert.match(indexWxml, /用户协议/, 'index page should expose the user agreement link');
assert.match(indexWxml, /隐私政策/, 'index page should expose the privacy policy link');
assert.match(indexWxml, /bindtap="submitLogin"[\s\S]*登录/, 'index login button should use the real account login submit handler');
assert.match(indexWxml, /其他登录方式/, 'index page should label the secondary area as other login methods');
assert.match(indexWxml, /bindtap="submitWechatLogin"[\s\S]*微信快捷登录/, 'index page should expose coach WeChat quick login');
assert.doesNotMatch(indexWxml, /约球入口|微信进入约球/, 'index page should not expose match mini-program copy');
assert.match(indexWxml, /login-spinner/, 'index login button should render a centered custom loading spinner');
assert.doesNotMatch(indexWxml, /loading="\{\{loggingIn\}\}"/, 'index login button should not use the native button loading layout');
assert.doesNotMatch(indexWxml, /disabled="\{\{loggingIn\}\}"/, 'index login button should keep its visual style while logging in');
assert.doesNotMatch(indexWxml, /<web-view/, 'index page should stay native so subscribe permission can be requested by tap');
assert.doesNotMatch(indexWxml, /password-eye/, 'login page should remove the password eye icon');

const indexJs = readText('wechat-miniprogram/miniprogram/pages/index/index.js');
assert.doesNotMatch(indexJs, /requestSubscribeMessage/, 'mini program login should not request one-time schedule subscription messages');
assert.match(indexJs, /loginWithPassword/, 'index page should call the real account password login helper');
assert.match(indexJs, /loginWithWechat/, 'index page should call the coach WeChat login helper');
assert.match(indexJs, /bindWechatAfterLogin/, 'index page should bind the current mini program WeChat account after password login');
assert.match(indexJs, /AGREEMENT_ACCEPTED_KEY/, 'index page should persist the agreement consent state');
assert.match(indexJs, /function assertCoachLoginUser/, 'index page should validate coach role before entering the coach mini program');
assert.match(indexJs, /user\.role !== 'editor'/, 'index page should reject non-coach accounts on the login page');
assert.match(indexJs, /loginWithPassword\(account, password\)[\s\S]*assertCoachLoginUser\(data\.user \|\| \{\}\)[\s\S]*bindWechatAfterLogin\(\)/, 'index page should always attempt mini program WeChat bind after password login');
assert.doesNotMatch(indexJs, /function shouldBindWechatAfterLogin/, 'index page should not keep stale conditional bind helper');
assert.doesNotMatch(indexJs, /wechatBound/, 'index page should not depend on cached wechatBound state to decide binding');
assert.doesNotMatch(indexJs, /SCHEDULE_TEMPLATE_ID|COURSE_REMINDER_TEMPLATE_ID/, 'mini program login should leave course reminders to official account messages');
assert.match(indexJs, /pages\/schedule\/schedule/, 'index page should navigate into the native schedule page after the tap');
assert.match(indexJs, /wx\.getStorageSync\(TOKEN_KEY\)[\s\S]*wx\.getStorageSync\(USER_KEY\)[\s\S]*enterCoachPortal\(\)/, 'index page should skip the login form when a valid coach session exists');
assert.match(indexJs, /agreed/, 'index page should track the agreement checkbox state');
assert.match(indexJs, /openAgreement/, 'index page should open the agreement page from the login page');
assert.match(indexJs, /openPrivacy/, 'index page should open the privacy page from the login page');
assert.doesNotMatch(indexJs, /loginMatchWithWechat|loadMatchProfile|enterMatchMini|matchLoggingIn/, 'index page should not keep match mini-program login behavior');
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
assert.match(indexWxss, /\.agreement-row checkbox\s*\{[\s\S]*transform:\s*scale\(0\.75\);/, 'agreement checkbox should be slightly smaller');

const scheduleWxml = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.wxml');
assert.match(scheduleWxml, /本周|下周/, 'native schedule page should provide week navigation');
assert.match(scheduleWxml, /bindtap="openDetail"/, 'native schedule cards should open native detail');
assert.match(scheduleWxml, /student-card"[^>]*data-id="\{\{item\.id\}\}"[^>]*bindtap="openStudentDetail"/, 'native student cards should open the mapped student detail sheet');
assert.match(scheduleWxml, /student-row[\s\S]*student-name[\s\S]*student-tag[\s\S]*最近 \{\{item\.lastClassText\}\}/, 'student list first row should show name, ownership tag, and latest lesson date');
assert.match(scheduleWxml, /累计上课（节\/课时）：<text class="student-strong">\{\{item\.cumulative\}\}<\/text>/, 'student list should render record count before lesson units');
assert.match(scheduleWxml, /student-meta-separator">·<\/text>/, 'student list should separate lesson and package data with a middle dot');
assert.match(scheduleWxml, /wx:if="\{\{item\.showPackage\}\}" class="student-meta">课包：<text class="student-strong">\{\{item\.packageText\}\}<\/text>/, 'student list should render package progress only when allowed');
assert.match(scheduleWxml, /studentStats\.ownerCount[\s\S]*归属学员[\s\S]*studentStats\.substituteCount[\s\S]*代课学员/, 'student summary should use owner and substitute counts');
assert.doesNotMatch(scheduleWxml, /可见学员/, 'student summary should not show visible-student wording');
assert.match(scheduleWxml, /今日排课/, 'native workbench should keep the today schedule section');
assert.match(scheduleWxml, /本周待办/, 'native workbench should also show a weekly todo section');
assert.match(scheduleWxml, /今日课程[\s\S]*本周课时[\s\S]*本月课时[\s\S]*本月反馈[\s\S]*未反馈[\s\S]*体验课转化/, 'native workbench should keep the six original web metrics in the requested order');
assert.match(scheduleWxml, /conversion-row[\s\S]*stats\.conversionText[\s\S]*conversion-unit/, 'native workbench should render conversion percent in a dedicated single-line row');
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
assert.match(scheduleWxml, /class="timetable-shell"[\s\S]*scroll-x scroll-y class="timetable-scroll"/, 'native timetable should keep the white shell fixed outside the scrollable content');
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
assert.match(scheduleWxml, /feedbackListStyleOptions[\s\S]*onFeedbackListStyleTap/, 'feedback sheet should render typing mode buttons before coaches write feedback');
assert.match(scheduleWxml, /cursor="\{\{feedbackListCursors\.practicedToday\}\}"[\s\S]*cursor="\{\{feedbackListCursors\.knowledgePoint\}\}"[\s\S]*cursor="\{\{feedbackListCursors\.nextTraining\}\}"/, 'feedback sheet should restore cursor after inserting list markers');
assert.match(scheduleWxml, /data-field="practicedToday"[\s\S]*auto-height="true"[\s\S]*data-field="knowledgePoint"[\s\S]*auto-height="true"[\s\S]*data-field="nextTraining"[\s\S]*auto-height="true"/, 'feedback textareas should auto grow with content');
assert.match(scheduleWxml, /placeholder-class="feedback-input-placeholder"/, 'feedback inputs should use the mapped placeholder color token');
assert.match(scheduleWxml, /bindfocus="onFeedbackFocus"[\s\S]*cursor-color="#3b5bff"/, 'feedback input focus should drive the blue focus state and cursor color');
assert.doesNotMatch(scheduleWxml, /feedback-input-bar/, 'feedback sheet should not fake the input cursor with a separate blue bar');
assert.match(scheduleWxml, /feedback-course-time[\s\S]*selectedClassDetail\.basicInfo\.datetime[\s\S]*feedback-course-separator/, 'feedback course card should render full date time and styled separators');
assert.match(scheduleWxml, /scroll-top="\{\{feedbackSheetScrollTop\}\}"/, 'feedback sheet should reset its scroll position when opened from any entry');
assert.match(scheduleWxml, /今天练习了/, 'feedback sheet first field should use the requested label copy');
assert.match(scheduleWxml, /poster-sheet[\s\S]*生成反馈海报[\s\S]*posterStyles[\s\S]*feedbackPosterCanvas[\s\S]*手机端可直接长按海报保存[\s\S]*保存相册[\s\S]*分享海报/, 'poster sheet should render the real six-template canvas poster shell');
assert.match(scheduleWxml, /student-detail-sheet[\s\S]*学员详情[\s\S]*基础信息[\s\S]*教练视角摘要[\s\S]*学员备注[\s\S]*上课记录[\s\S]*selectedStudentDetail\.lessonRecordTitleSub[\s\S]*查看全部上课记录[\s\S]*关闭/, 'student detail sheet should render the SVG-mapped student profile sections and lesson history expansion entry');
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
assert.doesNotMatch(scheduleJs, /const shiftsList = \[\s*\{/, 'mini program classes should not stay on hardcoded local list data');
assert.match(scheduleJs, /function buildStudentStats[\s\S]*ownerCount[\s\S]*substituteCount[\s\S]*return \{ ownerCount, substituteCount \}/, 'student stats should only expose owner and substitute counts');
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
assert.match(scheduleJs, /openFeedbackByScheduleId\(id\)[\s\S]*feedbackSheetScrollTop:\s*0/, 'workbench feedback entry should start the feedback sheet from the top');
assert.match(scheduleJs, /onLoad\(options = \{\}\)/, 'schedule page should read route params when opened from reminder links');
assert.match(scheduleJs, /pendingRouteScheduleId:/, 'schedule page should keep the pending reminder schedule id');
assert.match(scheduleJs, /pendingRouteAction:/, 'schedule page should keep the pending reminder action');
assert.match(scheduleJs, /tryOpenPendingRouteAction\(\)/, 'schedule page should expose a pending reminder route handler');
assert.match(scheduleJs, /action === 'feedback'[\s\S]*openFeedbackByScheduleId/, 'feedback reminder route should auto-open the matching feedback sheet');
assert.match(scheduleJs, /timetableCourseTag[\s\S]*text:\s*'体验'[\s\S]*text:\s*'小班'[\s\S]*text:\s*'陪打'[\s\S]*text:\s*'私教'/, 'timetable course cards should use short course type labels');
assert.match(scheduleJs, /function scheduleStudentRemarkText[\s\S]*`\$\{name\}备注：\$\{remark\}`/, 'small group detail student remarks should include the student name before each remark');
assert.match(scheduleJs, /knowledgePoint,\s*nextTraining/, 'feedback save should include practice status and next practice fields');
assert.match(scheduleJs, /posterSheetClass/, 'poster sheet should use the same bottom-sheet show transition as other sheets');
assert.match(scheduleJs, /posterDateText/, 'poster sheet should prepare a readable class date for the preview');
assert.match(scheduleJs, /FEEDBACK_POSTER_TEMPLATES[\s\S]*blueGreenDiagonal[\s\S]*minimalDarkGreen[\s\S]*retroCourt[\s\S]*blueprintBlue[\s\S]*minimalRacket[\s\S]*activeGreen/, 'mini program poster should reuse the real six poster templates');
assert.match(scheduleJs, /drawFeedbackPoster/, 'mini program poster should draw the real poster templates on canvas');
assert.match(scheduleJs, /renderFeedbackPosterCanvas/, 'mini program poster should render the selected template instead of static fake data');
assert.match(scheduleJs, /function posterDrawFittedTitle\(/, 'mini program poster should fit long student names on one title line');
assert.match(scheduleJs, /ctx\.fillText\(`\$\{posterDisplayDate\(data\.date\)\} 训练反馈`, 60, 195\)/, 'mini program poster subtitle should combine date and training feedback');
assert.doesNotMatch(scheduleJs, /ctx\.fillText\('训练反馈', Math\.min\(60 \+ nameWidth \+ 16, 560\), 140\)/, 'mini program poster title suffix should not sit beside the student name');
assert.match(scheduleJs, /function posterNormalizeText\(/, 'mini program poster should normalize list markers before drawing text');
assert.match(scheduleJs, /preserveListMarkers/, 'mini program poster should expose a list marker option');
assert.match(scheduleJs, /function posterApplyLineStyle\(/, 'mini program poster should auto add list markers for multiline feedback');
assert.match(scheduleJs, /style === 'preserve'[\s\S]*String\(text \|\| '—'\)/, 'mini program poster should preserve coach-entered titles and list markers by default');
assert.match(scheduleJs, /function feedbackAutoListValue\(/, 'mini program feedback editor should auto add the next marker when coach presses enter');
assert.match(scheduleJs, /onFeedbackListStyleTap/, 'mini program feedback editor should let coaches choose numbered, bullet, or normal typing');
assert.match(scheduleJs, /function feedbackApplyListStyleToRange\(/, 'mini program feedback editor should format selected lines instead of replacing selected text');
assert.match(scheduleJs, /feedbackApplyListStyleToRange[\s\S]*end > start[\s\S]*split\('\\n'\)[\s\S]*itemIndex \+= 1[\s\S]*`\$\{itemIndex\}\. \$\{clean\}`/, 'mini program feedback editor should number only selected non-empty lines');
assert.match(scheduleJs, /feedbackApplyListStyleToRange[\s\S]*style === 'bullet'[\s\S]*`• \$\{clean\}`/, 'mini program feedback editor should use the normal bullet glyph');
assert.match(scheduleWxml, /bindselect="onFeedbackSelect"/, 'mini program feedback textareas should record selected text ranges for list formatting');
assert.doesNotMatch(scheduleJs, /return `\$\{next\}· `|return '· '/, 'mini program feedback list continuation should not insert the tiny middle dot as bullet');
assert.match(scheduleJs, /feedbackFocusedField:\s*field/, 'mini program list style buttons should focus the target feedback field after inserting the marker');
assert.match(scheduleJs, /feedbackListStyle[\s\S]*普通[\s\S]*编号[\s\S]*圆点/, 'mini program feedback editor should expose typing list style options');
assert.doesNotMatch(scheduleWxml, /posterListStyleOptions[\s\S]*posterListStyleText/, 'mini program poster should not reformat all lines after coaches already typed the structure');
assert.doesNotMatch(scheduleJs, /highlight: keywords\.includes\(part\)/, 'mini program poster should not auto-highlight guessed keywords');
assert.match(scheduleJs, /function posterSectionHasContent\(/, 'mini program poster should detect empty optional sections');
assert.match(scheduleJs, /posterSectionHasContent\(data\.knowledgePoint\)/, 'mini program poster should hide practice status when it is empty');
assert.doesNotMatch(scheduleJs, /posterMeasureTextBlock\(ctx, section\.text, contentWidth, \d+/, 'mini program poster should not cap long feedback text');
assert.match(scheduleJs, /const footerBaseY = 1212;[\s\S]*const contentBottom = currentY - 28;[\s\S]*canvasHeight: Math\.max\(1334, contentBottom \+ 240\),[\s\S]*footerY: footerBaseY/, 'mini program poster footer should stay fixed while content controls only the poster height');
assert.match(scheduleJs, /buildStudentDetailData/, 'student detail sheet should prepare mapped student profile data');
assert.match(scheduleJs, /selectedStudentDetail/, 'student detail sheet should keep its selected student data separately');
assert.match(scheduleJs, /showStudentDetail/, 'student detail sheet should use its own visibility state');
assert.match(scheduleJs, /formatStudentClassTime[\s\S]*endText[\s\S]*`\$\{dateText\} \$\{startText\}-\$\{endText\}`/, 'student detail latest class should show the full start-end time range');
assert.match(scheduleJs, /lessonRecordCountText/, 'student detail should summarize lesson history with both lesson units and record count');
assert.match(scheduleJs, /cumulative:\s*lessonRecordUnitsCompactText\(/, 'student list should show record count before lesson units');
assert.match(scheduleJs, /cumulative:\s*`\$\{lessonRecordCountText\(lessonRecordCount,\s*lessonUnitsCompleted\)\}`/, 'student detail should show record count and lesson units in one summary');
assert.match(scheduleJs, /return `\$\{recordCount\}\/\$\{lessonUnitsText\(lessonUnits\)\}`/, 'student list compact lesson summary should render records before lesson units');
assert.match(scheduleJs, /function studentPackageListText[\s\S]*return `\$\{lessonUnitsText\(summary\.remaining\)\}\/\$\{lessonUnitsText\(summary\.total\)\}`/, 'student list package summary should render remaining over total without extra text');
assert.match(scheduleJs, /function studentPackageBalanceText[\s\S]*return `\$\{lessonUnitsText\(summary\.remaining\)\}\/\$\{lessonUnitsText\(summary\.total\)\}`/, 'student detail package progress should render remaining over total like the web');
assert.match(scheduleJs, /type:\s*isOwner \? '归属' : '代课'/, 'student list tags should use compact ownership/substitute wording');
assert.match(scheduleJs, /showPackage:\s*isOwner && !!packageText/, 'substitute students should not show package data');
assert.match(scheduleJs, /function buildStudentLessonRecords[\s\S]*studentLedgerRows[\s\S]*completedStudentSchedules/, 'student detail should merge package ledger rows with schedule rows like the web');
assert.match(scheduleJs, /studentScheduleRaw/, 'mini program should keep a student-detail schedule set separate from the timetable schedule');
assert.match(scheduleJs, /function scheduleDurationLessonUnits[\s\S]*Math\.round\(\(end - start\) \/ 360000\) \/ 10/, 'mini program lesson units should derive a precise duration fallback from start and end time');
assert.match(scheduleJs, /function scheduleLessonUnits[\s\S]*Math\.max\(count,\s*durationUnits\)/, 'mini program lesson units should not let a stale lower lessonCount override a longer real lesson duration');
assert.match(scheduleJs, /function studentScheduleMeta[\s\S]*scheduleLessonUnits\(item\)/, 'student lesson record meta should display normalized lesson units');
assert.match(scheduleJs, /function buildStudentCards[\s\S]*buildStudentLessonRecords[\s\S]*lastClassAt[\s\S]*String\(b\.lastClassAt \|\| ''\)\.localeCompare\(String\(a\.lastClassAt \|\| ''\)\)/, 'mini program student cards should sort by latest completed lesson time descending');
assert.match(scheduleJs, /studentPackageProgressText/, 'student cards should derive package progress from entitlement balances');
assert.match(scheduleJs, /buildStudentCards\(data\.students \|\| \[\], data\.entitlements \|\| \[\], studentSchedule, coachName, data\.entitlementLedger \|\| \[\]\)/, 'student cards should consume entitlements and ledger-backed student schedules');
assert.doesNotMatch(scheduleJs, /packageText:\s*totalLessons \? `\$\{usedLessons\}\/\$\{totalLessons\}`/, 'student cards should not derive package progress from class usedLessons');
assert.match(scheduleJs, /scheduleConsumedLessonText\(selectedClass, entitlementLedger\)/, 'schedule detail should derive consumed lessons from entitlement ledger rows');
assert.match(scheduleJs, /const shiftsList = \[\];/, 'my classes tab should intentionally stay as an empty page after removing class concepts');
assert.match(scheduleJs, /STUDENT_DETAIL_RECORD_PREVIEW_COUNT\s*=\s*5/, 'student detail should default to showing the latest five lesson records');
assert.match(scheduleJs, /lessonRecordsShown/, 'student detail should keep a visible subset of lesson records for collapsed state');
assert.match(scheduleJs, /toggleStudentLessonRecords\(\)/, 'student detail should let the coach expand all lesson records');
assert.match(scheduleJs, /timetableScrollTop/, 'mini program schedule page should compute a vertical scroll position for the timetable');
assert.match(scheduleJs, /timetableScrollLeft/, 'mini program schedule page should compute a horizontal scroll position for the timetable');
assert.match(scheduleJs, /return Math\.max\(0,\s*Math\.round\(rpxToPx\(todayIndex \* TIMETABLE_DAY_WIDTH_RPX\)\)\);/, 'mini program timetable should align today to the first visible day column');
assert.match(scheduleJs, /const todayShownIds = new Set\(/, 'mini program schedule page should track today cards already rendered in the dashboard');
assert.match(scheduleJs, /buildWeekTodoGroups\(days,\s*now,\s*todayShownIds\)/, 'mini program weekly todos should receive dashboard shown ids for de-duplication');
assert.match(scheduleJs, /if\s*\(\s*day\.isToday\s*&&\s*todayShownIds\.has\(String\(item\.id\)\)\s*\)\s*return null;/, 'mini program weekly todos should skip classes that already appear in today dashboard');
assert.match(scheduleJs, /decorateTimetableDays\(buildTimetableDays\(schedule,\s*weekOffset,\s*now\)\)/, 'mini program timetable should build its window from the full schedule dataset so current week can preview next-week days');
assert.match(scheduleJs, /currentTimeText/, 'mini program schedule page should compute the current-time marker text');
assert.match(scheduleJs, /todayLabel:\s*today \? today\.label\.replace\(\s*\/\\s\+\/,\s*' '\s*\)/, 'dashboard today date should keep exactly one space between weekday and date');
assert.match(scheduleJs, /TIMETABLE_START_HOUR\s*=\s*7/, 'mini program current-time marker should use a 07:00-based timetable axis');
assert.match(scheduleJs, /TIMETABLE_END_HOUR\s*=\s*22/, 'mini program timetable should end at 22:00');
assert.match(scheduleJs, /Array\.from\(\{\s*length:\s*TIMETABLE_END_HOUR - TIMETABLE_START_HOUR \+ 1\s*\}/, 'mini program timetable hours should derive from the business-hour range');
assert.match(scheduleJs, /timetableNowSolidLineStyle/, 'mini program current-time marker should expose a solid segment for today');
assert.match(scheduleJs, /lastScheduleId:\s*lastRecord && lastRecord\.scheduleId/, 'mini program students should still carry their latest class id for summaries');
assert.doesNotMatch(scheduleWxml, /进入完整教练端/, 'native schedule page should not expose the old webview fallback entry');
assert.doesNotMatch(scheduleJs, /openWebview\(\)/, 'native schedule page should not keep the old webview jump handler');
assert.match(scheduleJs, /openAgreement\(\)/, 'schedule page should expose the user agreement menu action');
assert.match(scheduleJs, /openPrivacy\(\)/, 'schedule page should expose the privacy policy menu action');
assert.match(scheduleJs, /coachWorkbenchStats/, 'mini program workbench should keep the backend stats payload separately');
assert.match(scheduleJs, /workbenchState/, 'mini program workbench should use the backend workbenchState enum');
assert.match(scheduleJs, /function buildLocalWorkbenchStats/, 'mini program workbench should have a local stats fallback from the loaded schedule rows');
assert.match(scheduleJs, /mergeWorkbenchStats\(coachWorkbenchStats,\s*buildLocalWorkbenchStats\(schedule,\s*this\.data\.feedbacks,\s*now\)\)/, 'mini program workbench should fall back to local schedule stats when backend stats are still zero');
assert.match(scheduleJs, /overallTrialConversionRate/, 'mini program workbench should read the overall coach trial conversion fields');
assert.match(scheduleJs, /conversionText:[\s\S]*showOverallTrialStats[\s\S]*mergedStats\.overallTrialConversionRate[\s\S]*: \(hasOverallTrialStats \? '-' : '-'\)/, 'mini program workbench should fall back to - instead of the old month trial percent when overall stats are unavailable');
assert.match(scheduleJs, /relatedClassIds/, 'student detail should match lesson history through linked class ids as well as direct student ids');
assert.match(scheduleJs, /feedback:\s*mergedStats\.monthFeedbackCount \|\| 0/, 'mini program workbench should render backend or locally derived month feedback count');
assert.doesNotMatch(scheduleJs, /feedback:\s*'-'/, 'mini program workbench should not show a placeholder for month feedback count');
assert.doesNotMatch(scheduleJs, /item\.courseContent \|\| item\.productName \|\| item\.type/, 'shift cards should no longer guess course content from mixed front-end fields');
assert.doesNotMatch(scheduleJs, /item\.scheduleTime \|\| item\.classTime/, 'shift cards should no longer guess schedule time from mixed front-end fields');
assert.doesNotMatch(scheduleJs, /firstNonEmpty\(item\.remark,\s*item\.note,\s*item\.notes\)/, 'shift cards should no longer guess class remark from mixed front-end fields');

const scheduleUtils = require('../wechat-miniprogram/miniprogram/utils/schedule');
assert.strictEqual(
  scheduleUtils.classBlockStyle({ startTime: '2026-04-22 09:00', endTime: '2026-04-22 10:00' }).top,
  300,
  'timetable course blocks should be positioned from 07:00'
);
const todoNow = new Date('2026-04-21 12:00:00');
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 15:00', endTime: '2026-04-21 16:00', status: '已排课' }, todoNow),
  null,
  'future later courses should not expose a standalone later state'
);
assert.strictEqual(
  scheduleUtils.formatScheduleItem({ campus: 'shunyi_mapo', venue: '1号场' }).locationText,
  '顺义马坡 · 1号场',
  'mini program schedule items should render campus display names instead of raw campus codes'
);
assert.strictEqual(
  scheduleUtils.formatScheduleItem({ campus: '__external__', externalVenueName: '国网北区', externalCourtName: 'C1' }).locationText,
  '国网北区 · C1',
  'mini program schedule items should hide the internal external-campus sentinel value'
);
const sundayNow = new Date('2026-04-26 09:00:00');
const sundayWindow = scheduleUtils.buildTimetableDays([
  { id: 'sun', startTime: '2026-04-26 13:00', endTime: '2026-04-26 15:00', campus: 'shunyi_mapo', venue: '1号场' },
  { id: 'mon', startTime: '2026-04-27 09:00', endTime: '2026-04-27 11:00', campus: 'shunyi_mapo', venue: '1号场' },
  { id: 'tue', startTime: '2026-04-28 10:00', endTime: '2026-04-28 12:00', campus: 'shunyi_mapo', venue: '1号场' }
], 0, sundayNow);
assert.strictEqual(
  sundayWindow.length,
  9,
  'current-week timetable window should include two preview days from next week'
);
assert.strictEqual(
  sundayWindow[7].key,
  '2026-04-27',
  'current-week timetable window should preview next Monday after Sunday'
);
assert.strictEqual(
  sundayWindow[8].key,
  '2026-04-28',
  'current-week timetable window should preview next Tuesday after Sunday'
);
assert.strictEqual(
  sundayWindow[7].items.length,
  1,
  'current-week timetable preview should carry next-week schedule items'
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
assert.match(detailJs, /function hasStoredCoachSession/, 'native detail page should reuse stored coach session before WeChat login');
assert.match(detailJs, /if \(!hasStoredCoachSession\(\)\) await loginWithWechat\(\)/, 'native detail page should only call WeChat login when local token is missing');

const apiJs = readText('public/assets/scripts/core/api.js');
assert.match(apiJs, /WECHAT_CODE_KEY/, 'web app should keep the mini program login code until account login succeeds');
assert.match(apiJs, /\/auth\/wechat-bind/, 'web app should call the wechat bind API after account login');
assert.match(apiJs, /PENDING_SCHEDULE_ID_KEY/, 'web app should keep notification scheduleId until data is loaded');

const stateJs = readText('public/assets/scripts/core/state.js');
assert.match(stateJs, /openPendingScheduleDeepLink/, 'page data load should try to open a pending notification schedule');

const configJs = readText('wechat-miniprogram/miniprogram/config.js');
assert.match(configJs, /API_BASE_URL:\s*'https:\/\/www\.flowtennis\.cn\/api'/, 'config should expose the API base URL for native pages');
assert.doesNotMatch(configJs, /SCHEDULE_TEMPLATE_ID|COURSE_REMINDER_TEMPLATE_ID/, 'config should not keep one-time subscribe message template IDs');
assert.doesNotMatch(configJs, /WEB_VIEW_URL/, 'mini program config should no longer keep the removed webview URL');

const apiServerJs = readText('api/index.js');
const authRoutesJs = readText('server/auth-routes.js');
const corePageDataJs = readText('server/page-data/core-pages.js');
assert.match(authRoutesJs, /\/auth\/wechat-login/, 'API should support mini program login by bound openid');
assert.match(apiServerJs, /findWechatUserByOpenId/, 'API should find the bound coach account by openid');
assert.match(apiServerJs, /pages\/detail\/detail/, 'course reminders should still deep link to native course detail');
assert.match(apiServerJs, /pages\/schedule\/schedule\?scheduleId=.*action=feedback/, 'feedback reminders should deep link to the native feedback entry');
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
assert.match(apiServerJs, /overallTrialConversionRate/, 'workbench API should expose overall coach trial conversion stats for the mini program');
assert.match(apiServerJs, /workbenchState:/, 'workbench API should expose standard state enum for each schedule');
assert.match(corePageDataJs, /cappedScan\(T_ENTITLEMENTS\)/, 'workbench API should read entitlement balances for the mini program');
assert.match(corePageDataJs, /cappedScan\(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS\.entitlementLedger\)/, 'workbench API should read entitlement consume ledger for the mini program');
assert.match(corePageDataJs, /entitlements:scoped\.entitlements\|\|\[\]/, 'workbench API should return scoped entitlement balances');
assert.match(corePageDataJs, /entitlementLedger:scoped\.entitlementLedger\|\|\[\]/, 'workbench API should return scoped entitlement ledger');
assert.match(corePageDataJs, /studentSchedule:decoratedStudentSchedule/, 'workbench API should return an expanded schedule set for student details without changing the timetable schedule');

const miniApiJs = readText('wechat-miniprogram/miniprogram/utils/api.js');
assert.match(miniApiJs, /function saveCoachFeedback/, 'mini program API helper should provide feedback save');
assert.match(miniApiJs, /request\('\/feedbacks'/, 'mini program feedback save should call the feedback API');
assert.match(miniApiJs, /function loginWithPassword/, 'mini program API helper should provide account password login');
assert.match(miniApiJs, /function loginWithWechat/, 'mini program API helper should provide coach WeChat login');
assert.match(miniApiJs, /function bindWechatAfterLogin/, 'mini program API helper should provide WeChat bind after login');
assert.match(miniApiJs, /'X-FlowTennis-Client':\s*'coach-mini'/, 'mini program API helper should identify as the coach mini program');
assert.match(miniApiJs, /\/auth\/login/, 'mini program API helper should call the account login API');
assert.match(miniApiJs, /\/auth\/wechat-login/, 'mini program API helper should call the coach WeChat login API');
assert.match(miniApiJs, /\/auth\/wechat-bind/, 'mini program API helper should call the WeChat bind API');
assert.doesNotMatch(miniApiJs, /mini-match|MATCH_TOKEN_KEY|MATCH_USER_KEY|loginMatchWithWechat|loadMatchProfile|bindMatchPhoneByCode|createMatch|\/auth\/wechat-mini-login|\/match-profile/, 'mini program API helper should not keep match mini-program helpers');
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
assert.match(schedulePageJs, /未登录\|登录已过期\|401/, 'native schedule page should clear stale login and return to login when the token expires');
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
assert.match(scheduleWxss, /\.timetable-shell\s*\{[\s\S]*background:\s*#fff;[\s\S]*border-top-left-radius:\s*40rpx;[\s\S]*border-top-right-radius:\s*40rpx;/i, 'timetable shell should own the white rounded panel instead of the scroll container');
assert.doesNotMatch(scheduleWxss.match(/\.timetable-scroll\s*\{[\s\S]*?\n\}/)[0], /background:\s*#fff|border-top-left-radius|border-top-right-radius/i, 'timetable scroll container should no longer own the white shell background and radius');
assert.match(scheduleWxss, /\.today-detail-btn\s*\{[\s\S]*min-width:\s*92rpx;[\s\S]*padding:\s*0 20rpx;[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*center;/i, 'today detail button should use a flexible width so narrow phones do not truncate the label');
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
assert.match(scheduleWxss, /\.mini-metric text\.conversion-value\s*\{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*400;[\s\S]*color:\s*#64748B;/, 'empty conversion value should use the requested muted regular style with enough specificity');
assert.match(scheduleWxss, /\.mini-metric text\.conversion-value\.has-data\s*\{[\s\S]*color:\s*#0f172a;[\s\S]*font-size:\s*24px;[\s\S]*font-weight:\s*700;/, 'conversion number should keep the normal metric number style when data exists');
assert.match(scheduleWxss, /\.conversion-row\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*align-items:\s*baseline;[\s\S]*flex-wrap:\s*nowrap;[\s\S]*margin-top:\s*8px;[\s\S]*transform:\s*translateY\(-6px\);/, 'conversion value row should sit on the same vertical rhythm as other metric numbers without wrapping');
assert.match(scheduleWxss, /\.conversion-row text\s*\{[\s\S]*transform:\s*none;[\s\S]*margin-top:\s*0;/, 'conversion value row should cancel the generic metric text offset so the number does not overlap the label');
assert.match(scheduleWxss, /\.mini-metric text\.conversion-value\.has-data\s*\{[\s\S]*line-height:\s*1;/, 'conversion number should keep a tight line-height when data exists');
assert.match(scheduleWxss, /\.mini-metric text\.conversion-unit\s*\{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*400;[\s\S]*line-height:\s*1\.2;[\s\S]*color:\s*#64748B;/, 'conversion percent unit should reuse the label-sized muted style with stronger specificity');
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
assert.match(scheduleWxml, /button class="switch-btn switch-prev" bindtap="prevWeek"[\s\S]*button class="switch-btn switch-next" bindtap="nextWeek"/, 'timetable header should keep explicit previous and next week buttons');
assert.match(scheduleWxss, /\.week-switch\s*\{(?=[\s\S]*position:\s*relative;)(?=[\s\S]*padding:\s*0 36px;)/, 'week switch should reserve center space for the date label');
assert.match(scheduleWxss, /\.week-range\s*\{[\s\S]*white-space:\s*nowrap;/, 'week range text should stay on one line');
assert.match(scheduleWxss, /\.switch-btn\s*\{[\s\S]*position:\s*absolute;[\s\S]*width:\s*44px;[\s\S]*height:\s*36px;/, 'week switch buttons should use larger absolute-positioned tap targets');
assert.match(scheduleWxss, /\.switch-prev\s*\{[\s\S]*left:\s*0;/, 'previous-week button should sit on the left edge of the switch shell');
assert.match(scheduleWxss, /\.switch-next\s*\{[\s\S]*right:\s*0;/, 'next-week button should sit on the right edge of the switch shell');
assert.match(scheduleWxss, /\.switch-btn::before\s*\{[\s\S]*left:\s*50%;[\s\S]*top:\s*50%;[\s\S]*transform:\s*translate\(-50%,\s*-50%\);/, 'week switch icons should stay centered inside the larger tap target');
assert.match(scheduleWxss, /\.tt-hour-cell:first-child text\s*\{[\s\S]*margin-top:\s*8rpx;/, 'first visible timetable hour should keep a top safety space');
assert.match(scheduleWxss, /\.tt-time-axis,\s*\.tt-day-columns\s*\{[\s\S]*padding-bottom:\s*32rpx;/, 'timetable body should keep bottom safety space for the final hour label');
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
assert.match(scheduleWxss, /\.week-switch\s*\{[\s\S]*width:\s*188px;[\s\S]*height:\s*36px;[\s\S]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.1\);[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.15\);/i, 'timetable week switch should keep the translucent pill shell while leaving enough room for the date text');
assert.match(scheduleWxss, /\.switch-btn::before\s*\{[\s\S]*width:\s*8px;[\s\S]*height:\s*10px;[\s\S]*background-image:\s*url\("data:image\/svg\+xml/, 'timetable switch arrows should use the provided SVG chevron shape without distortion');
assert.match(scheduleWxss, /\.week-range\s*\{[\s\S]*font-size:\s*15px;[\s\S]*font-weight:\s*500;/, 'timetable week range text should use 15px medium');
assert.match(scheduleWxss, /\.back-week-btn\s*\{[\s\S]*width:\s*80px;[\s\S]*height:\s*36px;[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*500;/, 'timetable back-to-week button should match the SVG token');
assert.match(scheduleWxss, /\.timetable-shell\s*\{[\s\S]*margin-top:\s*-45px;[\s\S]*border-top-left-radius:\s*40rpx;[\s\S]*border-top-right-radius:\s*40rpx;/, 'timetable grid should sit in the SVG rounded white panel with 45px overlap');
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
assert.match(scheduleWxml, /feedback-sheet proposal-sheet \{\{proposalSheetClass\}\}/, 'coach proposal sheet should have its own height class');
assert.match(scheduleWxss, /\.proposal-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 300rpx\);/, 'coach proposal sheet should be taller than the feedback sheet');
assert.doesNotMatch(scheduleWxml, /selectedClassDetail\.basicInfo\.entitlementSource/, 'schedule detail should not display the source field');
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
assert.match(scheduleWxml, /detail-proposal-summary[\s\S]*学员级别 \/ 数量[\s\S]*教学目标/, 'proposal detail should mark the summary row separately from teaching goal');
assert.match(scheduleWxss, /\.detail-proposal-summary\s*\{[\s\S]*margin-bottom:\s*30rpx;/, 'proposal detail summary should leave enough space before teaching goal');
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
assert.match(scheduleWxss, /\.feedback-input\s*\{[\s\S]*min-height:\s*118rpx;[\s\S]*height:\s*auto;/, 'feedback inputs should use min-height instead of fixed height');
assert.match(scheduleWxss, /\.feedback-input-placeholder\s*\{[\s\S]*color:\s*#94a3b8;[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*400;/, 'feedback placeholder text should use the requested 14px regular muted token');
assert.match(scheduleWxss, /\.feedback-action-btn\s*\{[\s\S]*height:\s*88rpx;[\s\S]*border-radius:\s*44rpx;[\s\S]*font-size:\s*15px;/, 'feedback bottom buttons should use the 44px pill token');
assert.doesNotMatch(scheduleJs, /raw\[i\]\s*===\s*'\*'/, 'mini feedback poster should only use Chinese brackets as manual highlight markers');
assert.match(scheduleJs, /function posterLineMetrics\(/, 'mini feedback poster should calculate hanging indents for list lines');
assert.match(scheduleJs, /availableWidth[\s\S]*maxWidth\s*-\s*line\.hangingIndent[\s\S]*lineWidth\s*\+\s*width\s*>\s*availableWidth/, 'mini feedback poster should wrap indented continuation lines inside the card width');
assert.match(scheduleJs, /posterLineMetrics\(ctx,\s*lineGroups\)[\s\S]*currentX\s*=\s*x\s*\+\s*metrics\.indent[\s\S]*metrics\.paragraphGap/, 'mini feedback poster should draw wrapped list text with hanging indent and paragraph spacing');
assert.match(scheduleWxss, /\.poster-style-chip\s*\{[\s\S]*height:\s*64rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*font-size:\s*13px;/, 'poster style chips should match the 32px capsule token');
assert.match(scheduleWxss, /\.feedback-poster-canvas\s*\{[\s\S]*width:\s*560rpx;[\s\S]*height:\s*996rpx;[\s\S]*border-radius:\s*32rpx;/, 'poster canvas should keep the mapped preview container');
assert.match(scheduleWxss, /\.poster-action-btn\s*\{[\s\S]*height:\s*88rpx;[\s\S]*border-radius:\s*44rpx;[\s\S]*font-size:\s*15px;/, 'poster bottom buttons should use the 44px pill token');
assert.match(scheduleWxss, /\.student-detail-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 180rpx\);[\s\S]*background:\s*#f4f6f9;/, 'student detail sheet should match the lowered modal top offset and background');
assert.match(scheduleWxss, /\.schedule-create-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 180rpx\);/, 'native shift scheduling sheet should sit below the mini program top-right capsule');
assert.match(scheduleWxss, /\.cancel-schedule-sheet\s*\{[\s\S]*height:\s*calc\(100vh - 320rpx\);/, 'native cancel schedule sheet should use a shorter lower sheet');
assert.match(scheduleWxss, /\.shift-empty\s*\{[\s\S]*height:\s*160px;[\s\S]*border-radius:\s*16px;/, 'shift empty state should use the new native empty panel instead of mock cards');
assert.match(scheduleWxss, /\.student-detail-card\s*\{[\s\S]*padding:\s*40rpx;[\s\S]*border-radius:\s*32rpx;[\s\S]*background:\s*#fff;/, 'student detail cards should match the white rounded mapped sections');
assert.match(scheduleWxss, /\.student-detail-btn\s*\{[\s\S]*height:\s*96rpx;[\s\S]*border-radius:\s*48rpx;[\s\S]*background:\s*#f8fafc;/, 'student detail close button should match the bottom pill token');
assert.match(scheduleWxss, /\.student-record-toggle\s*\{[\s\S]*margin-top:\s*24rpx;[\s\S]*color:\s*#2b3a55;/, 'student detail should style the expand-all lesson history action as a clear inline button');
assert.match(scheduleWxss, /\.student-strong\s*\{[\s\S]*font-weight:\s*400;/, 'student list lesson and package values should use regular weight');
assert.match(scheduleWxss, /\.student-tag\s*\{[\s\S]*width:\s*80rpx;/, 'student ownership tags should use compact two-character width');
assert.match(scheduleWxss, /\.coach-title-row\s*\{[\s\S]*align-items:\s*center;/, 'mini program coach name row should vertically center the dropdown arrow');
assert.doesNotMatch(scheduleWxss, /\.dashboard-topbar\s*\{/, 'mini program workbench should not keep the removed custom top bar styles');
assert.doesNotMatch(scheduleWxss, /\.coach-status-pill\s*\{/, 'mini program workbench should not keep the removed connection pill styles');
assert.match(scheduleWxss, /\.sheet\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/, 'mini program bottom sheets should use a flex column layout so the body can scroll');
assert.doesNotMatch(scheduleWxss, /\.sheet-actions\s*\{[\s\S]*position:\s*absolute;/, 'mini program bottom sheet footer should not pin absolutely over scrollable content');

console.log('miniprogram shell tests passed');
