# 数据、图形与组件来源

| 来源 | 本项目的使用与修改 | 本地记录 |
| --- | --- | --- |
| [Rail Map Painter · 成都线网模板](https://github.com/railmapgen/rmp-gallery/blob/main/public/resources/real_world/chengdu.json) 与 [Rail Map Painter](https://github.com/railmapgen/rmp) | 适配模板的站点位置和线路曲线，将运营区段匹配到线网图形。三维视图在同一组示意坐标上投影。 | 原模板与贡献历史保存在 `data/raw/rmp-chengdu*.json`。几何适配见 `build_layout.py`，许可文本见 `licenses/RMP-GPL-3.0.txt`。 |
| [Open-Metro-PIS · 成都数据](https://github.com/DPCau/Open-Metro-PIS/tree/main/data/chengdu) | 整理运营站序与线路颜色，校正部分站序、开通状态，建立站内及站外换乘边。 | `data/raw/candidate-*.json` 与 `data/raw/candidate-LICENSE`。源数据采用 CC BY-NC-SA 4.0。 |
| [成都轨道交通线网图](https://www.chengdurail.com/ckfw/xlt.htm) | 核对关键线路、开通状态和连接。 | 官方原图可通过来源链接查看。 |
| [Apache ECharts](https://github.com/apache/echarts)、[D3](https://github.com/d3/d3)、[Lucide](https://github.com/lucide-icons/lucide) | 分别用于矩阵与堆叠柱图、交互地图与三维投影图元、界面图标。 | 固定版本写在 `package.json`，离线构建位于 `vendor/`，许可证及通知位于 `licenses/`。 |
| [Three.js](https://threejs.org/) | 以实例几何绘制站点，沿同线相邻站绘制半透明剖面与分级刻线。esbuild 将渲染模块及依赖打入离线脚本。 | components/peak-relief.js、vendor/peak-relief.min.js、licenses/three-LICENSE。 |

本项目依据站点与线路状态运行路径比较。情景统计、柱高和可达范围均来自等权起终点计算，投影图的光照、阴影及颜色仅用于辅助阅读。
