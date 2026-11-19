# 居家养老环境监测系统 · Home Monitor

基于 **ESP32-WROOM-32** 的居家养老环境监测与告警系统。硬件侧采集温湿度、光照与人体存在，经三级告警状态机驱动声光输出；软件侧提供 **Three.js 3D 房间实时监控页面**，并支持 USB 串口、Wi-Fi（AP + STA）、经典蓝牙 SPP、BLE 四路数据通道与反向控制。

> 《感知技术》课程项目 · 2026.11

## 功能特性

- **三路环境采集**：DHT11 温湿度（GPIO15）、光敏电阻 AO（GPIO34）、HC-SR501 人体红外（GPIO27）
- **三级告警状态机**：高温 30 ℃ 触发 / 28 ℃ 回差解除，低温 10 ℃ / 12 ℃，光照 > 1500 判过暗，阈值回差防抖
- **安全联动**：无人 15 秒蜂鸣提醒、有人开灯 / 离开 5 秒关灯（演示版）、按键双功能（响时消音 / 不响时切换照明）
- **四路通信**：USB 串口 115200 8N1、ESP32 热点 HTTP（192.168.4.1）、经典蓝牙 SPP、BLE（Nordic UART Service），四路下发同一份 JSON，每 2 秒一帧
- **六条控制指令**：`LEDON` / `LEDOFF` / `AUTO` / `BEEP` / `MUTE` / `UNMUTE`，另有 `STATUS` / `HELP`
- **3D 可视化**：Three.js 构建房间模型，实时映射传感器数值与设备状态，网页按钮经本地服务写串口回控硬件

## 目录结构

```
home-monitor/
├── front/                     3D 网页前端 + 本地 Node 中转服务
│   ├── index.html
│   ├── app.js                 数据轮询、指令下发、面板渲染
│   ├── warm-room.js           房间场景与设备动画
│   ├── styles.css
│   ├── server.mjs             静态服务 + 串口/HTTP 代理
│   └── vendor/                three.module.js、OrbitControls.js
├── input-esp32-sensor/        ESP32 固件（V1.7）
│   ├── ElderlyCareMonitor.ino
│   └── 固件说明.txt            编译环境、依赖库与接线
├── docs/                      设计文档与验收材料
├── start.bat                  Windows 一键启动
├── start.sh                   macOS / Linux 启动
└── README.md
```

## 快速开始（3D 网页）

需要 **Node.js 18 或更新版本**，无需 `npm install`（three.js 已内置在 `front/vendor/`）。

- **Windows**：双击 `start.bat`
- **macOS / Linux**：`sh start.sh`

启动后浏览器打开 <http://localhost:5173>，按 `Ctrl+C` 停止服务。

- 无硬件演示页面：<http://localhost:5173/?demo=1>
- 使用 USB 串口时必须用 **Chrome / Edge** 打开 localhost 地址，并关闭占用串口的 Arduino 串口监视器
- 端口被占用（EADDRINUSE）时改端口：

  ```sh
  # macOS / Linux
  PORT=5174 sh start.sh
  ```

  ```bat
  rem Windows
  set "PORT=5174"
  start.bat
  ```

## 烧录固件

1. Arduino IDE 安装 **esp32 by Espressif（2.x）** 开发板包
2. 开发板选 `ESP32-DevKitC`（ESP32-WROOM-32），分区方案选 **Huge APP (3MB No OTA)**（蓝牙库较大，默认分区会编译超限）
3. 库管理器安装 **DHT sensor library（Adafruit）**；WiFi / WebServer / BluetoothSerial / BLE 均由开发板包自带
4. 打开 `input-esp32-sensor/ElderlyCareMonitor.ino` 烧录，串口 115200

**Wi-Fi 配置**：`wifiSsid` / `wifiPass` 为占位符，要接入自己的网络只需改这两行（仅 2.4 GHz、WPA2）。不填也能运行——设备以 AP 热点模式工作，手机连 `ESP32_Care`（密码 `12345678`），浏览器访问 <http://192.168.4.1> 查看数据。

## 硬件接线

| 器件 | 引脚 | 说明 |
|---|---|---|
| DHT11 DATA | GPIO15 | 4.7 kΩ 上拉至 3V3 |
| 光敏模块 AO | GPIO34 | ADC1 输入专用，数值越大越暗 |
| HC-SR501 OUT | GPIO27 | VCC 接 5V，上电需约 10 秒预热 |
| 有源蜂鸣器 I/O | GPIO5 | VCC 接 **3V3**，低电平触发（接 5V 会常响） |
| 红色 LED | GPIO16 | 温度告警，串 220 Ω |
| 绿色 LED | GPIO18 | 过暗提醒，串 220 Ω |
| 白色 LED | GPIO17 | 正常照明，串 220 Ω |
| 轻触按键 | GPIO4 | 一脚接 GPIO4，一脚接 GND |
| 板载心跳灯 | GPIO2 | 每 50 ms 翻转 |

完整接线图见 [`docs/整机接线图.png`](docs/整机接线图.png)。

## 数据帧

四路通道内容一致，单行 JSON，每 2 秒一帧：

```json
{"temp":25.8,"hum":52,"light":1535,"pir":0,"idle":12,"level":1,"muted":0,"auto":1,"count":3}
```

`light` 数值越大越暗；`temp` 或 `hum` 为 `-99` 表示 DHT11 读取失败。

## 文档索引

| 文档 | 内容 |
|---|---|
| [`docs/系统架构图.md`](docs/系统架构图.md) | 数据上报链路与控制回程 Mermaid 图、四通道对照表 |
| [`docs/数据传输接口说明.docx`](docs/数据传输接口说明.docx) | 四路通道接口定义、JSON 字段、BLE 服务与特征值 UUID、控制指令 |
| [`docs/使用说明书（适老化版）.docx`](docs/使用说明书（适老化版）.docx) | 面向家属的使用说明与常见问题 |
| [`docs/ESP32开发板引脚说明表.docx`](docs/ESP32开发板引脚说明表.docx) | 开发板引脚功能与占用情况 |
| [`docs/引脚分配总表.xlsx`](docs/引脚分配总表.xlsx) | 全项目引脚分配 |
| [`docs/元器件清单BOM表.xlsx`](docs/元器件清单BOM表.xlsx) | 物料清单与规格 |
| [`docs/测试报告与验收记录.xlsx`](docs/测试报告与验收记录.xlsx) | 十六项验收记录、实测数据、优化前后对比 |
| [`docs/整机接线图.png`](docs/整机接线图.png) | 整机接线图 |
| [`docs/个人总结.docx`](docs/个人总结.docx) | 小组分工与个人总结 |

## 隐私说明

本仓库为课程作业的公开版本，已做过脱敏处理：

- 固件中 `wifiSsid` / `wifiPass` 均为占位符，不含任何真实无线网络凭据
- 不含家庭内网 IP、成员真实姓名与学号；文档中的测试人、成员署名均为角色代称
- 测试数据为实验室环境实测记录

## 已知限制 / 后续计划

- 人体感应、手机端经典蓝牙连接等验收项仍标注「待实测」，需在有真实有人场景下补测
- 演示版「手动模式无人超时自动回自动」为 5 秒，正式版为 5 分钟，答辩后需重新烧录
- 后续计划：接入云平台远程告警、增加语音提醒与跌倒检测、完善正式版参数配置
