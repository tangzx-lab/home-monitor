我现在想做个居家养老监测的全息监控前端程序，在这里我想做个 html 3D 页面来获取我硬件中的数据（ESP32）

docus/ESP32 传感器接口文档.md 这个是硬件获取数据的接口文档
esp32-sensor/ElderlyCareMonitor.ino 这个是烧入的代码

这个 html 页面，我想用 threejs 做个 3D 模型，这个模型主要是一个房间,
在房间里面我们能够显示出温度、湿度、光感、人体存在传感器
另外还有一些输出设备

你按照你的理解先帮我实现一版本，要求能够监听显示输入数据，也能反向控制输出设备


192.168.20.132

## 启动 HTML 服务

安装 Node.js 18 或更新版本（推荐当前 LTS），无需运行 npm install。
启动脚本位于项目根目录，可从任意工作目录调用。

- Windows：双击 `start.bat`，或在命令提示符中运行 `start.bat`。出错时窗口会保留错误信息。
- macOS / Linux：在项目目录运行 `sh start.sh` 或 `./start.sh`。

启动成功后打开 http://localhost:5173 ，按 Ctrl+C 停止服务。
USB 串口请使用 Chrome / Edge 打开此 localhost 地址，并关闭占用串口的 Arduino 串口监视器。
演示页面地址为 http://localhost:5173/?demo=1 。

如端口被占用（EADDRINUSE），可打开已运行的服务，或指定其他端口：

```sh
# macOS / Linux
PORT=5174 sh start.sh
```

```bat
rem Windows 命令提示符
set "PORT=5174"
start.bat
```

更改端口后访问对应地址，例如 http://localhost:5174 。
