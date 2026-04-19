# FlowTennis 微信小程序套壳

这是教练端 PWA 的微信小程序套壳项目。

## 使用方式

1. 用微信开发者工具打开 `wechat-miniprogram` 目录。
2. 拿到真实 AppID 后，替换 `project.config.json` 里的 `appid`。
3. `miniprogram/config.js` 里的 `WEB_VIEW_URL` 当前指向 `https://www.flowtennis.cn`。
4. 微信后台添加同一个域名到「业务域名」。
5. 业务域名校验文件放到项目的 `public/` 目录，部署后需要能通过根路径访问。

## 当前占位

- `appid`: `touristappid`
- `WEB_VIEW_URL`: `https://www.flowtennis.cn`
