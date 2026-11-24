# MetroScope 成都地铁换乘情景分析

MetroScope 模拟成都地铁某座换乘站暂停站内跨线换乘，比较正常与受限情景下的乘车区段、换乘次数和可达范围。模型保留列车通行、停靠、上下车及已记录的站外换乘。项目基于 2026 年 11 月 3 日获取的线路快照，包含 16 条线路、358 个可用于出发和到达的站点，以及六种受限情景。

## 运行

克隆或下载仓库，使用桌面浏览器打开 `index.html`。浏览器依赖及生成数据已随仓库提供，也可在仓库根目录启动静态服务。

```sh
python -m http.server 8000 --bind 127.0.0.1
```

| 入口 | 功能 |
| --- | --- |
| [交互线网](index.html) | 从站点热图和起终点矩阵找到受影响的行程，回放替代路径，比较可达范围及三维影响峰值。 |
| [堆叠柱状图](question1.html) | 独立测试情景比较组件，查看全网比例、选中站构成和各类别明细。 |
| [六站图册](scenarios.html) | 固定一个出发站，用六张并列线网比较各情景的影响。 |

打开主页后选择太平园并点击“回放情景案例”。武侯大道到簇锦的模型最优路线由 **2 个乘车区段、1 次换乘** 变为 **7 个区段、3 次换乘**。全网指标按等权起终点对统计，路线成本以乘车区段和换乘次数衡量。

## 开发

页面以原生 JavaScript、HTML 和 CSS 编写，图表使用 ECharts，二维线网使用 D3，三维视图使用 Three.js。Python 负责清洗数据、构建线路状态图和预计算情景。浏览器用 `routing.js` 计算交互选中的路线与可达范围。

- `components/` 包含堆叠图、回放、可达范围、三维及专题组件。
- `data/raw/` 和 `data/processed/` 提供来源快照、处理结果、布局审计及六行情景统计。
- `prototype-data.js` 和 `layout-data.js` 是页面加载的生成数据。

```sh
python -m unittest -v test_model.py
python build.py
python build_layout.py
```

更改浏览器依赖或 Three.js 模块后，运行 `npm ci` 和 `npm run vendor` 重建 `vendor/`。

## 数据与第三方许可

来源、适配说明和许可见 [THIRD_PARTY.md](THIRD_PARTY.md)、[数据清单](data/processed/manifest.json)及 [licenses/](licenses/)。Open-Metro-PIS 源数据的许可文本随数据提供。[查看许可文本](data/raw/candidate-LICENSE)
