# Client Stability Tasks

task001 [x] 场景:桌面端用户打开客户端时看到干净统一的窗口四角 | Given:Tauri 透明无边框窗口已渲染前端壳层 | When:主界面完成绘制 | Then:四个角仅保留单一外层圆角+无重叠边线或背景残影 | 验证:手动视觉检查+npm run build
task002 [x] 场景:用户修改翻译语言或翻译风格后立即触发翻译 | Given:客户端已完成设置加载 | When:用户更新配置并马上使用翻译快捷键 | Then:最新配置立即生效+无保存竞态导致的旧配置回退 | 验证:静态审查+手动测试
task003 [x] 场景:用户在游戏中触发翻译快捷键时获得更快更稳的回填 | Given:客户端启用且当前输入框已有待翻译内容 | When:触发翻译快捷键 | Then:减少不必要的系统操作+降低读取旧剪贴板或空剪贴板的概率 | 验证:cargo check+手动测试
task004 [x] 场景:用户等待翻译结果时获得更快反馈且失败不再表现为无内容 | Given:客户端通过代理请求翻译服务 | When:上游模型响应缓慢或偶发返回空结果 | Then:客户端仅在慢请求时显示“翻译中，请稍候”+代理与客户端超时预算分层+空响应可恢复 | 验证:npm run smoke+npm run build+cargo check
task005 [x] 场景:用户短时间重复翻译相同内容时更快拿到结果并能定位慢请求来源 | Given:代理短时间内收到相同文本与相同翻译配置的请求 | When:再次触发翻译或出现并发相同请求 | Then:代理优先命中内存热缓存或共享进行中的模型请求+响应返回来源与尝试次数 | 验证:npm run smoke+npm run build+cargo check
task006 [x] 场景:用户在翻译未完成时重复触发或代理短暂抖动时仍得到稳定反馈 | Given:客户端正在执行翻译或代理出现瞬时 5xx/超时抖动 | When:用户再次按下快捷键或客户端重试同一次翻译 | Then:客户端异步等待剪贴板更新+避免误读旧剪贴板+重复触发显示处理中提示+瞬时失败做一次窄范围重试 | 验证:cargo check+npm run build+npm run smoke
task007 [x] 场景:用户打开客户端后第一次翻译不再明显慢于后续翻译 | Given:桌面客户端刚启动或刚从暂停恢复启用 | When:应用完成初始化或重新启用翻译功能 | Then:后台静默预热翻译代理连接+失败仅记录日志不打扰用户+短时间内避免重复预热 | 验证:cargo check+npm run build+npm run smoke
task008 [x] 场景:用户发送全新文本时即使未命中缓存也能更快得到首个结果 | Given:代理收到一条未命中热缓存的新翻译请求 | When:根据文本长度与翻译意图构建上游模型请求 | Then:代理使用更短 prompt 和自适应生成预算+响应回传实际生效参数用于诊断 | 验证:npm run smoke+npm run build+cargo check
task009 [x] 场景:用户发送短文本时优先走快模型且异常时安全回退 | Given:代理已配置可选 fast_lane 且请求满足短文本翻译条件 | When:收到新的翻译请求或快模型瞬时失败 | Then:优先路由到快模型+缺少主模型 key 时不阻塞快路由+回退结果不污染快路由缓存+响应返回 model_route 用于诊断 | 验证:npm run smoke+npm run build+cargo check
task010 [x] 场景:开发者在本机调试桌面端时能直接走真实翻译链路 | Given:Tauri 开发构建未显式配置线上翻译后端 | When:启动桌面客户端并同时运行本地翻译代理 | Then:客户端默认回落到本地代理地址+预热成功命中真实代理+本地代理未启动时返回可操作提示 | 验证:cargo check+npm run proxy:dev+npm run tauri dev -- --no-watch
task011 [x] 场景:桌面端用户使用侧边栏时不再看到历史上已下线的设置模块 | Given:当前桌面客户端侧边栏基于共享前端导航渲染 | When:应用启动并展示主导航 | Then:侧边栏仅保留主页/翻译风格/常用语/关于+已下线的 Settings 页面不再暴露入口 | 验证:npm run build+静态审查
task012 [x] 场景:Windows 用户打开客户端时不再看到双层重叠的窗口四角 | Given:Windows 原生窗口已提供外层圆角+前端桌面壳层仍会应用统一圆角 | When:客户端主界面完成渲染 | Then:Windows 仅保留系统窗口外轮廓圆角+前端外层不再额外叠加裁切 | 验证:npm run build+静态审查 | 备注:真实 Windows 运行时需再做肉眼确认
task013 [x] 场景:开发者运行 tauri dev 时无需手动再开翻译代理进程 | Given:Tauri 开发构建依赖 Vite 和本地翻译代理共同提供真实调试链路 | When:执行 npm run tauri dev -- --no-watch | Then:beforeDevCommand 自动同时启动 Vite 和 proxy:dev+桌面端启动后预热直接命中本地代理 | 验证:npm run build+npm run tauri dev -- --no-watch
task014 [x] 场景:开发者修改客户端翻译链路后能通过自动化测试快速发现回归 | Given:Rust 客户端此前没有覆盖翻译代理交互的自动化测试 | When:执行 cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture | Then:至少覆盖真实翻译请求打到本地假代理+本地代理不可达时的可操作错误提示 | 验证:cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
task015 [x] 场景:开发者修改热键复制与回填链路时能自动发现基础判断回归 | Given:shell_helper 中的选区复制、probe 过滤和 daily_mode 快捷键路径此前缺少单元测试 | When:执行 cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture | Then:复制/粘贴快捷键路径、probe 过滤规则和本地选区检测逻辑都有最小自动化覆盖+has_text_selection 不再污染剪贴板 | 验证:cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
task016 [x] 场景:发布者准备 0.4.0 新版本时能一次完成版本同步、验证与本地 mac 安装包产出 | Given:客户端稳定性修复已完成+仓库存在 Tauri/GitHub Release 发版链路 | When:同步版本号到 0.4.0 并执行完整验证与本地打包 | Then:前端/Tauri/Cargo 版本保持一致+CHANGELOG 生成 0.4.0 更新日志+产出 macOS ARM 的 app/dmg/updater 签名 | 验证:cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture+cargo check --manifest-path src-tauri/Cargo.toml+npm run build+cd server/translate-proxy && npm run smoke+npm run build:mac-arm
task017 [ ] 场景:发布者在 0.4.0 已发版后仍能补齐 Tencent COS 镜像 | Given:GitHub Release 已创建但 COS 镜像 job 因慢网失败 | When:调整 COS 上传策略并重跑 mirror_existing_release | Then:大文件通过更保守的分片上传完成镜像+GitHub release 与 COS 镜像重新一致 | 验证:node --check scripts/upload-cos-release.mjs+gh workflow run release.yml -f release_tag=v0.4.0+gh run view <mirror-run-id>
