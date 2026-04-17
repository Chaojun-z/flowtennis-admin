<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>订场用户预览</title>
    <style>
        /* 全屏 App 架构，干掉最外层原生滚动条 */
        body { 
            margin: 0; padding: 20px; background-color: #ba6f43; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
            height: 100vh; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column;
        }
        #main-content-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }

        /* 全局弱化 Placeholder 占位符颜色 */
        ::-webkit-input-placeholder { color: #C2B7AF !important; font-weight: normal; }
        ::-moz-placeholder { color: #C2B7AF !important; font-weight: normal; }
        :-ms-input-placeholder { color: #C2B7AF !important; font-weight: normal; }
        ::placeholder { color: #C2B7AF !important; font-weight: normal; }

        /* --- 核心基础样式复用 --- */
        .tms-container { width: 100%; box-sizing: border-box; font-family: sans-serif; flex: 1; display: flex; flex-direction: column; min-height: 0; }

        /* 顶部统计卡片 */
        .tms-stats-row { 
            display: flex; gap: 16px; margin-bottom: 16px; 
            flex-wrap: nowrap; overflow-x: auto; flex-shrink: 0;
            scrollbar-width: none; -ms-overflow-style: none;
        }
        .tms-stats-row::-webkit-scrollbar { display: none; }
        
        .tms-stat-card {
            flex: 1; min-width: 0;
            background-color: #FDF7F2; border-radius: 8px;
            padding: 16px 16px 36px 16px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.05); 
            display: flex; flex-direction: column; justify-content: flex-start;
            position: relative;
        }
        .tms-stat-label { font-size: 13px; color: #8C7B6E; margin-bottom: 6px; white-space: nowrap; }
        .tms-stat-value { font-size: 24px; font-weight: bold; color: #332A24; display: flex; align-items: baseline; white-space: nowrap; line-height: 1.2;}
        .tms-stat-value span { font-size: 14px; font-weight: normal; margin-left: 4px; }
        .tms-stat-sub { font-size: 12px; color: #A3968F; position: absolute; bottom: 12px; left: 16px; white-space: nowrap; }

        /* 工具栏 */
        .tms-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; flex-shrink: 0;}
        .tms-filters { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        
        /* 搜索、下拉框、按钮高度绝对统一 (height: 34px) */
        .tms-search-wrapper { position: relative; display: inline-block; width: 220px; }
        .tms-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #A3968F; pointer-events: none; }
        .tms-search-input {
            height: 34px; padding: 0 12px 0 34px; border: 1px solid transparent; border-radius: 6px; 
            background-color: #FFFFFF; color: #5C4D43; font-size: 13px; outline: none; 
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); width: 100%; box-sizing: border-box; transition: border-color 0.2s;
        }
        .tms-search-input:focus { border-color: #EAE0D6; }

        .tms-btn { 
            height: 34px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
            padding: 0 16px; border-radius: 6px; cursor: pointer; font-size: 13px; border: none; transition: all 0.2s; white-space: nowrap; font-weight: bold;
        }
        .tms-btn:hover { opacity: 0.9; }
        .tms-btn-ghost { background-color: #FFFFFF; color: #C06031; }
        .tms-btn-primary { background-color: #e57c42; color: #FFFFFF; }
        .tms-btn-danger { background-color: #FFF2F0; color: #D32F2F; border: 1px solid #FFCCC7; }
        .tms-btn-danger:hover { background-color: #FFCCC7; }
        .tms-btn-default { background-color: transparent; border: 1px solid #D9D0C7; color: #5C4D43; }
        .tms-btn-default:hover { background-color: #D9D0C7; }

        /* 表格容器结构重构：占满剩余高度 */
        .tms-table-card {
            background-color: #FDF7F2; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); 
            display: flex; flex-direction: column; overflow: hidden; flex: 1; min-height: 0;
        }
        
        /* 彻底隐藏表格滚动条，但保留滚动能力 */
        .tms-table-wrapper { 
            overflow: auto; flex: 1; min-height: 0; 
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none;  /* IE and Edge */
        }
        .tms-table-wrapper::-webkit-scrollbar { display: none; /* Chrome, Safari and Opera */ }

        .tms-table { width: 100%; min-width: 1600px; border-collapse: separate; border-spacing: 0; text-align: left; font-size: 13px; }
        
        .tms-table th, .tms-table td { white-space: nowrap; padding: 16px 16px; border-bottom: 1px solid #EAE0D6; vertical-align: middle; }
        
        /* 表头吸顶 */
        .tms-table th { 
            color: #8C7B6E; font-weight: normal; padding-top: 14px; padding-bottom: 14px; 
            position: sticky; top: 0; background-color: #FDF7F2; z-index: 11;
            box-shadow: inset 0 -1px 0 #EAE0D6; border-bottom: none;
        }
        .tms-table tbody tr:last-child td { border-bottom: none; }
        .tms-table tbody tr:hover td { background-color: #F4EBE3; }

        /* 左右列冻结 */
        .tms-sticky-l { position: sticky; left: 0; background-color: #FDF7F2; z-index: 10; }
        .tms-sticky-r { position: sticky; right: 0; background-color: #FDF7F2; z-index: 10; text-align: right; }
        .tms-table th.tms-sticky-l, .tms-table th.tms-sticky-r { z-index: 12; }
        .tms-sticky-l::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; width: 6px; background: linear-gradient(to right, rgba(0,0,0,0.04), transparent); pointer-events: none; transform: translateX(100%); }
        .tms-sticky-r::before { content: ""; position: absolute; top: 0; left: 0; bottom: 0; width: 6px; background: linear-gradient(to left, rgba(0,0,0,0.04), transparent); pointer-events: none; transform: translateX(-100%); }
        .tms-table tbody tr:hover td.tms-sticky-l, .tms-table tbody tr:hover td.tms-sticky-r { background-color: #F4EBE3; }

        /* 底部翻页组件 */
        .tms-pagination {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 20px; background-color: #FDF7F2; border-top: 1px solid #EAE0D6;
            color: #8C7B6E; font-size: 13px; flex-shrink: 0;
        }
        .tms-page-numbers { display: flex; gap: 4px; align-items: center; }
        .tms-page-btn {
            min-width: 28px; height: 28px; padding: 0 4px; display: flex; align-items: center; justify-content: center;
            border-radius: 6px; cursor: pointer; color: #5C4D43; transition: all 0.2s; user-select: none;
        }
        .tms-page-btn:hover { background-color: #EAE0D6; }
        .tms-page-btn.active { background-color: #C06031; color: #FFFFFF; font-weight: bold; }

        /* 排序表头样式 */
        .tms-sortable { cursor: pointer; user-select: none; transition: color 0.2s; }
        .tms-sortable:hover { color: #C06031; }
        .tms-sort-icon { display: inline-block; margin-left: 4px; font-size: 11px; color: #D9D0C7; transition: color 0.2s; font-family: monospace; font-weight: bold;}
        .tms-sortable:hover .tms-sort-icon, .tms-sortable.asc .tms-sort-icon, .tms-sortable.desc .tms-sort-icon { color: #C06031; }

        /* 文字与标签 */
        .tms-text-primary { font-size: 14px; font-weight: bold; color: #332A24; }
        .tms-text-secondary { font-size: 12px; color: #8C7B6E; margin-top: 4px; }
        .tms-text-remark { font-size: 12px; color: #A3968F; line-height: 1.5; white-space: normal; min-width: 140px; max-width: 200px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; text-overflow: ellipsis; }
        .tms-tag { display: inline-block; background-color: #F1EAE2; color: #8C7B6E; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: normal; }
        .tms-tag-green { background-color: #EAF4EA; color: #4CAF50; }
        .tms-tag-red { background-color: #FCECE3; color: #C06031; } 
        
        .tms-action-link { color: #C06031; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; padding: 6px 8px; border-radius: 6px; transition: background 0.2s;}
        .tms-action-link:hover { background-color: #F1EAE2; }

        /* 复选框样式 */
        .tms-checkbox-wrap { display: inline-flex; align-items: center; cursor: pointer; gap: 8px; font-size: 13px; color: #5C4D43; user-select: none; }
        .tms-checkbox { width: 16px; height: 16px; border: 1px solid #A3968F; border-radius: 4px; appearance: none; outline: none; cursor: pointer; position: relative; background-color: #FDF7F2; margin: 0; transition: all 0.2s; flex-shrink: 0;}
        .tms-checkbox:checked { background-color: #C06031; border-color: #C06031; }
        .tms-checkbox:checked::after { content: ''; position: absolute; left: 5px; top: 2px; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }

        /* 迷你数据进度条 */
        .tms-mini-bar { position: relative; display: inline-block; min-width: 80px; padding: 2px 0; }
        .tms-mini-bar-bg { position: absolute; left: 0; top: 0; bottom: 0; background-color: #F1EAE2; border-radius: 3px; z-index: 1; }
        .tms-mini-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; background-color: #DCA58B; border-radius: 3px; z-index: 2; opacity: 0.6; }
        .tms-mini-bar-text { position: relative; z-index: 3; font-weight: normal; color: #5C4D43; padding: 0 4px; font-size: 13px;}

        /* 下拉框与菜单 (绝对对齐高度) */
        .tms-dropdown { position: relative; display: inline-block; }
        .tms-dropdown.tms-dropdown-form { display: block; width: 100%; }
        .tms-dropdown-display { 
            height: 34px; box-sizing: border-box;
            padding: 0 12px; border-radius: 6px; background-color: #FFFFFF; color: #5C4D43; font-size: 13px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; min-width: 100px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); user-select: none; border: 1px solid transparent; 
        }
        .tms-dropdown.tms-dropdown-form .tms-dropdown-display { padding: 0 12px; font-size: 14px; width: 100%; background-color: #FDF7F2;}
        .tms-dropdown-display:hover { border-color: #EAE0D6; }
        .tms-dropdown-display::after { content: ""; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid #8C7B6E; margin-left: 8px; }
        .tms-dropdown-menu { position: absolute; top: calc(100% + 4px); left: 0; background-color: #FAF6F2; border: 1px solid #EAE0D6; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); z-index: 100; display: none; min-width: 100%; padding: 4px; box-sizing: border-box; max-height: 250px; overflow-y: auto;}
        .tms-dropdown.open .tms-dropdown-menu { display: block; }
        .tms-dropdown-item { padding: 8px 12px; font-size: 13px; color: #5C4D43; cursor: pointer; border-radius: 4px; display: flex; align-items: center; white-space: nowrap; }
        .tms-dropdown-item:hover { background-color: #F1EAE2; }
        .tms-dropdown-item.active { background-color: #FCECE3; color: #C06031; font-weight: bold; }
        .tms-dropdown-item.active::before { content: "✓"; margin-right: 6px; font-weight: bold; color: #C06031; }

        /* 底部翻页栏的专属下拉框（解决被底部裁切的问题） */
        .tms-pagination .tms-dropdown-display { height: 26px; padding: 0 8px; font-size: 12px; background-color: transparent; border: 1px solid #EAE0D6; box-shadow: none; min-width: 80px;}
        .tms-pagination .tms-dropdown-display:hover { background-color: #FFFFFF; }
        .tms-pagination .tms-dropdown-menu { top: auto; bottom: calc(100% + 4px); /* 向上弹出 */ }
        .tms-pagination .tms-dropdown-item { padding: 6px 10px; font-size: 12px; }

        /* 弹窗基础样式 */
        .tms-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; opacity: 0; visibility: hidden; transition: opacity 0.2s; }
        .tms-modal-overlay.show { opacity: 1; visibility: visible; }
        .tms-modal-box { background-color: #E6E1DC; border-radius: 16px; width: 680px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.2); transform: translateY(20px); transition: transform 0.2s; }
        .tms-modal-overlay.show .tms-modal-box { transform: translateY(0); }
        .tms-modal-header { padding: 24px 24px 16px; display: flex; justify-content: space-between; align-items: center; }
        .tms-modal-title { font-size: 18px; font-weight: bold; color: #332A24; }
        .tms-modal-close { cursor: pointer; width: 28px; height: 28px; background-color: #D9D0C7; border-radius: 50%; display: flex; justify-content: center; align-items: center; color: #5C4D43; font-size: 14px; font-weight: bold; transition: background-color 0.2s; }
        .tms-modal-close:hover { background-color: #C0B5AB; }
        
        .tms-modal-body { padding: 0 24px 20px; overflow-y: auto; flex: 1; scrollbar-width: none; -ms-overflow-style: none; }
        .tms-modal-body::-webkit-scrollbar { display: none; }
        .tms-modal-footer { padding: 16px 24px; display: flex; justify-content: space-between; border-radius: 0 0 16px 16px; background: #E6E1DC; }
        .tms-modal-footer.right-align { justify-content: flex-end; }

        /* 表单布局 */
        .tms-section-header { font-size: 12px; color: #C06031; font-weight: bold; margin: 24px 0 16px; display: flex; align-items: center; }
        .tms-section-header::after { content: ""; flex: 1; height: 1px; background-color: #D9D0C7; margin-left: 12px; }
        .tms-form-row { display: flex; gap: 20px; margin-bottom: 16px; }
        .tms-form-item { flex: 1; display: flex; flex-direction: column; position: relative; min-width: 0; }
        .tms-form-item.full-width { flex: none; width: 100%; }
        .tms-form-label { font-size: 12px; color: #5C4D43; margin-bottom: 8px; }
        
        /* 表单控件优化 */
        .tms-form-control { background-color: #FDF7F2; border: 1px solid transparent; border-radius: 8px; padding: 12px; font-size: 14px; color: #332A24; outline: none; transition: border-color 0.2s; box-sizing: border-box; width: 100%; }
        .tms-form-control:focus { border-color: #C06031; }
        input[type="date"].tms-form-control::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
        textarea.tms-form-control { resize: vertical; min-height: 80px; }
        .tms-form-readonly { background-color: #FDF7F2; border-radius: 8px; padding: 12px; font-size: 14px; color: #332A24; min-height: 20px; word-break: break-all; box-sizing: border-box; }

        /* 特殊表单区域：关联学员多选矩阵 */
        .tms-checkbox-matrix { background-color: #F1EAE2; border-radius: 8px; padding: 16px; display: flex; flex-wrap: wrap; gap: 12px 16px; border: 1px solid #EAE0D6; max-height: 150px; overflow-y: auto; }
        
        /* 只读卡片面板 (查看视图专用) */
        .tms-readonly-panel { background-color: #E6E1DC; border: 1px solid #D9D0C7; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
        .tms-readonly-panel .tms-form-control { background-color: #FAF6F2; border-color: #EAE0D6; pointer-events: none;}
        .tms-panel-tip { font-size: 13px; color: #5C4D43; margin-bottom: 16px; display: block; }
        
        /* 记录弹窗专用样式 */
        .tms-record-add-box { background-color: #FFFFFF; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #EAE0D6; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .tms-history-list { display: flex; flex-direction: column; gap: 12px; }
        .tms-history-item { background-color: #F1EAE2; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; color: #5C4D43; }
        .tms-history-item .amount { font-weight: bold; font-size: 14px; }
        .tms-history-item .amount.neg { color: #C06031; }
        .tms-history-item .amount.pos { color: #4CAF50; }
        .tms-history-item .desc { flex: 1; color: #8C7B6E; }
    </style>
</head>
<body>

    <div id="main-content-area"></div>
    <div id="tms-modal-container"></div>

    <script>
        // --- 1. Mock Data ---
        const generateMockList = () => {
            const base = [
                { id: '101', name: '王壮壮', phone: '-', campus: '顺义马坡', accountType: '普通', currentMember: '-', memberStatus: '未开卡', discount: '-', expiry: '-', contact: 'mira', familiarity: '-', attitude: '-', balance: 0, consumeAmount: 560, records: '1条', remark: '来源表：订场用户' },
                { id: '102', name: '穆子', phone: '-', campus: '顺义马坡', accountType: '普通', currentMember: '-', memberStatus: '未开卡', discount: '-', expiry: '-', contact: '小舟', familiarity: '-', attitude: '未知', balance: 0, consumeAmount: 0, records: '0条', remark: '来源表：约球；极少订场' },
                { id: '103', name: '4.12测试用户2号', phone: '-', campus: '朝阳私教', accountType: '会员', currentMember: '订场会员', memberStatus: '正常', discount: '8折', expiry: '2027-04-11', contact: '-', familiarity: '-', attitude: '-', balance: 18494, consumeAmount: 0, records: '4条', remark: '-' },
                { id: '104', name: 'piu🌙', phone: '-', campus: '顺义马坡', accountType: '普通', currentMember: '-', memberStatus: '未开卡', discount: '-', expiry: '-', contact: 'mira', familiarity: '老用户', attitude: '没有咨询过，先聊聊看', balance: 0, consumeAmount: 1570, records: '1条', remark: '来源表：订场用户' },
                { id: '105', name: '自动白测 1775...', phone: '13995520158', campus: '顺义马坡', accountType: '会员', currentMember: '自动白测...', memberStatus: '正常', discount: '8折', expiry: '2027-04-11', contact: '-', familiarity: '-', attitude: '-', balance: 2199, consumeAmount: 0, records: '1条', remark: '-' }
            ];
            let list = [...base];
            for(let i=6; i<=20; i++) {
                list.push({...base[0], id: '10'+i, name: '测试长列表学员 ' + i});
            }
            return list;
        };

        const mockData = {
            stats: { total: 138, balance: '¥41,035', lowBalance: 0, recharge: '¥47,000', consume: '¥116,830', actual: '¥154,380' },
            list: generateMockList()
        };

        function getTimeOptions(defaultTime) {
            let opts = [];
            for(let h=8; h<=22; h++) {
                let hh = h.toString().padStart(2, '0');
                opts.push({text: `${hh}:00`, active: defaultTime === `${hh}:00`});
                if(h !== 22) opts.push({text: `${hh}:30`, active: defaultTime === `${hh}:30`});
            }
            if(!opts.find(o => o.active)) opts[0].active = true;
            return opts;
        }

        // --- 组件：自定义下拉框 ---
        function renderDropdownHtml(label, options, isForm = false) {
            const activeOpt = options.find(o => o.active);
            const displayLabel = activeOpt ? activeOpt.text : label;

            const items = options.map(opt => `<div class="tms-dropdown-item ${opt.active ? 'active' : ''}" onclick="selectTmsDropdownItem(this, event)">${opt.text}</div>`).join('');
            return `<div class="tms-dropdown ${isForm ? 'tms-dropdown-form' : ''}" onclick="toggleTmsDropdown(this, event)">
                        <div class="tms-dropdown-display">${displayLabel}</div>
                        <div class="tms-dropdown-menu">${items}</div>
                    </div>`;
        }

        // --- 组件：迷你数据条 ---
        function renderMiniBar(value, max = 20000) {
            const displayVal = value > 0 ? `¥${value.toLocaleString()}` : '¥0';
            const percent = value > 0 ? Math.min((value / max) * 100, 100) : 0;
            return `
                <div class="tms-mini-bar">
                    <div class="tms-mini-bar-bg" style="width: 100%;"></div>
                    <div class="tms-mini-bar-fill" style="width: ${percent}%;"></div>
                    <div class="tms-mini-bar-text">${displayVal}</div>
                </div>
            `;
        }

        // --- 页面渲染：订场用户列表 ---
        function renderBookingListHtml(pageData) {
            const stats = pageData.stats;
            
            const statsHtml = `
                <div class="tms-stats-row">
                    <div class="tms-stat-card">
                        <div class="tms-stat-label">订场用户</div>
                        <div class="tms-stat-value">${stats.total}<span>人</span></div>
                    </div>
                    <div class="tms-stat-card">
                        <div class="tms-stat-label">余额合计</div>
                        <div class="tms-stat-value">${stats.balance}</div>
                        <div class="tms-stat-sub">低余额 ${stats.lowBalance}</div>
                    </div>
                    <div class="tms-stat-card">
                        <div class="tms-stat-label">累计充值</div>
                        <div class="tms-stat-value">${stats.recharge}</div>
                    </div>
                    <div class="tms-stat-card">
                        <div class="tms-stat-label">累计消费</div>
                        <div class="tms-stat-value">${stats.consume}</div>
                    </div>
                    <div class="tms-stat-card">
                        <div class="tms-stat-label">累计实收</div>
                        <div class="tms-stat-value">${stats.actual}</div>
                    </div>
                </div>
            `;

            const moreActionsOptions = [
                {text: '导入CSV', active: false},
                {text: '财务迁移预览', active: false},
                {text: '备份', active: false}
            ];
            
            const toolbarHtml = `
                <div class="tms-toolbar">
                    <div class="tms-filters">
                        <div class="tms-search-wrapper">
                            <svg class="tms-search-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input type="text" class="tms-search-input" placeholder="搜索姓名或手机号">
                        </div>
                        
                        ${renderDropdownHtml('全部账户', [{text: '全部账户', active: true}, {text: '普通', active: false}, {text: '会员', active: false}], false)}
                        ${renderDropdownHtml('全部对接人', [{text: '全部对接人', active: true}, {text: 'mira', active: false}, {text: '小舟', active: false}], false)}
                        
                        <button class="tms-btn tms-btn-ghost">导出</button>
                        ${renderDropdownHtml('更多操作', moreActionsOptions, false)}
                        
                        <button id="btn-bulk-delete" class="tms-btn tms-btn-danger" style="display:none; margin-left: 8px;">批量删除</button>
                    </div>
                    <button class="tms-btn tms-btn-primary" onclick="handleAddBookingUser()">+ 添加订场用户</button>
                </div>
            `;

            const tableRowsHtml = pageData.list.map(row => {
                const typeTag = row.accountType === '会员' ? '<span class="tms-tag tms-tag-green">会员</span>' : '<span class="tms-tag">普通</span>';
                
                return `
                    <tr>
                        <td class="tms-sticky-l" style="padding-left: 20px;">
                            <label class="tms-checkbox-wrap" style="margin-bottom: 0;">
                                <input type="checkbox" class="tms-checkbox row-checkbox" onchange="handleCheckboxChange()">
                                <span class="tms-text-primary" style="margin-left:4px;">${row.name}</span>
                            </label>
                        </td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.phone}</div></td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.campus}</div></td>
                        <td>${typeTag}</td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.currentMember}</div></td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.memberStatus}</div></td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.discount}</div></td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.expiry}</div></td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.contact}</div></td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.familiarity}</div></td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.attitude}</div></td>
                        <td>${renderMiniBar(row.balance)}</td>
                        <td>${renderMiniBar(row.consumeAmount)}</td>
                        <td><div class="tms-text-secondary" style="color:#332A24; margin:0;">${row.records}</div></td>
                        <td><div class="tms-text-remark" title="${row.remark}">${row.remark}</div></td>
                        
                        <td class="tms-sticky-r" style="padding-right: 20px; text-align:right;">
                            <span class="tms-action-link" onclick="handleViewAccount('${row.id}')">账户</span>
                            <span class="tms-action-link" onclick="handleEditBookingUser('${row.id}')">编辑</span>
                            <span class="tms-action-link" onclick="handleViewRecords('${row.id}')">记录</span>
                        </td>
                    </tr>
                `;
            }).join('');

            // 新增：向上的分页每页条数选择器
            const pageSizeDropdown = renderDropdownHtml('20条/页', [
                {text: '20条/页', active: true},
                {text: '50条/页', active: false},
                {text: '100条/页', active: false}
            ], false);

            const tableHtml = `
                <div class="tms-table-card">
                    <div class="tms-table-wrapper">
                        <table class="tms-table">
                            <thead>
                                <tr>
                                    <th class="tms-sticky-l" style="padding-left: 20px;">
                                        <label class="tms-checkbox-wrap">
                                            <input type="checkbox" class="tms-checkbox" onclick="handleSelectAll(this)">
                                            <span style="margin-left:4px;">姓名</span>
                                        </label>
                                    </th>
                                    <th>手机号</th>
                                    <th>校区</th>
                                    <th>账户类型</th>
                                    <th>当前会员</th>
                                    <th>会员状态</th>
                                    <th>当前折扣</th>
                                    <th class="tms-sortable" onclick="handleSort(this)">会员到期 <span class="tms-sort-icon">↕</span></th>
                                    <th>对接人</th>
                                    <th>熟悉程度</th>
                                    <th>对储值态度</th>
                                    <th class="tms-sortable" onclick="handleSort(this)">当前余额 <span class="tms-sort-icon">↕</span></th>
                                    <th class="tms-sortable" onclick="handleSort(this)">消费金额 <span class="tms-sort-icon">↕</span></th>
                                    <th>充值/消费记录</th>
                                    <th>备注</th>
                                    <th class="tms-sticky-r" style="padding-right: 20px; text-align:right;">操作</th>
                                </tr>
                            </thead>
                            <tbody>${tableRowsHtml}</tbody>
                        </table>
                    </div>
                    
                    <div class="tms-pagination">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div>共 138 条</div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${pageSizeDropdown}
                            </div>
                        </div>
                        <div class="tms-page-numbers">
                            <div class="tms-page-btn active">1</div>
                            <div class="tms-page-btn">2</div>
                            <div class="tms-page-btn">3</div>
                            <div class="tms-page-btn">4</div>
                            <div class="tms-page-btn">5</div>
                        </div>
                    </div>
                </div>
            `;

            return `<div class="tms-container">${statsHtml}${toolbarHtml}${tableHtml}</div>`;
        }

        // --- 弹窗渲染：新增 / 编辑 用户基础信息 ---
        function getBookingAddEditModalHtml(type, data = {}) {
            const title = type === 'add' ? '添加订场用户' : '编辑订场用户';
            const isEdit = type === 'edit';
            
            const mockStudents = ['姜盼', '测试1号学员', '佑佑', 'misha', '黄总', '赵雨桐', '线熙宇', '李铁', '丫丫', '润瑾', '简先生', '马杰', 'Oliver', 'J'];
            const checkboxesHtml = mockStudents.map(name => `
                <label class="tms-checkbox-wrap"><input type="checkbox" class="tms-checkbox"> <span>${name}</span></label>
            `).join('');

            return `
                <div class="tms-modal-overlay show">
                    <div class="tms-modal-box">
                        <div class="tms-modal-header">
                            <div class="tms-modal-title">${title}</div>
                            <div class="tms-modal-close" onclick="closeTmsModal()">✕</div>
                        </div>
                        <div class="tms-modal-body">
                            <div class="tms-section-header" style="margin-top:0;">基本信息</div>
                            <div class="tms-form-row">
                                <div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input type="text" class="tms-form-control" placeholder="请输入" value="${data.name || ''}"></div>
                                <div class="tms-form-item"><label class="tms-form-label">手机号</label><input type="text" class="tms-form-control" placeholder="13800138000" value="${data.phone && data.phone !== '-' ? data.phone : ''}"></div>
                            </div>
                            
                            <div class="tms-form-row">
                                <div class="tms-form-item full-width">
                                    <label class="tms-form-label">关联学员 (可多选)</label>
                                    <div class="tms-checkbox-matrix">${checkboxesHtml}</div>
                                </div>
                            </div>

                            <div class="tms-form-row">
                                <div class="tms-form-item"><label class="tms-form-label">校区</label>${renderDropdownHtml('校区', [{text: '顺义马坡', active: true}, {text: '朝阳私教', active: false}], true)}</div>
                                <div class="tms-form-item"><label class="tms-form-label">加入日期</label><input type="date" class="tms-form-control" value="2026-04-13"></div>
                            </div>

                            <div class="tms-form-row">
                                <div class="tms-form-item"><label class="tms-form-label">累计充值</label><input type="number" class="tms-form-control" value="0"></div>
                                <div class="tms-form-item"><label class="tms-form-label">当前余额</label><input type="number" class="tms-form-control" value="${data.balance || 0}"></div>
                            </div>
                            <div class="tms-form-row">
                                <div class="tms-form-item"><label class="tms-form-label">累计消费</label><input type="number" class="tms-form-control" value="${data.consumeAmount || 0}"></div>
                                <div class="tms-form-item"><label class="tms-form-label">累计实收</label><input type="number" class="tms-form-control" value="0"></div>
                            </div>

                            <div class="tms-form-row">
                                <div class="tms-form-item"><label class="tms-form-label">对接人</label><input type="text" class="tms-form-control" value="${data.contact && data.contact !== '-' ? data.contact : ''}"></div>
                                <div class="tms-form-item"><label class="tms-form-label">对储值态度</label><input type="text" class="tms-form-control" value="${data.attitude && data.attitude !== '-' ? data.attitude : ''}"></div>
                            </div>
                            
                            <div class="tms-form-row">
                                <div class="tms-form-item"><label class="tms-form-label">熟悉程度</label><input type="text" class="tms-form-control" value="${data.familiarity && data.familiarity !== '-' ? data.familiarity : ''}"></div>
                                <div class="tms-form-item"></div>
                            </div>

                            <div class="tms-form-row" style="margin-bottom:0;">
                                <div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="tms-form-control">${data.remark && data.remark !== '-' ? data.remark : ''}</textarea></div>
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

        // --- 弹窗渲染：查看会员账户 (View) ---
        function getBookingViewModalHtml(data) {
            return `
                <div class="tms-modal-overlay show">
                    <div class="tms-modal-box" style="width: 500px;">
                        <div class="tms-modal-header">
                            <div class="tms-modal-title">${data.name} · 会员账户</div>
                            <div class="tms-modal-close" onclick="closeTmsModal()">✕</div>
                        </div>
                        <div class="tms-modal-body">
                            <div class="tms-section-header" style="margin-top:0;">会员账户</div>
                            
                            <div class="tms-readonly-panel">
                                <span class="tms-panel-tip">余额来自 courts.history，仅展示不可直接修改</span>
                                
                                <div class="tms-form-row">
                                    <div class="tms-form-item"><label class="tms-form-label">当前方案</label><input class="tms-form-control" value="—" readonly></div>
                                    <div class="tms-form-item"><label class="tms-form-label">会员状态</label><input class="tms-form-control" value="未开卡" readonly></div>
                                </div>
                                <div class="tms-form-row">
                                    <div class="tms-form-item"><label class="tms-form-label">当前折扣</label><input class="tms-form-control" value="—" readonly></div>
                                    <div class="tms-form-item"><label class="tms-form-label">当前余额</label><input class="tms-form-control" value="¥0" readonly></div>
                                </div>
                                <div class="tms-form-row">
                                    <div class="tms-form-item"><label class="tms-form-label">余额有效期</label><input class="tms-form-control" value="—" readonly></div>
                                    <div class="tms-form-item"><label class="tms-form-label">最晚清零日</label><input class="tms-form-control" value="—" readonly></div>
                                </div>
                                
                                <div class="tms-form-row">
                                    <div class="tms-form-item full-width">
                                        <label class="tms-form-label">权益批次</label>
                                        <div style="font-size: 13px; color: #8C7B6E; margin-bottom: 12px;">暂无权益批次</div>
                                    </div>
                                </div>
                                <div class="tms-form-row">
                                    <div class="tms-form-item full-width">
                                        <label class="tms-form-label">最近购买记录</label>
                                        <div style="font-size: 13px; color: #8C7B6E; margin-bottom: 16px;">—</div>
                                    </div>
                                </div>
                                
                                <div class="tms-form-row" style="margin-bottom:0;">
                                    <div class="tms-form-item full-width">
                                        <label class="tms-form-label">操作</label>
                                        <div><button class="tms-btn tms-btn-ghost" style="border: 1px solid #EAE0D6; background: #fff;">首次开卡</button></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="tms-modal-footer">
                            <button class="tms-btn tms-btn-default" style="width: 100%; text-align: center;" onclick="closeTmsModal()">关闭</button>
                        </div>
                    </div>
                </div>
            `;
        }

        // --- 重构的 3 行版 充值/消费 弹窗 ---
        function getRecordModalHtml(data) {
            const typeOpts = [{text: '充值', active: false}, {text: '消费', active: true}, {text: '退款', active: false}, {text: '冲正', active: false}];
            const courseOpts = [{text: '订场', active: true}, {text: '私教课', active: false}, {text: '班课', active: false}, {text: '其他', active: false}];
            const payOpts = [{text: '微信', active: true}, {text: '支付宝', active: false}, {text: '现金', active: false}, {text: '储值扣款', active: false}];
            const campusOpts = [{text: '朝阳私教', active: false}, {text: '顺义马坡', active: true}, {text: '朝阳十里堡', active: false}];
            const courtOpts = [{text: '1号场', active: true}, {text: '2号场', active: false}, {text: '无场地', active: false}];

            return `
                <div class="tms-modal-overlay show">
                    <div class="tms-modal-box" style="width: 780px;">
                        <div class="tms-modal-header">
                            <div class="tms-modal-title">${data.name} · 充值/消费记录</div>
                            <div class="tms-modal-close" onclick="closeTmsModal()">✕</div>
                        </div>
                        <div class="tms-modal-body">
                            
                            <div class="tms-record-add-box">
                                <div class="tms-form-row">
                                    <div class="tms-form-item" style="flex:1;">${renderDropdownHtml('类型', typeOpts, true)}</div>
                                    <div class="tms-form-item" style="flex:1;">${renderDropdownHtml('项目', courseOpts, true)}</div>
                                    <div class="tms-form-item" style="flex:1;">${renderDropdownHtml('支付', payOpts, true)}</div>
                                    <div class="tms-form-item" style="flex:1;">${renderDropdownHtml('校区', campusOpts, true)}</div>
                                    <div class="tms-form-item" style="flex:1;">${renderDropdownHtml('场地', courtOpts, true)}</div>
                                </div>
                                
                                <div class="tms-form-row">
                                    <div class="tms-form-item" style="flex: 1;"><input type="date" class="tms-form-control" value="2026-04-11"></div>
                                    <div class="tms-form-item" style="flex: 1.5; flex-direction: row; align-items: center; gap: 8px;">
                                        <div style="flex: 1; min-width: 0;">${renderDropdownHtml('08:00', getTimeOptions('08:00'), true)}</div>
                                        <div style="color: #8C7B6E;">至</div>
                                        <div style="flex: 1; min-width: 0;">${renderDropdownHtml('10:00', getTimeOptions('10:00'), true)}</div>
                                    </div>
                                    <div class="tms-form-item" style="flex: 1;"><input type="number" class="tms-form-control" placeholder="¥ 发生金额"></div>
                                </div>
                                
                                <div class="tms-form-row" style="margin-bottom: 0;">
                                    <div class="tms-form-item" style="flex: 1;">
                                        <input type="text" class="tms-form-control" placeholder="备注信息 (非必填)">
                                    </div>
                                    <div class="tms-form-item" style="flex: none; width: 100px;">
                                        <button class="tms-btn tms-btn-primary" style="width: 100%; height: 100%; padding: 0;">添加</button>
                                    </div>
                                </div>
                            </div>

                            <div class="tms-section-header" style="margin-top:0;">历史记录</div>
                            <div class="tms-history-list">
                                <div class="tms-history-item">
                                    <div style="width: 80px;">2026-04-11</div>
                                    <span class="tms-tag tms-tag-red">消费</span>
                                    <div class="amount neg">-¥560</div>
                                    <div class="desc">导入 · 历史消费 · 期初导入汇总</div>
                                </div>
                                <div class="tms-history-item">
                                    <div style="width: 80px;">2026-03-20</div>
                                    <span class="tms-tag tms-tag-green">充值</span>
                                    <div class="amount pos">+¥1,000</div>
                                    <div class="desc">微信扫码付款 · 订场储值活动</div>
                                </div>
                            </div>

                        </div>
                        <div class="tms-modal-footer">
                            <button class="tms-btn tms-btn-default" style="width: 100%; text-align: center;" onclick="closeTmsModal()">关闭</button>
                        </div>
                    </div>
                </div>
            `;
        }

        // --- 交互逻辑 ---

        // 排序操作
        window.handleSort = function(element) {
            const icon = element.querySelector('.tms-sort-icon');
            const isAsc = element.classList.contains('asc');
            const isDesc = element.classList.contains('desc');
            
            document.querySelectorAll('.tms-sortable').forEach(el => {
                el.classList.remove('asc', 'desc');
                if(el.querySelector('.tms-sort-icon')) {
                    el.querySelector('.tms-sort-icon').innerText = '↕';
                }
            });

            if (!isAsc && !isDesc) {
                element.classList.add('asc');
                icon.innerText = '↑';
            } else if (isAsc) {
                element.classList.add('desc');
                icon.innerText = '↓';
            }
        };
        
        // 复选框变化时，显示/隐藏批量删除
        window.handleCheckboxChange = function() {
            const checkboxes = document.querySelectorAll('tbody .row-checkbox');
            let anyChecked = false;
            checkboxes.forEach(cb => { if(cb.checked) anyChecked = true; });
            
            const bulkBtn = document.getElementById('btn-bulk-delete');
            if (bulkBtn) {
                bulkBtn.style.display = anyChecked ? 'inline-block' : 'none';
            }
        };

        // 全选
        window.handleSelectAll = function(el) {
            const checkboxes = document.querySelectorAll('tbody .row-checkbox');
            checkboxes.forEach(cb => cb.checked = el.checked);
            handleCheckboxChange();
        };

        // 下拉框展开
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
            const formItem = element.closest('.tms-form-item');
            if (formItem) formItem.style.zIndex = element.classList.contains('open') ? '10' : '1';
        };

        // 下拉框选中
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
            if(formItem) formItem.style.zIndex = '1';
        };

        document.addEventListener('click', function() {
            document.querySelectorAll('.tms-dropdown.open').forEach(el => {
                el.classList.remove('open');
                const formItem = el.closest('.tms-form-item');
                if(formItem) formItem.style.zIndex = '1';
            });
        });

        // 弹窗关闭
        window.closeTmsModal = function() {
            const overlay = document.querySelector('.tms-modal-overlay');
            if(overlay) {
                overlay.classList.remove('show');
                setTimeout(() => { document.getElementById('tms-modal-container').innerHTML = ''; }, 200);
            }
        };

        // 绑定弹窗事件
        window.handleAddBookingUser = function() { 
            document.getElementById('tms-modal-container').innerHTML = getBookingAddEditModalHtml('add');
        };
        
        window.handleEditBookingUser = function(id) {
            const user = mockData.list.find(item => item.id === id) || mockData.list[0];
            document.getElementById('tms-modal-container').innerHTML = getBookingAddEditModalHtml('edit', user);
        };

        window.handleViewAccount = function(id) {
            const user = mockData.list.find(item => item.id === id) || mockData.list[0];
            document.getElementById('tms-modal-container').innerHTML = getBookingViewModalHtml(user);
        };

        window.handleViewRecords = function(id) {
            const user = mockData.list.find(item => item.id === id) || mockData.list[0];
            document.getElementById('tms-modal-container').innerHTML = getRecordModalHtml(user);
        };

        // --- 初始化渲染 ---
        window.onload = function() {
            document.getElementById('main-content-area').innerHTML = renderBookingListHtml(mockData);
        };
    </script>
</body>
</html>