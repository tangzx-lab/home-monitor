import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildWarmRoom } from "./warm-room.js";

const DEFAULT_ENDPOINT = "http://192.168.4.1";
const POLL_MS = 2000;
const DARK_THRESHOLD = 1500;
const DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";
const SOURCE_KEY = "esp32-care-source";
const SERIAL_BAUD_RATE = 115200;
const SERIAL_COMMANDS = {
  "/ledon": "LEDON",
  "/ledoff": "LEDOFF",
  "/auto": "AUTO",
  "/beep": "BEEP",
  "/mute": "MUTE",
  "/unmute": "UNMUTE",
};

const els = {
  canvas: document.querySelector("#roomCanvas"),
  connection: document.querySelector("#connectionState"),
  sourceMode: document.querySelector("#sourceMode"),
  serialConnect: document.querySelector("#serialConnectButton"),
  serialDisconnect: document.querySelector("#serialDisconnectButton"),
  endpoint: document.querySelector("#endpointInput"),
  saveEndpoint: document.querySelector("#saveEndpointButton"),
  refresh: document.querySelector("#refreshButton"),
  lastUpdated: document.querySelector("#lastUpdated"),
  temp: document.querySelector("#tempValue"),
  hum: document.querySelector("#humValue"),
  light: document.querySelector("#lightValue"),
  pir: document.querySelector("#pirValue"),
  idle: document.querySelector("#idleValue"),
  count: document.querySelector("#countValue"),
  level: document.querySelector("#levelText"),
  mode: document.querySelector("#modeValue"),
  muted: document.querySelector("#mutedValue"),
  lightState: document.querySelector("#lightStateValue"),
  advice: document.querySelector("#adviceValue"),
  commandButtons: document.querySelectorAll("[data-command]"),
};

const savedEndpoint = localStorage.getItem("esp32-care-endpoint");
els.endpoint.value = savedEndpoint || DEFAULT_ENDPOINT;
els.sourceMode.value = DEMO_MODE ? "demo" : localStorage.getItem(SOURCE_KEY) || "http";

const serialState = {
  port: null,
  reader: null,
  writer: null,
  buffer: "",
  connected: false,
  reading: false,
  lastDataAt: 0,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeee4d5);
scene.fog = new THREE.Fog(0xeee4d5, 22, 48);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
camera.position.set(8.8, 7.1, 10.6);

const renderer = new THREE.WebGLRenderer({
  canvas: els.canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.22, -0.25);
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 5;
controls.maxDistance = 15;
controls.minAzimuthAngle = -0.15;
controls.maxAzimuthAngle = Math.PI / 2 - 0.12;

function canvasTexture(draw, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function woodTexture() {
  return canvasTexture((ctx, s) => {
    const gradient = ctx.createLinearGradient(0, 0, s, 0);
    gradient.addColorStop(0, "#dfc6a2");
    gradient.addColorStop(0.46, "#e8d1b0");
    gradient.addColorStop(1, "#dcc09a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);
    for (let y = 12; y < s; y += 24) {
      ctx.strokeStyle = "rgba(115,82,46,.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= s; x += 18) {
        const wave = Math.sin(x * 0.035 + y * 0.08) * 5;
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
  });
}

const floorTexture = woodTexture();
floorTexture.repeat.set(3.8, 3);
const materials = {
  floor: new THREE.MeshStandardMaterial({ map: floorTexture, color: 0xffffff, roughness: 0.88 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xf4e7d5, roughness: 1 }),
  wood: new THREE.MeshToonMaterial({ map: woodTexture(), color: 0xffc078 }),
  metal: new THREE.MeshToonMaterial({ color: 0xc8d7e5 }),
  skin: new THREE.MeshToonMaterial({ color: 0xffbd9d }),
  clothing: new THREE.MeshStandardMaterial({ color: 0x8aab9c, roughness: 0.9 }),
  trouser: new THREE.MeshToonMaterial({ color: 0x405174 }),
  sensor: new THREE.MeshToonMaterial({ color: 0x5cc8ff }),
  good: new THREE.MeshToonMaterial({ color: 0x3ddc97 }),
  warn: new THREE.MeshToonMaterial({ color: 0xffc857 }),
  bad: new THREE.MeshToonMaterial({ color: 0xff5b6e }),
  dim: new THREE.MeshToonMaterial({ color: 0x738091 }),
  softShadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
};

const hemi = new THREE.HemisphereLight(0xfff4e2, 0xb5a08b, 1.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff6df, 1.6);
sun.position.set(4.7, 7.8, 3.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -6;
sun.shadow.camera.right = 6;
sun.shadow.camera.top = 6;
sun.shadow.camera.bottom = -6;
sun.shadow.normalBias = 0.035;
sun.shadow.bias = -0.00015;
sun.shadow.radius = 4;
scene.add(sun);

const roomLight = new THREE.PointLight(0xfff1bd, 1.2, 9);
roomLight.position.set(0, 3.3, 0);
roomLight.castShadow = false;
scene.add(roomLight);

const alertLight = new THREE.PointLight(0xff5b6e, 0, 8);
alertLight.position.set(-2.8, 2.4, -2.4);
scene.add(alertLight);

const objects = {};
const animated = {};
const clock = new THREE.Clock();
const dayState = {
  mode: "day",
  bg: new THREE.Color(0xeee4d5),
  fog: new THREE.Color(0xeee4d5),
  window: new THREE.Color(0xbff0ff),
};

buildWarmRoom(scene, objects, animated, materials);

function addPart(parent, geometry, material, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createPerson() {
  const group = new THREE.Group();
  group.position.set(-4.65, 0, 1.45);
  group.rotation.y = Math.PI / 2;
  group.visible = false;

  const hips = new THREE.Group();
  hips.position.y = 0.52;
  group.add(hips);

  const torso = addPart(hips, new THREE.CapsuleGeometry(0.22, 0.58, 8, 18), materials.clothing, [0, 0.42, 0]);
  torso.scale.set(0.9, 1, 0.72);
  const head = addPart(hips, new THREE.SphereGeometry(0.18, 28, 18), materials.skin, [0, 0.93, 0]);
  head.scale.set(0.9, 1.04, 0.86);
  addPart(hips, new THREE.SphereGeometry(0.19, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), new THREE.MeshStandardMaterial({ color: 0xbcc3c9, roughness: 0.9 }), [0, 1.03, 0], [0, 0, 0]);
  addPart(hips, new THREE.TorusGeometry(0.062, 0.006, 8, 18), materials.metal, [-0.065, 0.94, 0.155]);
  addPart(hips, new THREE.TorusGeometry(0.062, 0.006, 8, 18), materials.metal, [0.065, 0.94, 0.155]);
  addPart(hips, new THREE.BoxGeometry(0.09, 0.01, 0.012), materials.metal, [0, 0.94, 0.155]);
  addPart(hips, new THREE.BoxGeometry(0.26, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0xdde6eb, roughness: 0.82 }), [0, 0.75, 0.035]);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.25, 0.67, 0);
  hips.add(leftArm);
  addPart(leftArm, new THREE.CapsuleGeometry(0.055, 0.48, 6, 12), materials.skin, [0, -0.23, 0], [0, 0, -0.18]);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.25, 0.67, 0);
  hips.add(rightArm);
  addPart(rightArm, new THREE.CapsuleGeometry(0.055, 0.48, 6, 12), materials.skin, [0, -0.23, 0], [0, 0, 0.18]);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.11, 0.12, 0);
  hips.add(leftLeg);
  addPart(leftLeg, new THREE.CapsuleGeometry(0.065, 0.56, 6, 12), materials.trouser, [0, -0.28, 0]);
  addPart(leftLeg, new THREE.BoxGeometry(0.16, 0.07, 0.26), new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.86 }), [0, -0.6, 0.06]);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.11, 0.12, 0);
  hips.add(rightLeg);
  addPart(rightLeg, new THREE.CapsuleGeometry(0.065, 0.56, 6, 12), materials.trouser, [0, -0.28, 0]);
  addPart(rightLeg, new THREE.BoxGeometry(0.16, 0.07, 0.26), new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.86 }), [0, -0.6, 0.06]);

  addPart(group, new THREE.CylinderGeometry(0.018, 0.018, 0.92, 12), materials.metal, [0.33, 0.46, 0.06], [0.16, 0, 0.04]);
  addPart(group, new THREE.SphereGeometry(0.042, 12, 8), materials.wood, [0.39, 0.91, 0.07]);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.48, 40), materials.softShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);

  scene.add(group);
  return { group, hips, leftArm, rightArm, leftLeg, rightLeg };
}

const person = createPerson();
const personState = {
  present: false,
  pathIndex: 0,
  speed: 1.15,
  waypoints: [
    new THREE.Vector3(-2.85, 0, 1.45),
    new THREE.Vector3(-1.2, 0, 1.15),
    new THREE.Vector3(0.1, 0, 0.65),
    new THREE.Vector3(0.65, 0, 0.15),
    new THREE.Vector3(-0.6, 0, 0.65),
  ],
  exitStage: 0,
  exitPoint: new THREE.Vector3(-4.65, 0, 1.45),
};

const labelLayer = document.createElement("div");
labelLayer.className = "labels";
document.body.appendChild(labelLayer);

const sceneDevices = new Set([objects.ceilingLamp, objects.buzzer]);
const deviceFeedback = document.querySelector("#deviceFeedback");
let commandPending = false;
// Legacy firmware does not report the lamp output. Remember successful commands
// per connection; the first click opens the lamp until output telemetry exists.
let commandedLamp = null;
let latestSceneData = null;
function activateDevice(target) {
  if (target === objects.ceilingLamp) sendCommand(lampState() === true ? "/ledoff" : "/ledon");
  if (target === objects.buzzer) sendCommand("/beep");
}

function reflectCommand(path) {
  if (path === "/ledon") commandedLamp = true;
  if (path === "/ledoff") commandedLamp = false;
  if (path === "/auto") commandedLamp = null;
  if (latestSceneData) updateScene(latestSceneData);
  else renderLampState();
}

function lampState() {
  if (commandedLamp !== null) return commandedLamp;
  if (sourceMode() === "demo" && latestSceneData) return Boolean(latestSceneData.pir);
  return null;
}

function renderLampState() {
  const state = lampState();
  const on = state === true;
  objects.ceilingLamp.material.color.setHex(on ? 0xffe3a0 : 0xa89f91);
  objects.ceilingLamp.material.emissive.setHex(on ? 0xffbb55 : 0x000000);
  objects.ceilingLamp.material.emissiveIntensity = on ? 0.8 : 0;
  animated.lampDiffuser.material.color.setHex(on ? 0xfff4cc : 0x9b968c);
  animated.lampDiffuser.material.emissive.setHex(on ? 0xffdc8b : 0x000000);
  animated.lampDiffuser.material.emissiveIntensity = on ? 1.6 : 0;
  animated.lampGlow.visible = on;
  animated.lampGlow.material.opacity = on ? 0.38 : 0;
  animated.lampPool.visible = on;
  roomLight.intensity = on ? 2.8 : 0;
  const label = labels.find(({ target }) => target === objects.ceilingLamp)?.el;
  if (label) {
    label.textContent = `照明 · ${state === null ? "待同步" : on ? "已开" : "已关"}`;
    label.dataset.lampState = state === null ? "unknown" : on ? "on" : "off";
    label.title = state === null ? "硬件未回传灯状态，点击开灯" : `${on ? "点击关灯" : "点击开灯"}（根据最近发送的指令显示）`;
  }
}

const deviceRaycaster = new THREE.Raycaster();
const devicePointer = new THREE.Vector2();
function pickDevice(event) {
  const rect = els.canvas.getBoundingClientRect();
  devicePointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  deviceRaycaster.setFromCamera(devicePointer, camera);
  // Respect furniture and walls; translucent glows do not block device selection.
  const hit = deviceRaycaster.intersectObjects(scene.children, true).find(({ object }) => {
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
    return object.isMesh && !object.material.transparent;
  });
  for (let target = hit?.object; target; target = target.parent) {
    if (sceneDevices.has(target)) return target;
  }
  return null;
}
const activePointers = new Set();
let devicePress = null;
els.canvas.addEventListener("pointerdown", (event) => {
  activePointers.add(event.pointerId);
  devicePress = activePointers.size === 1 && event.button === 0
    ? { id: event.pointerId, x: event.clientX, y: event.clientY, target: pickDevice(event) } : null;
});
els.canvas.addEventListener("pointermove", (event) => {
  if (devicePress && Math.hypot(event.clientX - devicePress.x, event.clientY - devicePress.y) > 6) devicePress = null;
  els.canvas.style.cursor = pickDevice(event) ? "pointer" : "grab";
});
els.canvas.addEventListener("pointerup", (event) => {
  if (devicePress?.id === event.pointerId && devicePress.target && devicePress.target === pickDevice(event)) activateDevice(devicePress.target);
  activePointers.delete(event.pointerId);
  devicePress = null;
});
els.canvas.addEventListener("pointercancel", (event) => { activePointers.delete(event.pointerId); devicePress = null; });

const labels = [
  ["温湿度", objects.tempSensor],
  ["光感", objects.lightSensor],
  ["人体存在", objects.pirSensor],
  ["蜂鸣器", objects.buzzer],
  ["照明", objects.ceilingLamp],
].map(([text, target]) => {
  const interactive = sceneDevices.has(target);
  const el = document.createElement(interactive ? "button" : "div");
  el.className = `room-label${interactive ? " device-label" : ""}`;
  if (interactive) {
    el.type = "button";
    el.title = target === objects.ceilingLamp ? "点击切换开关" : "点击响一声";
    el.addEventListener("click", () => activateDevice(target));
  }
  el.textContent = text;
  labelLayer.appendChild(el);
  return { el, target };
});

const style = document.createElement("style");
style.textContent = `
  .labels{position:fixed;inset:0;pointer-events:none;z-index:3}
  .room-label{position:absolute;transform:translate(-50%,-50%);border:1px solid rgba(126,104,78,.2);border-radius:999px;background:rgba(255,250,240,.9);color:#70604d;padding:5px 9px;font:11px Inter,"PingFang SC",sans-serif;white-space:nowrap;box-shadow:0 3px 12px #5941250a}
`;
document.head.appendChild(style);

function endpointBase() {
  return els.endpoint.value.trim().replace(/\/+$/, "") || DEFAULT_ENDPOINT;
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function requestUrl(path) {
  const base = endpointBase();
  if (isLocalPreview() && !base.startsWith(window.location.origin)) {
    const params = new URLSearchParams({ base, path });
    return `/proxy?${params.toString()}`;
  }
  return `${base}${path}`;
}

function setConnection(state, text) {
  els.connection.className = "status-pill";
  if (state === "online") els.connection.classList.add("online");
  if (state === "alarm") els.connection.classList.add("alarm");
  els.connection.textContent = text;
}

function sourceMode() {
  return DEMO_MODE ? "demo" : els.sourceMode.value;
}

function setSourceMode(mode) {
  commandedLamp = null;
  latestSceneData = null;
  renderLampState();
  els.sourceMode.value = mode;
  if (!DEMO_MODE) localStorage.setItem(SOURCE_KEY, mode);
  updateSourceControls();
  fetchData();
}

function updateSourceControls() {
  const mode = sourceMode();
  const serialSupported = "serial" in navigator;
  els.sourceMode.disabled = DEMO_MODE;
  els.endpoint.disabled = mode !== "http";
  els.saveEndpoint.disabled = mode !== "http";
  els.serialConnect.disabled = mode !== "serial" || !serialSupported || serialState.connected;
  els.serialDisconnect.disabled = mode !== "serial" || !serialState.connected;
  els.serialConnect.textContent = serialState.connected ? "已连接" : "连接串口";
  if (mode === "serial" && !serialSupported) {
    setConnection("offline", "浏览器不支持串口");
    els.lastUpdated.textContent = "请使用 Chrome 或 Edge 的 localhost 页面打开，并允许 Web Serial";
  }
}

function consumeSerialText(text) {
  serialState.buffer += text;
  const lines = serialState.buffer.split(/\r?\n/);
  serialState.buffer = lines.pop() || "";
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return;
    try {
      const data = JSON.parse(trimmed);
      serialState.lastDataAt = performance.now();
      updateUi(normalizeData(data));
    } catch (error) {
      els.lastUpdated.textContent = `串口数据解析失败：${trimmed.slice(0, 80)}`;
    }
  });
}

async function readSerialLoop() {
  if (serialState.reading || !serialState.port?.readable) return;
  serialState.reading = true;
  const decoder = new TextDecoder();
  while (serialState.port?.readable && serialState.connected) {
    const reader = serialState.port.readable.getReader();
    serialState.reader = reader;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) consumeSerialText(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      if (serialState.connected) {
        setConnection("offline", "串口读取中断");
        els.lastUpdated.textContent = error.message || "串口读取中断";
      }
    } finally {
      reader.releaseLock();
      if (serialState.reader === reader) serialState.reader = null;
    }
  }
  serialState.reading = false;
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    updateSourceControls();
    return;
  }
  try {
    serialState.port = await navigator.serial.requestPort();
    await serialState.port.open({ baudRate: SERIAL_BAUD_RATE });
    serialState.writer = serialState.port.writable.getWriter();
    serialState.connected = true;
    serialState.buffer = "";
    setConnection("online", "串口已连接");
    els.lastUpdated.textContent = "USB 串口已连接，正在等待传感器数据";
    updateSourceControls();
    readSerialLoop();
    await writeSerial("STATUS");
  } catch (error) {
    serialState.connected = false;
    setConnection("offline", "串口连接失败");
    els.lastUpdated.textContent = error.message || "串口连接失败";
    updateSourceControls();
  }
}

async function disconnectSerial() {
  try {
    serialState.connected = false;
    if (serialState.reader) {
      await serialState.reader.cancel();
    }
    if (serialState.writer) {
      serialState.writer.releaseLock();
      serialState.writer = null;
    }
    if (serialState.port) {
      await serialState.port.close();
      serialState.port = null;
    }
    setConnection("offline", "串口已断开");
    els.lastUpdated.textContent = "USB 串口已断开";
  } catch (error) {
    els.lastUpdated.textContent = error.message || "串口断开失败";
  } finally {
    updateSourceControls();
  }
}

async function writeSerial(command) {
  if (!serialState.connected || !serialState.writer) throw new Error("串口未连接");
  const encoder = new TextEncoder();
  await serialState.writer.write(encoder.encode(`${command}\n`));
}

function levelInfo(level) {
  if (level === 2) return { text: "告警", material: materials.bad, color: "#ff5b6e" };
  if (level === 1) return { text: "提醒", material: materials.warn, color: "#ffc857" };
  return { text: "正常", material: materials.good, color: "#3ddc97" };
}

function dayMode(light) {
  if (light > 2300) return "night";
  if (light > DARK_THRESHOLD) return "dusk";
  return "day";
}

function applyDayNight(light) {
  const mode = dayMode(light);
  const palette = {
    day: {
      bg: 0xd7eaf0,
      fog: 0xd7eaf0,
      sky: 0x9dd8f0,
      wall: 0xf4e7d5,
      floor: 0xffffff,
      sun: 1,
      moon: 0,
      city: 0,
      hemi: 1.85,
      sunLight: 2.4,
      room: 0.68,
      glow: 0.1,
      bedGlow: 0.08,
      label: "白天",
    },
    dusk: {
      bg: 0xe5cdbd,
      fog: 0xe5cdbd,
      sky: 0xe9bca2,
      wall: 0xf4dfc9,
      floor: 0xffeedb,
      sun: 0.75,
      moon: 0.25,
      city: 0.78,
      hemi: 1.3,
      sunLight: 1.5,
      room: 1.15,
      glow: 0.24,
      bedGlow: 0.28,
      label: "黄昏",
    },
    night: {
      bg: 0x202c4b,
      fog: 0x202c4b,
      sky: 0x192947,
      wall: 0xd2c7b7,
      floor: 0xe3d4c2,
      sun: 0,
      moon: 1,
      city: 1,
      hemi: 0.65,
      sunLight: 0.45,
      room: 1.75,
      glow: 0.38,
      bedGlow: 0.42,
      label: "夜晚",
    },
  }[mode];

  dayState.mode = mode;
  dayState.bg.setHex(palette.bg);
  dayState.fog.setHex(palette.fog);
  scene.background.lerp(dayState.bg, 0.08);
  scene.fog.color.lerp(dayState.fog, 0.08);
  objects.skyPanel?.material.color.setHex(palette.sky);
  materials.wall.color.setHex(palette.wall);
  materials.floor.color.setHex(palette.floor);
  if (animated.bedLight) animated.bedLight.intensity = mode === "day" ? 0.65 : mode === "dusk" ? 2.2 : 3.2;
  document.querySelector(".stage").dataset.time = mode;
  objects.sunDisc.material.opacity = palette.sun;
  objects.sunDisc.visible = palette.sun > 0.03;
  objects.moonDisc.material.opacity = palette.moon;
  objects.moonDisc.visible = palette.moon > 0.03;
  animated.windowLights?.forEach((mesh, index) => {
    mesh.material.color.setHex(mode === "day" ? 0xffffff : 0xffec85);
    mesh.material.opacity = palette.city * (0.7 + (index % 2) * 0.3);
    mesh.material.transparent = true;
  });
  hemi.intensity = palette.hemi;
  hemi.color.setHex(mode === "night" ? 0x9ebcff : mode === "dusk" ? 0xffd5b5 : 0xfff4e2);
  sun.color.setHex(mode === "night" ? 0xaac8ff : mode === "dusk" ? 0xffba7c : 0xfff6df);
  sun.intensity = palette.sunLight;
  if (animated.bedLampGlow) animated.bedLampGlow.material.opacity = palette.bedGlow;
  return palette.label;
}

function setPersonPresence(present) {
  if (personState.present === Boolean(present)) return;
  personState.present = Boolean(present);
  if (personState.present) {
    person.group.visible = true;
    personState.pathIndex = person.group.position.x < -2.85 ? 0 : 1;
  } else {
    personState.exitStage = person.group.position.x < -2.85 ? 1 : 0;
  }
}

function updateScene(data) {
  latestSceneData = data;
  const info = levelInfo(data.level);
  const dayLabel = applyDayNight(data.light);
  objects.tempSensor.material = data.level === 2 ? materials.bad : materials.sensor;
  objects.lightSensor.material = data.light > DARK_THRESHOLD ? materials.warn : materials.good;
  objects.pirSensor.material = data.pir ? materials.good : materials.dim;
  objects.buzzer.material = data.muted ? materials.dim : info.material;
  animated.pirCone.material.opacity = data.pir ? 0.025 : 0;
  animated.pirCone.material.color.set(data.pir ? 0x3ddc97 : 0x6b7782);
  renderLampState();
  alertLight.intensity = data.level === 2 ? 2.8 : data.level === 1 ? 1.1 : 0;
  setPersonPresence(data.pir === 1);
  return dayLabel;
}

function updateUi(data) {
  const info = levelInfo(data.level);
  els.temp.textContent = data.temp;
  els.hum.textContent = data.hum;
  els.light.textContent = data.light;
  els.pir.textContent = data.pir ? "有人" : "无人";
  els.idle.textContent = data.idle;
  els.count.textContent = data.count;
  els.level.textContent = info.text;
  els.level.style.color = info.color;
  els.mode.textContent = data.auto ? "自动模式" : "手动模式";
  els.muted.textContent = data.muted ? "已静音" : "未静音";
  const dayLabel = updateScene(data);
  els.lightState.textContent = data.light > DARK_THRESHOLD ? `${dayLabel} / 偏暗` : `${dayLabel} / 光线正常`;
  els.advice.textContent = adviceFor(data);
  els.lastUpdated.textContent = `最后更新 ${new Date().toLocaleTimeString()}`;
  setConnection(data.level === 2 ? "alarm" : "online", data.level === 2 ? "设备告警" : "实时在线");
}

function adviceFor(data) {
  if (data.temp === -99 || data.hum === -99) return "温湿度传感器异常";
  if (data.level === 2) return "请立即查看现场状态";
  if (!data.pir && data.idle > 15) return "长时间无人活动";
  if (data.light > DARK_THRESHOLD) return "环境偏暗，可打开照明";
  return "环境状态稳定";
}

async function fetchData() {
  const mode = sourceMode();
  if (mode === "demo") {
    const phase = Math.floor(performance.now() / 7000) % 3;
    const present = Math.floor(performance.now() / 9000) % 2 === 0;
    const demoLight = [960, 1840, 2820][phase];
    updateUi(normalizeData({
      temp: 24.8,
      hum: 58,
      light: demoLight,
      pir: present ? 1 : 0,
      idle: present ? 0 : Math.floor((performance.now() % 9000) / 1000),
      level: present ? 0 : 1,
      muted: 0,
      auto: 1,
      count: present ? 0 : 1,
    }));
    els.lastUpdated.textContent = `演示模式 ${new Date().toLocaleTimeString()}`;
    return;
  }

  if (mode === "serial") {
    if (!serialState.connected) {
      setConnection("offline", "串口未连接");
      els.lastUpdated.textContent = "请点击“连接串口”，选择 ESP32 的 USB 串口";
      return;
    }
    try {
      await writeSerial("STATUS");
      const waiting = performance.now() - serialState.lastDataAt > POLL_MS * 1.8;
      if (waiting) els.lastUpdated.textContent = "已向串口发送 STATUS，等待设备返回数据";
    } catch (error) {
      setConnection("offline", "串口读取失败");
      els.lastUpdated.textContent = error.message || "串口读取失败";
    }
    return;
  }

  const url = requestUrl("/api");
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.proxyError) throw new Error(data.message || "ESP32 connection failed");
    updateUi(normalizeData(data));
  } catch (error) {
    setConnection("offline", "连接失败");
    els.lastUpdated.textContent = `无法读取 ${url}，请确认已连接 ESP32 热点或代理允许跨域`;
  }
}

function normalizeData(data) {
  return {
    temp: Number(data.temp ?? -99),
    hum: Number(data.hum ?? -99),
    light: Number(data.light ?? 0),
    pir: Number(data.pir ?? 0),
    idle: Number(data.idle ?? 0),
    level: Number(data.level ?? 0),
    muted: Number(data.muted ?? 0),
    auto: Number(data.auto ?? 0),
    count: Number(data.count ?? 0),
  };
}

async function sendCommand(path, button) {
  if (commandPending) return;
  commandPending = true;
  if (button) button.disabled = true;
  deviceFeedback.textContent = "正在发送指令…";
  try {
    if (sourceMode() === "demo") {
      reflectCommand(path);
      deviceFeedback.textContent = path === "/beep" ? "演示：蜂鸣一次（未发送到硬件）" : "演示：已切换灯光（未发送到硬件）";
      return;
    }
    if (sourceMode() === "serial") {
      const command = SERIAL_COMMANDS[path];
      if (!command) throw new Error(`未知串口指令：${path}`);
      await writeSerial(command);
      reflectCommand(path);
      await writeSerial("STATUS");
      deviceFeedback.textContent = "指令已写入串口，等待设备回传。";
      return;
    }
    const response = await fetch(requestUrl(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (data.proxyError) throw new Error(data.message || "ESP32 connection failed");
    }
    reflectCommand(path);
    await fetchData();
    deviceFeedback.textContent = "设备已接收控制指令。";
  } catch (error) {
    setConnection("offline", "控制失败");
    els.lastUpdated.textContent = `控制指令 ${path} 发送失败`;
    deviceFeedback.textContent = `控制失败：${error.message || "请检查设备连接"}`;
  } finally {
    commandPending = false;
    if (button) button.disabled = false;
  }
}

els.saveEndpoint.addEventListener("click", () => {
  localStorage.setItem("esp32-care-endpoint", endpointBase());
  setSourceMode("http");
});

els.refresh.addEventListener("click", fetchData);
els.sourceMode.addEventListener("change", () => setSourceMode(els.sourceMode.value));
els.serialConnect.addEventListener("click", () => {
  setSourceMode("serial");
  connectSerial();
});
els.serialDisconnect.addEventListener("click", disconnectSerial);

els.commandButtons.forEach((button) => {
  button.addEventListener("click", () => sendCommand(button.dataset.command, button));
});

function resize() {
  const rect = els.canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

function updateLabels() {
  const rect = els.canvas.getBoundingClientRect();
  labels.forEach(({ el, target }) => {
    const position = target.position.clone();
    position.y += 0.34;
    position.project(camera);
    const x = THREE.MathUtils.clamp(rect.left + (position.x * 0.5 + 0.5) * rect.width, rect.left + 42, rect.right - 42);
    const y = THREE.MathUtils.clamp(rect.top + (-position.y * 0.5 + 0.5) * rect.height, rect.top + 92, rect.bottom - 36);
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    el.style.opacity = position.z > 1 ? "0" : "1";
  });
}

function movePerson(delta, time) {
  // Return to the inside landing before crossing the door, avoiding the wall.
  const target = personState.present ? personState.waypoints[personState.pathIndex]
    : personState.exitStage === 0 ? personState.waypoints[0] : personState.exitPoint;
  const position = person.group.position;
  const direction = target.clone().sub(position);
  const distance = direction.length();

  const crossing = person.group.visible && position.x < -2.55;
  animated.doorHinge.rotation.y = THREE.MathUtils.damp(animated.doorHinge.rotation.y, crossing ? -Math.PI * 0.48 : 0, 5, delta);
  const waitingForDoor = crossing && Math.abs(animated.doorHinge.rotation.y) < 1.15;
  if (distance > 0.03 && person.group.visible && !waitingForDoor) {
    direction.normalize();
    const step = Math.min(distance, personState.speed * delta);
    position.addScaledVector(direction, step);
    const targetAngle = Math.atan2(direction.x, direction.z);
    let diff = targetAngle - person.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    person.group.rotation.y += diff * Math.min(1, delta * 7);
  } else if (distance <= 0.03 && personState.present) {
    personState.pathIndex = (personState.pathIndex + 1) % personState.waypoints.length;
  } else if (distance <= 0.03 && personState.exitStage === 0) {
    personState.exitStage = 1;
  } else if (distance <= 0.03) {
    person.group.visible = false;
  }

  if (person.group.visible) {
    const walking = distance > 0.04 && !waitingForDoor;
    const gait = walking ? Math.sin(time * 0.009) : Math.sin(time * 0.002) * 0.18;
    person.hips.position.y = 0.52 + Math.abs(gait) * 0.025;
    person.leftLeg.rotation.x = gait * 0.55;
    person.rightLeg.rotation.x = -gait * 0.55;
    person.leftArm.rotation.x = -gait * 0.42;
    person.rightArm.rotation.x = gait * 0.42;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  scene.background.lerp(dayState.bg, 1 - Math.exp(-delta * 2));
  scene.fog.color.copy(scene.background);
  controls.update();
  const time = performance.now();
  const skyCycle = animated.skyCycle;
  if (skyCycle) {
    const blend = 1 - Math.exp(-delta * 2);
    skyCycle.day = THREE.MathUtils.lerp(skyCycle.day, dayState.mode === "night" ? 0 : 1, blend);
    skyCycle.night = THREE.MathUtils.lerp(skyCycle.night, dayState.mode === "night" ? 1 : 0, blend);
    skyCycle.sky.quaternion.copy(camera.quaternion);
    skyCycle.sky.position.y = 4.45 + Math.sin(time * 0.0006) * 0.045;
    for (const [group, opacity] of [[skyCycle.daylight, skyCycle.day], [skyCycle.moonlight, skyCycle.night]]) {
      group.visible = opacity > 0.005;
      group.traverse((child) => {
        if (child.isMesh) child.material.opacity = child.userData.skyOpacity * opacity;
      });
    }
    skyCycle.daylight.position.y = dayState.mode === "dusk" ? -0.2 : 0;
    skyCycle.rays.rotation.z = time * 0.00006;
    skyCycle.stars.forEach((star, index) => {
      star.material.opacity *= 0.65 + Math.sin(time * 0.0014 + index * 1.8) * 0.35;
    });
  }
  const pulse = 1 + Math.sin(time * 0.004) * 0.04;
  objects.pirSensor.scale.set(0.55 * pulse, 1 * pulse, 1 * pulse);
  animated.pirCone.scale.setScalar(1 + Math.sin(time * 0.002) * 0.035);
  animated.lampGlow.scale.set(1 + Math.sin(time * 0.003) * 0.04, 0.38, 1 + Math.sin(time * 0.003) * 0.04);
  animated.screenLines?.forEach((line, index) => {
    const width = line.userData.baseWidth * (0.78 + Math.sin(time * 0.004 + index * 1.3) * 0.18);
    line.scale.x = Math.max(0.35, width / line.userData.baseWidth);
  });
  objects.tempSensor.rotation.y += 0.01;
  objects.lightSensor.rotation.y -= 0.008;
  movePerson(delta, time);
  renderer.render(scene, camera);
  updateLabels();
}

window.addEventListener("resize", resize);
resize();
renderLampState();
animate();
updateSourceControls();
fetchData();
setInterval(fetchData, POLL_MS);
