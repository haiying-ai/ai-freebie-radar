# 参与贡献

数据源失效是这个项目最常见的反馈，所以贡献主要有两类：**修数据源** 和 **加数据源**。

## 本地校验

无需安装依赖：

```bash
for f in *.js; do node --check "$f"; done
for f in $(git ls-files '*.json'); do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))"; done
```

运行一次抓取：

```bash
npm start
```

## 加 / 修数据源

- 一个数据源一个文件，返回结构保持与现有条目一致（`title` / `url` / `expiresAt` 等字段见现有实现）
- **只收录公开可访问、无需绕过风控的免费额度**；不要加入需要分享账号、破解或爬取隐私的内容
- 抓取失败要能被单独隔离：单个源报错不应中断整轮
- 提交前把该源的产物手工核对一次，确认不是登录墙或 404 页面

## 修页面

`admin-page.js` 负责渲染。**所有第三方文本必须转义**，禁止直接拼接 HTML —— 数据源内容是外部输入。

## 提 PR

- 说明数据源地址、验证时间、当前额度是否还有效
- 数据源挂了请直接开 `data_source_broken` Issue，附上报错输出

安全问题请走 **Security** 页私密报告。
