const { API_BASE_URL, ACTIVE_ENV } = require('../config');

const TOKEN_KEY = 'ft_mini_token';
const USER_KEY = 'ft_mini_user';

function readMiniProgramEnvVersion() {
  try {
    if (!wx || typeof wx.getAccountInfoSync !== 'function') return '';
    return String(wx.getAccountInfoSync()?.miniProgram?.envVersion || '').trim();
  } catch (error) {
    return '';
  }
}

function buildClientHeaders() {
  return {
    'X-FlowTennis-Client': 'coach-mini',
    'X-FlowTennis-Client-Env': String(ACTIVE_ENV || '').trim() || 'production',
    'X-FlowTennis-Wechat-Env-Version': readMiniProgramEnvVersion() || 'release'
  };
}

function request(path, options = {}) {
  return requestWithTokenKey(path, options, TOKEN_KEY);
}

function requestWithTokenKey(path, options = {}, tokenKey = TOKEN_KEY) {
  const token = wx.getStorageSync(tokenKey);
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...buildClientHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(res) {
        const data = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        reject(new Error(data.error || '请求失败'));
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

function loginWithWechat() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) return reject(new Error('微信登录失败'));
        request('/auth/wechat-login', { method: 'POST', data: { code: res.code } })
          .then((data) => {
            wx.setStorageSync(TOKEN_KEY, data.token);
            wx.setStorageSync(USER_KEY, data.user);
            resolve(data);
          })
          .catch(reject);
      },
      fail(err) {
        reject(new Error(err.errMsg || '微信登录失败'));
      }
    });
  });
}

function loginWithPassword(username, password) {
  return request('/auth/login', {
    method: 'POST',
    data: { username, password }
  }).then((data) => {
    wx.setStorageSync(TOKEN_KEY, data.token);
    wx.setStorageSync(USER_KEY, data.user);
    return data;
  });
}

function bindWechatAfterLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) {
          reject(new Error('微信绑定失败'));
          return;
        }
        request('/auth/wechat-bind', {
          method: 'POST',
          data: { code: res.code }
        }).then(resolve).catch(reject);
      },
      fail(err) {
        reject(new Error(err.errMsg || '微信绑定失败'));
      }
    });
  });
}

function loadCoachWorkbench() {
  return request('/page-data/workbench');
}

function saveCoachFeedback(payload = {}) {
  const feedbackId = payload.id || '';
  if (feedbackId) {
    return request(`/feedbacks/${feedbackId}`, { method: 'PUT', data: payload });
  }
  return request('/feedbacks', { method: 'POST', data: payload });
}

module.exports = {
  loginWithPassword,
  bindWechatAfterLogin,
  loginWithWechat,
  loadCoachWorkbench,
  saveCoachFeedback,
  request,
  requestWithTokenKey,
  TOKEN_KEY,
  USER_KEY
};
