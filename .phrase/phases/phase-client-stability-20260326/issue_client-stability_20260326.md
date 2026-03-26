# Client Stability Issues

issue001 [x] 标题:Windows 客户端外层四角出现多余圆角重叠 | 模块:UI/桌面窗口壳层 | 优先级:P0 | 关联:task012 | 解决:2026-03-26

## issue001

- 环境: Windows 桌面端，透明无边框 Tauri 窗口。
- 现象: 客户端四角同时出现原生窗口圆角和前端壳层圆角，形成双层/重叠外轮廓；macOS 不受影响。
- 根因: 桌面共享前端壳层对所有平台统一应用了外层圆角，而 Windows 原生窗口本身已提供外轮廓圆角，导致两层裁切同时生效。
- 修复: 仅在 Windows 桌面端移除前端外层 `lingo-theme` / `lingo-app-shell` / `::before` 的外圆角，保留原生窗口外轮廓作为唯一外层圆角。
- 验证: `npm run build` 通过；当前会话未在真实 Windows 运行时做肉眼回归，需下一个 Windows 包或本机运行再确认最终视觉。
