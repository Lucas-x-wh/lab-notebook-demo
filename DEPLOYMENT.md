# GitHub Pages 与 OCR

## 发布

本目录的 `dist/` 是完整网站。将 **dist 内的文件和 assets 目录** 上传到一个公开 GitHub 仓库根目录，保留相对路径。在仓库 Settings → Pages 中选择 Deploy from a branch，分支 main、目录 / (root)，保存。

GitHub 显示部署成功后，分享 Pages 给出的 HTTPS 地址。仓库地址用来查看代码，Pages 地址用来体验网站。预计地址格式为 `https://Lucas-x-wh.github.io/仓库名/`，实际以 GitHub 的成功部署结果为准。

不要上传浏览器实验记录、导出备份、原生 OCR 二进制、开发日志或其他项目参考资料。网站内置示例和图片会随公开仓库发布；后来上传的实验和观察只保存在各访客自己的浏览器，不自动同步给他人。

官方说明：https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## 已接入的替代方案：浏览器 OCR

上传手册图片时按需加载 Tesseract.js 6.0.1，中英文识别在访客设备内完成。网页不再访问作者电脑的 8766 端口，不需要 Python、macOS 或 API 密钥。原始反应结构图仍直接显示，OCR 只提取步骤文字。

首次识别需要从 jsDelivr 下载引擎和语言模型，可能较慢；网络无法访问 CDN 时会显示失败，保留原图，并允许重试或直接粘贴文字、上传 TXT/Markdown。单次识别设置 3 分钟上限，成功或失败后释放识别线程。手机性能和中文手写准确率需用目标设备实测。

下载组件会向 CDN 发出普通网络请求，但应用不向 OCR 服务器上传图片。模型缓存和实验记录仍存于本浏览器。重要记录应导出备份。清除网站数据或更换网站域名后不会自动带上原有记录。

此方案不保证化学名称、上下标、数字、单位或表格分行准确；保留人工校对再保存流程，不从结构图推算分子式。

技术依据：https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/local-installation.md

## 后续服务端方案（尚未部署）

若实测浏览器识别效果不足，可让 GitHub Pages 前端通过 HTTPS 调用独立 OCR API：后端容器运行 PaddleOCR，或由后端代理商业 OCR 服务。密钥只保存在服务端环境变量。图片应限制格式、体积与像素尺寸，并配置访问控制、限流、超时及自动清理；返回文字进入现有校对编辑器。需要服务器、域名或平台账号及预算后才能完成实际部署。

该服务与静态 Pages 分开部署；不能把当前 macOS Vision 程序直接放到 Pages 执行。对演示阶段，优先使用已接入的浏览器 OCR 和文字粘贴备用入口；对正式多人系统，再增加账号、云数据与受保护的 OCR 后端。
