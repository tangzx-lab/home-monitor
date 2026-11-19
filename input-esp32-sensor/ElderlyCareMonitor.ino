/* ============================================================
   居家养老环境监测系统 — 高级仪表盘版
   主控：ESP32-DevKitC（ESP32-WROOM-32）
   传感器：DHT11温湿度 / 光敏电阻 / HC-SR501 PIR / 蜂鸣器
   指示灯：红(温度告警) / 绿(过暗提醒) / 白(正常照明)
   网页：AP热点 + AJAX无刷新仪表盘 + PC串口回控 + 蓝牙JSON上报
   版本：V1.6
   更新：V1.5 新增蓝牙JSON上报（手机蓝牙串口App连ESP32_Care）、
         按键双功能（响时静音/不响时开关灯）、手动模式无人超时自动回自动；
         V1.6 蓝牙支持接收指令（与USB同一套命令，含HELP/STATUS回显）
   ============================================================ */
#include <WiFi.h>
#include <WebServer.h>
#include <BluetoothSerial.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <DHT.h>

// ========== 引脚定义（按实际接线） ==========
#define DHT_PIN     15   // DHT11 DATA（串4.7kΩ上拉至3V3）
#define LDR_PIN     34   // 光敏AO（ADC1输入专用）
#define PIR_PIN     27   // PIR OUT（VCC→5V）
#define BUZZER_PIN  5    // 蜂鸣器（低电平触发：LOW响）
#define RED_LED     16   // 红灯：温度告警
#define GREEN_LED   18   // 绿灯：过暗提醒
#define WHITE_LED   17   // 白灯：正常/照明
#define BUTTON_PIN  4    // 按键（一脚GPIO4，一脚GND；响时静音/不响时开关灯）
#define BOARD_LED   2    // 板载心跳LED

DHT dht(DHT_PIN, DHT11);
BluetoothSerial SerialBT;   // 经典蓝牙(SPP)：手机蓝牙串口App观察JSON、发指令

// ========== BLE 串口（Nordic UART Service，与经典蓝牙共存） ==========
#define BLE_NAME      "ESP32_Care-BLE"
#define BLE_SVC_UUID  "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_RX_UUID   "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"   // 手机写入指令
#define BLE_TX_UUID   "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"   // 手机订阅，notify收JSON
BLEServer *bleServer = nullptr;
BLECharacteristic *bleTx = nullptr;
bool bleConnected = false;

// ========== AP热点 ==========
const char* ssid     = "ESP32_Care";
const char* password = "12345678";
WebServer server(80);

// ========== 阈值 ==========
#define TEMP_HIGH     30.0   // 高温告警
#define TEMP_HIGH_OFF 28.0   // 回差解除
#define TEMP_LOW      10.0   // 低温告警
#define TEMP_LOW_OFF  12.0
#define LDR_DARK      1500   // 光敏值>1500判过暗（暗时值大）

// ========== 时间参数 ==========
#define LIGHT_DELAY  5000    // 无人5秒关灯
#define ALERT_TIME   15000   // 无人15秒提醒
#define BEEP_LONG    2000    // 提醒长响2秒
#define MANUAL_AUTO_MS 5000  // 演示版：手动模式无人5秒自动回自动（正式版300000=5分钟）

// ========== 状态变量 ==========
float temp = 0, hum = 0;
int   ldrVal = 0;
bool  pirHigh = false;
bool  alarmHi = false, alarmLo = false;
bool  tempAlarm = false;
bool  muted = false;
bool  autoMode = true;
bool  lightOn = false;
bool  alerted = false;
unsigned long lastMove = 0, idle = 0, alertCount = 0;
unsigned long lastJson = 0, lastBuz = 0;
bool  buzState = false;
int   lastBtn = HIGH;
unsigned long beepUntil = 0;   // 蜂鸣器响到什么时候（非阻塞）
unsigned long manualSince = 0; // 进入手动模式的时刻（无人超时自动回自动用）

// 蜂鸣器：低电平触发（响=LOW，停=HIGH）
void buzTone(bool on) { digitalWrite(BUZZER_PIN, on ? LOW : HIGH); }

// ========== 告警等级：0正常(绿) / 1提醒(黄) / 2告警(红) ==========
int getAlarmLevel() {
  if (tempAlarm) return 2;
  if (ldrVal > LDR_DARK || idle > ALERT_TIME) return 1;
  return 0;
}

// ========== 实时数据API（JSON） ==========
String apiJson() {
  String s = "{";
  s += "\"temp\":" + String(temp, 1);
  s += ",\"hum\":" + String(hum, 0);
  s += ",\"light\":" + String(ldrVal);
  s += ",\"pir\":" + String(pirHigh ? 1 : 0);
  s += ",\"idle\":" + String(idle / 1000);
  s += ",\"level\":" + String(getAlarmLevel());
  s += ",\"muted\":" + String(muted ? 1 : 0);
  s += ",\"auto\":" + String(autoMode ? 1 : 0);
  s += ",\"count\":" + String(alertCount);
  s += "}";
  return s;
}

// ========== 指令统一处理（USB串口 / 经典蓝牙 / BLE 共用一套命令） ==========
void handleCmd(String c) {
  c.trim();
  if (c == "LEDON")        { autoMode = false; manualSince = millis(); lightOn = true;  digitalWrite(WHITE_LED, HIGH); }
  else if (c == "LEDOFF")  { autoMode = false; manualSince = millis(); lightOn = false; digitalWrite(WHITE_LED, LOW); }
  else if (c == "AUTO")    { autoMode = true; }
  else if (c == "BEEP")    { beepUntil = millis() + 800; }
  else if (c == "MUTE")    { muted = true;  buzTone(false); }
  else if (c == "UNMUTE")  { muted = false; }
  else if (c == "STATUS")  { String j = apiJson(); Serial.println(j); SerialBT.println(j); }
  else if (c == "HELP")    {
    String h = "命令: LEDON LEDOFF AUTO BEEP MUTE UNMUTE STATUS";
    Serial.println(h); SerialBT.println(h);
  }
}

// ========== BLE 回调与初始化（Nordic UART，手机 nRF Connect / LightBlue 可用） ==========
class BleServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer *s) override { bleConnected = true; }
  void onDisconnect(BLEServer *s) override { bleConnected = false; s->startAdvertising(); }
};

class BleRxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *ch) override {
    String v = String(ch->getValue().c_str());
    if (v.length()) handleCmd(v);
  }
};

void bleInit() {
  BLEDevice::init(BLE_NAME);
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new BleServerCB());
  BLEService *svc = bleServer->createService(BLE_SVC_UUID);
  bleTx = svc->createCharacteristic(BLE_TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  bleTx->addDescriptor(new BLE2902());
  BLECharacteristic *rx = svc->createCharacteristic(
      BLE_RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new BleRxCB());
  svc->start();
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SVC_UUID);
  adv->setScanResponse(true);
  adv->start();
}

// ========== 高级仪表盘主页 ==========
String dashboard() {
  String p = "";
  p += "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>";
  p += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  p += "<title>居家养老环境监测</title><style>";
  p += "*{margin:0;padding:0;box-sizing:border-box}";
  p += "body{font-family:'Microsoft YaHei',sans-serif;min-height:100vh;padding:18px;";
  p += "background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}";
  p += ".wrap{max-width:920px;margin:0 auto}";
  p += ".top{background:rgba(255,255,255,.96);border-radius:16px;padding:18px 28px;";
  p += "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px}";
  p += ".top h1{color:#1F4E79;font-size:21px}";
  p += ".badge{padding:7px 22px;border-radius:20px;color:#fff;font-weight:bold;font-size:15px}";
  p += ".cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}";
  p += ".card{background:rgba(255,255,255,.96);border-radius:16px;padding:22px 16px;text-align:center;";
  p += "box-shadow:0 4px 14px rgba(0,0,0,.1)}";
  p += ".card .lbl{color:#888;font-size:14px;margin-bottom:8px}";
  p += ".card .val{font-size:34px;font-weight:bold;color:#2c3e50}";
  p += ".card .unit{font-size:15px;color:#999;font-weight:normal}";
  p += ".info{background:rgba(255,255,255,.96);border-radius:16px;padding:18px 26px;margin-bottom:14px;";
  p += "display:flex;flex-wrap:wrap;justify-content:space-around;gap:14px}";
  p += ".info .it{text-align:center}";
  p += ".info .it .l{font-size:12px;color:#999;margin-bottom:4px}";
  p += ".info .it .v{font-size:17px;font-weight:bold;color:#2c3e50}";
  p += ".ctrl{background:rgba(255,255,255,.96);border-radius:16px;padding:20px;text-align:center}";
  p += ".ctrl h3{color:#1F4E79;margin-bottom:12px;font-size:17px}";
  p += ".btn{display:inline-block;margin:5px;padding:11px 22px;border-radius:10px;";
  p += "color:#fff;text-decoration:none;font-size:15px}";
  p += "</style></head><body><div class='wrap'>";
  p += "<div class='top'><h1>居家养老环境监测系统</h1>";
  p += "<div class='badge' id='badge' style='background:#999'>等待数据</div></div>";
  p += "<div class='cards'>";
  p += "<div class='card'><div class='lbl'>温度</div><div class='val'><span id='t'>--</span><span class='unit'> ℃</span></div></div>";
  p += "<div class='card'><div class='lbl'>湿度</div><div class='val'><span id='h'>--</span><span class='unit'> %RH</span></div></div>";
  p += "<div class='card'><div class='lbl'>光照强度</div><div class='val' id='l' style='font-size:28px'>--</div></div>";
  p += "<div class='card'><div class='lbl'>人体感应</div><div class='val' id='p' style='font-size:26px'>--</div></div>";
  p += "</div>";
  p += "<div class='info'>";
  p += "<div class='it'><div class='l'>无人持续</div><div class='v'><span id='i'>0</span> 秒</div></div>";
  p += "<div class='it'><div class='l'>告警次数</div><div class='v' id='c'>0</div></div>";
  p += "<div class='it'><div class='l'>控制模式</div><div class='v' id='m'>--</div></div>";
  p += "<div class='it'><div class='l'>消音状态</div><div class='v' id='mu'>--</div></div>";
  p += "</div>";
  p += "<div class='ctrl'><h3>远程控制面板</h3>";
  p += "<a class='btn' style='background:#1565C0' href='/ledon'>灯开</a>";
  p += "<a class='btn' style='background:#C62828' href='/ledoff'>灯关</a>";
  p += "<a class='btn' style='background:#2E7D32' href='/auto'>恢复自动</a>";
  p += "<a class='btn' style='background:#E65100' href='/beep'>试鸣</a>";
  p += "<a class='btn' id='mb' style='background:#455A64' href='/mute'>消音</a>";
  p += "</div></div>";
  p += "<script>";
  p += "async function upd(){";
  p += "try{const r=await fetch('/api');const d=await r.json();";
  p += "document.getElementById('t').textContent=d.temp;";
  p += "document.getElementById('h').textContent=d.hum;";
  p += "document.getElementById('l').textContent=d.light;";
  p += "document.getElementById('p').textContent=d.pir?'有人':'无人';";
  p += "document.getElementById('i').textContent=d.idle;";
  p += "document.getElementById('c').textContent=d.count;";
  p += "document.getElementById('m').textContent=d.auto?'自动':'手动';";
  p += "document.getElementById('mu').textContent=d.muted?'是':'否';";
  p += "var b=document.getElementById('badge');";
  p += "if(d.level===2){b.textContent='告警';b.style.background='#C62828';}";
  p += "else if(d.level===1){b.textContent='提醒';b.style.background='#F9A825';}";
  p += "else{b.textContent='正常';b.style.background='#2E7D32';}";
  p += "var mb=document.getElementById('mb');";
  p += "if(d.muted){mb.textContent='取消消音';mb.href='/unmute';mb.style.background='#00838F';}";
  p += "else{mb.textContent='消音';mb.href='/mute';mb.style.background='#455A64';}";
  p += "}catch(e){document.getElementById('badge').textContent='等待数据';}}";
  p += "upd();setInterval(upd,2000);";
  p += "</script></body></html>";
  return p;
}

void setup() {
  Serial.begin(115200);
  SerialBT.begin("ESP32_Care");   // 经典蓝牙：手机SPP串口App搜索并连接此名称
  bleInit();                      // BLE：手机 nRF Connect / LightBlue 搜索 ESP32_Care-BLE
  dht.begin();

  pinMode(PIR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, HIGH);   // 默认不响
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(WHITE_LED, OUTPUT);
  pinMode(BOARD_LED, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  WiFi.softAP(ssid, password);
  Serial.println("AP热点：" + String(ssid) + "  手机访问 http://192.168.4.1");

  // 主页与数据API
  server.on("/",    [](){ server.send(200, "text/html", dashboard()); });
  server.on("/api", [](){ server.send(200, "application/json", apiJson()); });

  // 控制路由
  server.on("/ledon",  [](){ autoMode = false; lightOn = true;  digitalWrite(WHITE_LED, HIGH); server.send(200, "text/html", dashboard()); });
  server.on("/ledoff", [](){ autoMode = false; lightOn = false; digitalWrite(WHITE_LED, LOW);  server.send(200, "text/html", dashboard()); });
  server.on("/auto",   [](){ autoMode = true;  server.send(200, "text/html", dashboard()); });
  server.on("/beep",   [](){ beepUntil = millis() + 800; server.send(200, "text/html", dashboard()); });
  server.on("/mute",   [](){ muted = true;  buzTone(false); server.send(200, "text/html", dashboard()); });
  server.on("/unmute", [](){ muted = false; server.send(200, "text/html", dashboard()); });
  server.begin();

  delay(10000);   // PIR预热
  lastMove = millis();
  Serial.println("系统启动");
}

void loop() {
  server.handleClient();
  digitalWrite(BOARD_LED, !digitalRead(BOARD_LED));   // 板载心跳

  // ---- 0. 串口/蓝牙指令解析（PC Python通过USB回控；手机蓝牙也可发） ----
  if (Serial.available()) {
    handleCmd(Serial.readStringUntil('\n'));
  }
  if (SerialBT.available()) {
    handleCmd(SerialBT.readStringUntil('\n'));
  }

  // ---- 1. 读传感器 ----
  temp = dht.readTemperature();
  hum  = dht.readHumidity();
  if (isnan(temp) || isnan(hum)) { temp = -99; hum = -99; }
  ldrVal = analogRead(LDR_PIN);
  pirHigh = (digitalRead(PIR_PIN) == HIGH);

  // ---- 2. 温度告警（带回差） ----
  if (!alarmHi && temp > TEMP_HIGH) alarmHi = true;
  if (alarmHi && temp < TEMP_HIGH_OFF) alarmHi = false;
  if (!alarmLo && temp < TEMP_LOW) alarmLo = true;
  if (alarmLo && temp > TEMP_LOW_OFF) alarmLo = false;
  tempAlarm = alarmHi || alarmLo;

  // ---- 3. 红灯 = 温度告警 ----
  digitalWrite(RED_LED, tempAlarm ? HIGH : LOW);

  // ---- 4. 绿灯 = 自动模式下光线过暗 ----
  digitalWrite(GREEN_LED, (autoMode && ldrVal > LDR_DARK) ? HIGH : LOW);

  // ---- 5. 按键双功能（按下瞬间） ----
  // 蜂鸣器在响 → 静音；没在响 → 切换照明灯（进入手动模式）
  int btn = digitalRead(BUTTON_PIN);
  if (lastBtn == HIGH && btn == LOW) {
    bool ringing = ((millis() < beepUntil) || tempAlarm) && !muted;
    if (ringing) {
      muted = true; buzTone(false);            // 响 → 静音
    } else {
      autoMode = false;                         // 不响 → 手动开关灯
      manualSince = millis();                   // 记录进入手动时刻
      lightOn = !lightOn;
      digitalWrite(WHITE_LED, lightOn ? HIGH : LOW);
    }
  }
  lastBtn = btn;

  // ---- 6. 活动监护 ----
  if (pirHigh) {
    lastMove = millis();
    alerted = false;
    muted = false;                 // 有人活动，恢复报警
    if (autoMode && !lightOn) { lightOn = true; digitalWrite(WHITE_LED, HIGH); }
  } else {
    idle = millis() - lastMove;
    // 手动模式：进入手动后持续无人MANUAL_AUTO_MS自动回自动（防忘关灯）
    if (!autoMode && millis() - manualSince > MANUAL_AUTO_MS) autoMode = true;
    if (autoMode && lightOn && idle > LIGHT_DELAY) {
      lightOn = false; digitalWrite(WHITE_LED, LOW);
    }
    if (!alerted && idle > ALERT_TIME) {
      alerted = true; alertCount++;
      if (!muted) beepUntil = millis() + BEEP_LONG;
    }
  }
  if (autoMode) digitalWrite(WHITE_LED, lightOn ? HIGH : LOW);

  // ---- 7. 蜂鸣器统一控制（非阻塞） ----
  if (millis() < beepUntil && !muted) {
    buzTone(true);
  } else if (tempAlarm && !muted) {
    if (millis() - lastBuz > 1000) { buzState = !buzState; lastBuz = millis(); }
    buzTone(buzState);
  } else {
    buzTone(false);
  }

  // ---- 8. 串口/蓝牙JSON（调试与手机App观察） ----
  if (millis() - lastJson > 2000) {
    lastJson = millis();
    String j = apiJson();
    Serial.println(j);
    SerialBT.println(j);
    if (bleConnected && bleTx) { bleTx->setValue(j.c_str()); bleTx->notify(); }
  }
  delay(50);
}
