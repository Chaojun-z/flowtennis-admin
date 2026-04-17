给 Codex 的 UI 升级代码片段

Codex 请注意： 以下是经过设计的原生 HTML/CSS/JS UI 片段。当前项目为纯原生架构（无 React/Vue，无模块化构建工具）。
请将下面的 1. CSS样式、2. HTML 字符串渲染函数、3. 交互逻辑 JS，分别整合到项目 public/index.html 对应的位置。
请使用真实的业务数据结构来调用这些渲染函数，并绑定原有的真实 API 请求（如保存、删除、导出等）。

1. 纯净版 CSS 样式

Codex：请将此片段加入到全局 <style> 标签或对应的 CSS 块中。

/* 全局弱化 Placeholder 占位符颜色 */
::-webkit-input-placeholder { color: #C2B7AF !important; font-weight: normal; }
::-moz-placeholder { color: #C2B7AF !important; font-weight: normal; }
:-ms-input-placeholder { color: #C2B7AF !important; font-weight: normal; }
::placeholder { color: #C2B7AF !important; font-weight: normal; }

/* --- 学员管理模块样式 (前缀: tms-student-) --- */
.tms-student-container {
    width: 100%;
    box-sizing: border-box;
    font-family: sans-serif;
}

/* 顶部统计卡片 */
.tms-student-stats-row {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
}
.tms-student-stat-card {
    flex: 1;
    background-color: #FDF7F2;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.tms-student-stat-label { font-size: 13px; color: #8C7B6E; margin-bottom: 8px; }
.tms-student-stat-value { font-size: 28px; font-weight: bold; color: #332A24; }
.tms-student-stat-value span { font-size: 14px; font-weight: normal; margin-left: 4px; }
.tms-student-stat-sub { font-size: 12px; color: #A3968F; margin-top: 8px; }

/* 筛选工具栏 */
.tms-student-toolbar {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px; flex-wrap: wrap; gap: 12px;
}
.tms-student-filters {
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
}
.tms-student-input {
    padding: 8px 12px; border: none; border-radius: 6px;
    background-color: #FDF7F2; color: #5C4D43; font-size: 13px;
    outline: none; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
    width: 220px; box-sizing: border-box;
}
.tms-student-btn {
    padding: 8px 16px; border-radius: 6px; cursor: pointer;
    font-size: 13px; border: none; transition: opacity 0.2s;
}
.tms-student-btn:hover { opacity: 0.9; }
.tms-student-btn-ghost { background-color: #FDF7F2; color: #C06031; font-weight: bold; }
.tms-student-btn-primary { background-color: #e57c42; color: #FFFFFF; font-weight: bold; }

/* 表格区域 - 横向滑动与冻结列 */
.tms-student-table-container {
    background-color: #FDF7F2; border-radius: 8px;
    padding: 8px 0; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.tms-student-table {
    width: 100%; min-width: 1300px;
    border-collapse: separate; border-spacing: 0;
    text-align: left; font-size: 13px;
}
.tms-student-table th, .tms-student-table td {
    white-space: nowrap; padding: 16px 16px;
    border-bottom: 1px solid #EAE0D6; vertical-align: top;
}
.tms-student-table th { color: #8C7B6E; font-weight: normal; padding-top: 12px; padding-bottom: 12px; }
.tms-student-table tbody tr:last-child td { border-bottom: none; }
.tms-student-table tbody tr:hover td { background-color: #F4EBE3; }

/* 冻结左侧第一列 */
.tms-table-sticky-l {
    position: sticky; left: 0; background-color: #FDF7F2; z-index: 2;
}
.tms-table-sticky-l::after {
    content: ""; position: absolute; top: 0; right: 0; bottom: -1px; width: 6px;
    background: linear-gradient(to right, rgba(0,0,0,0.04), transparent);
    pointer-events: none; transform: translateX(100%);
}

/* 冻结右侧最后一列 */
.tms-table-sticky-r {
    position: sticky; right: 0; background-color: #FDF7F2; z-index: 2; text-align: right;
}
.tms-student-table th.tms-table-sticky-r { text-align: right; }
.tms-table-sticky-r::before {
    content: ""; position: absolute; top: 0; left: 0; bottom: -1px; width: 6px;
    background: linear-gradient(to left, rgba(0,0,0,0.04), transparent);
    pointer-events: none; transform: translateX(-100%);
}

.tms-student-table tbody tr:hover td.tms-table-sticky-l,
.tms-student-table tbody tr:hover td.tms-table-sticky-r { background-color: #F4EBE3; }
.tms-student-table th.tms-table-sticky-l, .tms-student-table th.tms-table-sticky-r { z-index: 3; }

/* 列表文字层级管理 */
.tms-text-primary { font-size: 14px; font-weight: bold; color: #332A24; }
.tms-text-secondary { font-size: 12px; color: #8C7B6E; margin-top: 6px; }
.tms-text-tertiary { font-size: 11px; color: #BDB3AC; }
.tms-text-remark {
    font-size: 12px; color: #A3968F; line-height: 1.5;
    white-space: normal; min-width: 140px; max-width: 200px; 
    display: -webkit-box; -webkit-box-orient: vertical;
    -webkit-line-clamp: 2; overflow: hidden; text-overflow: ellipsis;
}
.tms-tag {
    display: inline-block; background-color: #F1EAE2; color: #8C7B6E;
    padding: 2px 6px; border-radius: 4px; font-size: 11px;
    margin-left: 6px; font-weight: normal; vertical-align: middle;
}
.tms-student-badge {
    display: inline-block; padding: 4px 10px; border-radius: 12px;
    font-size: 12px; border: 1px solid transparent;
}
.tms-student-badge-active { background-color: #EAF4EA; color: #4CAF50; border-color: #A5D6A7; }
.tms-student-badge-pending { background-color: #FEF3E6; color: #F57C00; border-color: #FFCC80; }

.tms-student-action-link {
    color: #C06031; cursor: pointer; font-weight: bold;
    text-decoration: none; display: inline-block; margin-top: 2px;
}
.tms-student-action-link:hover { text-decoration: underline; }

/* 统一自定义下拉框 */
.tms-dropdown { position: relative; display: inline-block; }
.tms-dropdown.tms-dropdown-form { display: block; width: 100%; }
.tms-dropdown-display {
    padding: 8px 12px; border-radius: 6px; background-color: #FDF7F2;
    color: #5C4D43; font-size: 13px; cursor: pointer; display: flex;
    justify-content: space-between; align-items: center; min-width: 100px;
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); user-select: none;
    border: 1px solid transparent; box-sizing: border-box; transition: border-color 0.2s;
}
.tms-dropdown.tms-dropdown-form .tms-dropdown-display { padding: 12px; font-size: 14px; width: 100%; }
.tms-dropdown-display:hover { border-color: #EAE0D6; }
.tms-dropdown-display::after {
    content: ""; border-left: 4px solid transparent; border-right: 4px solid transparent;
    border-top: 5px solid #8C7B6E; margin-left: 8px;
}
.tms-dropdown-menu {
    position: absolute; top: calc(100% + 4px); left: 0;
    background-color: #FAF6F2; border: 1px solid #EAE0D6; border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08); z-index: 100; display: none;
    min-width: 100%; padding: 4px; box-sizing: border-box;
}
.tms-dropdown.open .tms-dropdown-menu { display: block; }
.tms-dropdown-item {
    padding: 8px 12px; font-size: 13px; color: #5C4D43; cursor: pointer;
    border-radius: 4px; display: flex; align-items: center; white-space: nowrap; transition: all 0.15s;
}
.tms-dropdown-item:hover { background-color: #F1EAE2; }
.tms-dropdown-item.active { background-color: #FCECE3; color: #C06031; font-weight: bold; }
.tms-dropdown-item.active::before { content: "✓"; margin-right: 6px; font-weight: bold; color: #C06031; }

/* 弹窗基础样式 */
.tms-modal-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.4); display: flex; justify-content: center;
    align-items: center; z-index: 1000; opacity: 0; visibility: hidden; transition: opacity 0.2s;
}
.tms-modal-overlay.show { opacity: 1; visibility: visible; }
.tms-modal-box {
    background-color: #E6E1DC; border-radius: 16px; width: 640px;
    max-height: 90vh; display: flex; flex-direction: column;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2); transform: translateY(20px); transition: transform 0.2s;
}
.tms-modal-overlay.show .tms-modal-box { transform: translateY(0); }
.tms-modal-header { padding: 24px 24px 16px; display: flex; justify-content: space-between; align-items: center; }
.tms-modal-title { font-size: 18px; font-weight: bold; color: #332A24; }
.tms-modal-close {
    cursor: pointer; width: 28px; height: 28px; background-color: #D9D0C7; border-radius: 50%;
    display: flex; justify-content: center; align-items: center; color: #5C4D43;
    font-size: 14px; font-weight: bold; transition: background-color 0.2s;
}
.tms-modal-close:hover { background-color: #C0B5AB; }
.tms-modal-body { padding: 0 24px 20px; overflow-y: auto; flex: 1; }
.tms-modal-body::-webkit-scrollbar { width: 6px; }
.tms-modal-body::-webkit-scrollbar-thumb { background: #D9D0C7; border-radius: 3px; }
.tms-modal-footer { padding: 16px 24px; display: flex; justify-content: space-between; border-radius: 0 0 16px 16px; }
.tms-modal-footer.right-align { justify-content: flex-end; }

/* 弹窗按钮 */
.tms-btn {
    padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;
    border: 1px solid transparent; transition: all 0.2s; font-weight: bold;
}
.tms-btn-default { background-color: transparent; border-color: #D9D0C7; border: 1px solid #D9D0C7; color: #5C4D43; }
.tms-btn-default:hover { background-color: #D9D0C7; }
.tms-btn-primary { background-color: #e57c42; color: #FFFFFF; }
.tms-btn-primary:hover { opacity: 0.9; }
.tms-btn-danger { background-color: transparent; color: #D32F2F; border: 1px solid #F8D7DA; }
.tms-btn-danger:hover { background-color: #F8D7DA; }

/* 表单样式 */
.tms-section-header {
    font-size: 12px; color: #C06031; font-weight: bold; margin: 20px 0 16px;
    display: flex; align-items: center;
}
.tms-section-header::after { content: ""; flex: 1; height: 1px; background-color: #D9D0C7; margin-left: 12px; }
.tms-form-row { display: flex; gap: 20px; margin-bottom: 16px; }
.tms-form-item { flex: 1; display: flex; flex-direction: column; position: relative; }
.tms-form-item.full-width { flex: none; width: 100%; }
.tms-form-label { font-size: 12px; color: #5C4D43; margin-bottom: 8px; }
.tms-form-control {
    background-color: #FDF7F2; border: 1px solid transparent; border-radius: 8px;
    padding: 12px; font-size: 14px; color: #332A24; outline: none; transition: border-color 0.2s;
    box-sizing: border-box; width: 100%;
}
.tms-form-control:focus { border-color: #C06031; }
textarea.tms-form-control { resize: vertical; min-height: 80px; }
.tms-form-readonly {
    background-color: #FDF7F2; border-radius: 8px; padding: 12px;
    font-size: 14px; color: #332A24; min-height: 20px; word-break: break-all; box-sizing: border-box;
}


2. HTML 渲染函数片段

Codex：请将以下纯原生 JS 渲染函数加入到项目中，并在实际业务流程中调用它们来替换旧页面的 HTML。请注意动态替换里面的 onclick 事件名称。

// --- 组件生成器：统一自定义下拉框 ---
function renderDropdownHtml(label, options, isForm = false) {
    const items = options.map(opt => 
        `<div class="tms-dropdown-item ${opt.active ? 'active' : ''}" onclick="selectTmsDropdownItem(this, event)">${opt.text}</div>`
    ).join('');
    
    const formClass = isForm ? 'tms-dropdown-form' : '';
    return `
        <div class="tms-dropdown ${formClass}" onclick="toggleTmsDropdown(this, event)">
            <div class="tms-dropdown-display">${label}</div>
            <div class="tms-dropdown-menu">
                ${items}
            </div>
        </div>
    `;
}

// --- 页面生成器：学员列表 (带统计卡片与横向滑动表格) ---
function renderStudentListHtml(pageData) {
    const statsHtml = `
        <div class="tms-student-stats-row">
            <div class="tms-student-stat-card">
                <div class="tms-student-stat-label">学员总数</div>
                <div class="tms-student-stat-value">${pageData.stats.total || 0}<span>人</span></div>
                <div class="tms-student-stat-sub">当前校区口径</div>
            </div>
            <div class="tms-student-stat-card">
                <div class="tms-student-stat-label">上课中</div>
                <div class="tms-student-stat-value">${pageData.stats.inClass || 0}<span>人</span></div>
                <div class="tms-student-stat-sub">&nbsp;</div>
            </div>
            <div class="tms-student-stat-card">
                <div class="tms-student-stat-label">待转化</div>
                <div class="tms-student-stat-value">${pageData.stats.pending || 0}<span>人</span></div>
                <div class="tms-student-stat-sub">&nbsp;</div>
            </div>
            <div class="tms-student-stat-card">
                <div class="tms-student-stat-label">订场/会员关联</div>
                <div class="tms-student-stat-value">${pageData.stats.linked || 0}<span>人</span></div>
                <div class="tms-student-stat-sub">活跃 30 天 0</div>
            </div>
        </div>
    `;

    const toolbarHtml = `
        <div class="tms-student-toolbar">
            <div class="tms-student-filters">
                <input type="text" class="tms-student-input" placeholder="搜索姓名/手机号/关联账户..." onchange="handleSearchInput(this.value)">
                
                ${renderDropdownHtml('全部类型', [{text:'全部类型', active:true}, {text:'成人', active:false}, {text:'青少年', active:false}])}
                ${renderDropdownHtml('全部来源', [{text:'全部来源', active:true}, {text:'小红书', active:false}, {text:'转介绍', active:false}])}
                ${renderDropdownHtml('全部状态', [{text:'全部状态', active:true}, {text:'上课中', active:false}, {text:'待转化', active:false}])}
                ${renderDropdownHtml('全部关联', [{text:'全部关联', active:true}, {text:'已关联', active:false}, {text:'未关联', active:false}])}

                <button class="tms-student-btn tms-student-btn-ghost" onclick="handleExportCsv()">导出CSV</button>
            </div>
            <button class="tms-student-btn tms-student-btn-primary" onclick="handleAddStudent()">+ 添加学员</button>
        </div>
    `;

    const tableRowsHtml = pageData.list.map(row => {
        const badgeClass = row.status === '上课中' ? 'tms-student-badge-active' : 'tms-student-badge-pending';
        return `
            <tr>
                <td class="tms-table-sticky-l" style="padding-left: 20px;">
                    <div style="display:flex; align-items:center;">
                        <div class="tms-text-primary">${row.name}</div>
                        <span class="tms-tag">${row.type}</span>
                    </div>
                    <div class="tms-text-secondary">${row.phone || row.id || '-'} · ${row.campus}</div>
                </td>
                <td><span class="tms-student-badge ${badgeClass}">${row.status}</span></td>
                <td><div class="tms-text-secondary" style="color:#332A24; margin-top:0;">${row.classInfo || '-'}</div></td>
                <td>
                    <div class="tms-text-secondary" style="color:#332A24; margin-top:0;">${row.lastClassDate || '-'}</div>
                    ${row.lastClassDaysAgo ? `<div class="tms-text-tertiary" style="margin-top:6px;">${row.lastClassDaysAgo}</div>` : ''}
                </td>
                <td><div class="tms-text-secondary" style="color:#332A24; margin-top:0;">${row.coach || '-'}</div></td>
                <td><div class="tms-text-secondary" style="color:#332A24; margin-top:0;">${row.packageInfo || '-'}</div></td>
                <td><div class="tms-text-secondary" style="color:#332A24; margin-top:0;">${row.linkStatus || '-'}</div></td>
                <td><div class="tms-text-secondary" style="color:#332A24; margin-top:0;">${row.source || '-'}</div></td>
                <td><div class="tms-text-remark" title="${row.remark || ''}">${row.remark || '-'}</div></td>
                <td class="tms-table-sticky-r" style="padding-right: 20px;">
                    <span class="tms-student-action-link" onclick="handleEditStudent('${row.id}')">查看编辑</span>
                </td>
            </tr>
        `;
    }).join('');

    const tableHtml = `
        <div class="tms-student-table-container">
            <table class="tms-student-table">
                <thead>
                    <tr>
                        <th class="tms-table-sticky-l" style="padding-left: 20px;">学员</th>
                        <th>当前状态</th>
                        <th>当前班次</th>
                        <th>最近上课</th>
                        <th>负责教练</th>
                        <th>课包/课时</th>
                        <th>订场/会员</th>
                        <th>来源</th>
                        <th>备注摘要</th>
                        <th class="tms-table-sticky-r" style="padding-right: 20px;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRowsHtml.length > 0 ? tableRowsHtml : '<tr><td colspan="10" style="text-align:center;">暂无数据</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    return `<div class="tms-student-container">${statsHtml}${toolbarHtml}${tableHtml}</div>`;
}

// --- 弹窗生成器：新增 / 编辑表单 ---
function getAddEditModalHtml(type, data = {}) {
    const title = type === 'add' ? '添加学员' : '编辑学员';
    const isEdit = type === 'edit';
    
    return `
        <div class="tms-modal-overlay show" id="tmsModalOverlay">
            <div class="tms-modal-box">
                <div class="tms-modal-header">
                    <div class="tms-modal-title">${title}</div>
                    <div class="tms-modal-close" onclick="closeTmsModal()">✕</div>
                </div>
                <div class="tms-modal-body">
                    <div class="tms-section-header">基本信息</div>
                    <div class="tms-form-row">
                        <div class="tms-form-item">
                            <label class="tms-form-label">姓名 *</label>
                            <input type="text" class="tms-form-control" placeholder="请输入学员姓名" value="${data.name || ''}">
                        </div>
                        <div class="tms-form-item">
                            <label class="tms-form-label">手机号码</label>
                            <input type="text" class="tms-form-control" placeholder="138****1234" value="${data.phone || ''}">
                        </div>
                    </div>
                    <div class="tms-form-row">
                        <div class="tms-form-item">
                            <label class="tms-form-label">学员类型</label>
                            ${renderDropdownHtml(data.type || '成人', [{text: '成人', active: data.type !== '青少年'}, {text: '青少年', active: data.type === '青少年'}], true)}
                        </div>
                        <div class="tms-form-item">
                            <label class="tms-form-label">来源</label>
                            ${renderDropdownHtml(data.source || '— 选择 —', [{text: '— 选择 —', active: !data.source}, {text: '小红书', active: data.source==='小红书'}, {text: '转介绍', active: data.source==='转介绍'}], true)}
                        </div>
                    </div>
                    <div class="tms-form-row">
                        <div class="tms-form-item">
                            <label class="tms-form-label">活动范围</label>
                            <input type="text" class="tms-form-control" placeholder="例：朝阳" value="${data.area || ''}">
                        </div>
                        <div class="tms-form-item">
                            <label class="tms-form-label">所在校区</label>
                            ${renderDropdownHtml(data.campus || '朝阳私教', [{text: '朝阳私教', active: true}, {text: '顺义马坡', active: false}], true)}
                        </div>
                    </div>
                    <div class="tms-form-row">
                        <div class="tms-form-item full-width">
                            <label class="tms-form-label">备注</label>
                            <textarea class="tms-form-control" placeholder="请输入跟进备注...">${data.remark || ''}</textarea>
                        </div>
                    </div>
                </div>
                <div class="tms-modal-footer ${isEdit ? '' : 'right-align'}">
                    ${isEdit ? `
                        <button class="tms-btn tms-btn-default" onclick="closeTmsModal()">取消</button>
                        <div style="display:flex; gap:12px;">
                            <button class="tms-btn tms-btn-danger" onclick="closeTmsModal()">删除</button>
                            <button class="tms-btn tms-btn-primary" onclick="closeTmsModal()">保存</button>
                        </div>
                    ` : `
                        <div style="display:flex; gap:12px;">
                            <button class="tms-btn tms-btn-default" onclick="closeTmsModal()">取消</button>
                            <button class="tms-btn tms-btn-primary" onclick="closeTmsModal()">保存</button>
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

// --- 弹窗生成器：查看详情 (View) ---
function getViewModalHtml(data) {
    return `
        <div class="tms-modal-overlay show" id="tmsModalOverlay">
            <div class="tms-modal-box" style="height: 85vh;">
                <div class="tms-modal-header">
                    <div class="tms-modal-title">学员详情</div>
                    <div class="tms-modal-close" onclick="closeTmsModal()">✕</div>
                </div>
                <div class="tms-modal-body">
                    <div class="tms-section-header">基本信息</div>
                    <div class="tms-form-row">
                        <div class="tms-form-item"><label class="tms-form-label">姓名</label><div class="tms-form-readonly">${data.name || '-'}</div></div>
                        <div class="tms-form-item"><label class="tms-form-label">手机号码</label><div class="tms-form-readonly">${data.phone || '-'}</div></div>
                    </div>
                    <div class="tms-form-row">
                        <div class="tms-form-item"><label class="tms-form-label">学员类型</label><div class="tms-form-readonly">${data.type || '-'}</div></div>
                        <div class="tms-form-item"><label class="tms-form-label">所在校区</label><div class="tms-form-readonly">${data.campus || '-'}</div></div>
                    </div>
                    
                    <div class="tms-section-header">教学信息</div>
                    <div class="tms-form-row">
                        <div class="tms-form-item"><label class="tms-form-label">当前状态</label><div class="tms-form-readonly"><span class="tms-student-badge tms-student-badge-active">${data.status || '上课中'}</span></div></div>
                        <div class="tms-form-item"><label class="tms-form-label">当前班次</label><div class="tms-form-readonly">${data.classInfo || '私教课'}</div></div>
                    </div>
                    <div class="tms-form-row">
                        <div class="tms-form-item"><label class="tms-form-label">负责教练</label><div class="tms-form-readonly">${data.coach || '朝阳'}</div></div>
                        <div class="tms-form-item"><label class="tms-form-label">最近上课</label><div class="tms-form-readonly">${data.lastClassDate || '-'}</div></div>
                    </div>
                    <div class="tms-form-row">
                        <div class="tms-form-item"><label class="tms-form-label">课包 / 课时</label><div class="tms-form-readonly">${data.packageInfo || '-'}</div></div>
                        <div class="tms-form-item"><label class="tms-form-label">最近排课备注</label><div class="tms-form-readonly">-</div></div>
                    </div>
                    <div class="tms-form-row">
                        <div class="tms-form-item full-width"><label class="tms-form-label">班次进度</label><div class="tms-form-readonly" style="white-space: pre-wrap;">私教课: 0/1, 朝阳\n私教课: 47/60, 朝阳</div></div>
                    </div>
                    
                    <div class="tms-section-header">运营信息</div>
                    <div class="tms-form-row">
                        <div class="tms-form-item"><label class="tms-form-label">来源</label><div class="tms-form-readonly">${data.source || '-'}</div></div>
                        <div class="tms-form-item"><label class="tms-form-label">活动范围</label><div class="tms-form-readonly">${data.area || '-'}</div></div>
                    </div>
                    
                    <div class="tms-section-header">消费与关联信息</div>
                    <div class="tms-form-row">
                        <div class="tms-form-item"><label class="tms-form-label">订场 / 会员</label><div class="tms-form-readonly">${data.linkStatus || '-'}</div></div>
                        <div class="tms-form-item"><label class="tms-form-label">最近订场</label><div class="tms-form-readonly">-</div></div>
                    </div>
                </div>
                <div class="tms-modal-footer">
                    <button class="tms-btn tms-btn-default" onclick="closeTmsModal()">关闭</button>
                    <!-- 注意：这里需要你实际对接打开编辑的函数 -->
                    <button class="tms-btn tms-btn-primary" onclick="openEditFromView('${data.id}')">编辑资料</button>
                </div>
            </div>
        </div>
    `;
}


3. 交互逻辑 JS 片段

Codex：请将以下基础的交互代码放在你的公共脚本中，处理下拉框和弹窗的开关。

// --- 交互：自定义下拉框处理 ---
window.toggleTmsDropdown = function(element, event) {
    event.stopPropagation();
    document.querySelectorAll('.tms-dropdown.open').forEach(el => {
        if(el !== element) {
            el.classList.remove('open');
            const formItem = el.closest('.tms-form-item');
            if (formItem) formItem.style.zIndex = '1';
        }
    });
    element.classList.toggle('open');
    
    // 解决弹窗内层级被遮挡问题
    const formItem = element.closest('.tms-form-item');
    if (formItem) {
        if(element.classList.contains('open')) {
            formItem.style.zIndex = '10';
        } else {
            formItem.style.zIndex = '1';
        }
    }
};

window.selectTmsDropdownItem = function(element, event) {
    event.stopPropagation();
    const menu = element.parentElement;
    const dropdown = menu.parentElement;
    const display = dropdown.querySelector('.tms-dropdown-display');
    
    menu.querySelectorAll('.tms-dropdown-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    display.innerText = element.innerText;
    dropdown.classList.remove('open');
    
    const formItem = dropdown.closest('.tms-form-item');
    if(formItem){
        formItem.style.zIndex = '1';
    }
    
    // Codex: 这里建议你可以暴露一个 onchange 回调机制，用于处理实际的数据更新
};

// 点击空白处收起所有下拉框
document.addEventListener('click', function() {
    document.querySelectorAll('.tms-dropdown.open').forEach(el => {
        el.classList.remove('open');
        const formItem = el.closest('.tms-form-item');
        if(formItem) formItem.style.zIndex = '1';
    });
});

// --- 交互：弹窗处理 ---
window.closeTmsModal = function() {
    const overlay = document.querySelector('.tms-modal-overlay');
    if(overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            // Codex: 请确保页面上有一个 id 为 tms-modal-container 的 div 挂载点
            const container = document.getElementById('tms-modal-container');
            if(container) container.innerHTML = '';
        }, 200);
    }
};
