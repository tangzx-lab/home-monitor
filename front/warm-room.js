import * as THREE from "three";

// A cutaway home: the wall segments leave real openings for the door and window.
export function buildWarmRoom(scene, objects, animated, materials) {
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const cream = mat(0xf9eedc), oak = mat(0xc6a17d), sage = mat(0x91aa93);
  const linen = mat(0xf2debe), rose = mat(0xcc9280), brass = mat(0xb28a4d);
  const green = mat(0x68836a), ivory = mat(0xfff8e9);
  const add = (name, geometry, position, material, parent = scene) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (name) objects[name] = mesh;
    return mesh;
  };
  const box = (name, size, pos, material, parent) => add(name, new THREE.BoxGeometry(...size), pos, material, parent);
  const round = (name, size, pos, material, radius = 0.06, parent) => {
    const [w, h, d] = size;
    const r = Math.min(radius, w / 2.1, h / 2.1, d / 2.1);
    const x = w / 2 - r, y = h / 2 - r;
    const shape = new THREE.Shape();
    shape.moveTo(-x, -y); shape.lineTo(x, -y); shape.lineTo(x, y);
    shape.lineTo(-x, y); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: r, bevelThickness: r, curveSegments: 8 });
    geo.center();
    return add(name, geo, pos, material, parent);
  };
  const ball = (name, radius, pos, material, scale = [1, 1, 1]) => {
    const mesh = add(name, new THREE.SphereGeometry(radius, 24, 16), pos, material);
    mesh.scale.set(...scale); return mesh;
  };
  const cylinder = (name, top, bottom, height, pos, material) => add(name, new THREE.CylinderGeometry(top, bottom, height, 32), pos, material);

  // A camera-facing sky ornament above the roofline, readable even at room scale.
  const sky = new THREE.Group();
  sky.position.set(0.5, 4.45, -2.5);
  scene.add(sky);
  const daylight = new THREE.Group(), moonlight = new THREE.Group();
  sky.add(daylight, moonlight);
  const skyMesh = (geometry, color, parent, x = 0, y = 0, opacity = 1) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    mesh.userData.skyOpacity = opacity;
    parent.add(mesh);
    return mesh;
  };
  skyMesh(new THREE.CircleGeometry(0.78, 64), 0xffdc8b, daylight, 0, 0, 0.1);
  skyMesh(new THREE.CircleGeometry(0.62, 64), 0xffda80, daylight, 0, 0, 0.18);
  skyMesh(new THREE.SphereGeometry(0.38, 32, 24), 0xffcc58, daylight);
  const rays = new THREE.Group();
  daylight.add(rays);
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const ray = skyMesh(new THREE.CapsuleGeometry(0.026, 0.12, 4, 8), 0xffd878, rays, Math.sin(angle) * 0.53, Math.cos(angle) * 0.53);
    ray.rotation.z = -angle;
  }
  // A true crescent silhouette, with no background-colored masking disc.
  const crescent = new THREE.Shape();
  crescent.moveTo(0.21, 0.46);
  crescent.bezierCurveTo(-0.55, 0.57, -0.65, -0.48, 0.08, -0.5);
  crescent.bezierCurveTo(0.34, -0.51, 0.49, -0.34, 0.51, -0.16);
  crescent.bezierCurveTo(-0.05, -0.39, -0.29, 0.13, 0.21, 0.46);
  skyMesh(new THREE.CircleGeometry(0.76, 64), 0xb4cfff, moonlight, 0, 0, 0.08);
  skyMesh(new THREE.ShapeGeometry(crescent, 40), 0xffefbc, moonlight);
  const stars = [];
  for (const [x, y, size] of [[-1.1, 0.32, 0.08], [0.92, 0.48, 0.07], [1.35, -0.12, 0.055], [-0.83, -0.4, 0.045], [0.63, -0.56, 0.05]]) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, r = i % 2 ? size * 0.28 : size;
      if (i === 0) shape.moveTo(0, r);
      else shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
    }
    shape.closePath();
    stars.push(skyMesh(new THREE.ShapeGeometry(shape), 0xe5efff, moonlight, x, y));
  }
  moonlight.visible = false;
  animated.skyCycle = { sky, daylight, moonlight, rays, stars, day: 1, night: 0 };

  round("foundation", [8.08, 0.3, 6.68], [0, -0.22, 0], cream, 0.12);
  box("floor", [7.8, 0.12, 6.4], [0, -0.06, 0], materials.floor);
  // Fine, staggered oak planks instead of a dark square grid.
  const seam = mat(0xb89c7c);
  for (let z = -2.8, row = 0; z < 3.2; z += 0.4, row++) {
    box(null, [7.78, 0.002, 0.009], [0, 0.002, z], seam);
    for (let x = -3.9 + (row % 3) * 0.58; x < 3.9; x += 1.74) {
      box(null, [0.008, 0.002, 0.39], [x, 0.002, z + 0.2], seam);
    }
  }

  // Window opening: x=1.15..3.25, y=1.55..2.95. Door: z=.8..2.1.
  box("backWall", [5.05, 3.4, 0.18], [-1.375, 1.7, -3.2], materials.wall);
  box(null, [0.65, 3.4, 0.18], [3.575, 1.7, -3.2], materials.wall);
  box(null, [2.1, 1.55, 0.18], [2.2, 0.775, -3.2], materials.wall);
  box(null, [2.1, 0.45, 0.18], [2.2, 3.175, -3.2], materials.wall);
  box("leftWall", [0.18, 3.4, 4], [-3.9, 1.7, -1.2], materials.wall);
  box(null, [0.18, 3.4, 1.1], [-3.9, 1.7, 2.65], materials.wall);
  box(null, [0.18, 0.9, 1.3], [-3.9, 2.95, 1.45], materials.wall);
  // Low sage wainscot and continuous trim, interrupted at the doorway.
  box(null, [7.72, 0.86, 0.035], [0, 0.45, -3.09], sage);
  box(null, [7.76, 0.055, 0.075], [0, 0.91, -3.065], cream);
  box(null, [7.78, 0.13, 0.08], [0, 0.075, -3.06], cream);
  for (const [z, width] of [[-1.2, 4], [2.65, 1.1]]) {
    box(null, [0.035, 0.86, width], [-3.79, 0.45, z], sage);
    box(null, [0.075, 0.055, width], [-3.765, 0.91, z], cream);
    box(null, [0.08, 0.13, width], [-3.76, 0.075, z], cream);
  }
  for (let x = -3.5; x < 3.9; x += 0.62) box(null, [0.025, 0.73, 0.035], [x, 0.46, -3.055], cream);
  box(null, [7.98, 0.1, 0.26], [0, 3.42, -3.2], cream);
  box(null, [0.26, 0.1, 6.6], [-3.9, 3.42, 0], cream);

  for (const z of [0.76, 2.14]) round(null, [0.26, 2.56, 0.1], [-3.85, 1.28, z], cream, 0.025);
  round(null, [0.26, 0.12, 1.5], [-3.85, 2.56, 1.45], cream, 0.025);
  box(null, [0.32, 0.025, 1.3], [-3.9, 0.012, 1.45], oak);
  const hinge = new THREE.Group();
  hinge.position.set(-3.9, 0, 0.84);
  scene.add(hinge); animated.doorHinge = hinge;
  round("door", [0.08, 2.44, 1.22], [0, 1.24, 0.61], oak, 0.025, hinge);
  for (const y of [0.65, 1.78]) round(null, [0.025, 0.82, 0.94], [0.051, y, 0.61], linen, 0.01, hinge);
  box(null, [0.035, 0.2, 0.075], [0.075, 1.16, 1.08], brass, hinge);
  round("doorKnob", [0.11, 0.035, 0.18], [0.13, 1.16, 1.03], brass, 0.013, hinge);
  round(null, [0.7, 0.025, 1.18], [-4.3, 0.01, 1.45], linen, 0.01);

  const skyMat = new THREE.MeshBasicMaterial({ color: 0xc7dfdf });
  box("skyPanel", [2.1, 1.4, 0.025], [2.2, 2.25, -3.27], skyMat).castShadow = false;
  for (const x of [1.1, 3.3]) box(null, [0.11, 1.53, 0.2], [x, 2.25, -3.17], cream);
  for (const y of [1.51, 2.99]) box(null, [2.3, 0.11, 0.2], [2.2, y, -3.17], cream);
  box(null, [0.06, 1.42, 0.13], [2.2, 2.25, -3.1], cream);
  box(null, [2.1, 0.045, 0.13], [2.2, 2.17, -3.1], cream);
  round(null, [2.52, 0.1, 0.4], [2.2, 1.49, -3.03], cream, 0.025);
  objects.sunDisc = ball("sunDisc", 0.16, [1.65, 2.65, -3.22], new THREE.MeshBasicMaterial({ color: 0xffe4a0, transparent: true }), [1, 1, 0.1]);
  objects.moonDisc = ball("moonDisc", 0.13, [2.7, 2.66, -3.22], new THREE.MeshBasicMaterial({ color: 0xfff5d5, transparent: true, opacity: 0 }), [1, 1, 0.1]);
  animated.windowLights = [];
  for (let i = 0; i < 7; i++) {
    animated.windowLights.push(ball(null, 0.018, [1.35 + i * 0.28, 2.48 + Math.sin(i * 2) * 0.25, -3.225], new THREE.MeshBasicMaterial({ color: 0xfff5d5, transparent: true }), [1, 1, 0.1]));
  }
  const rod = cylinder(null, 0.025, 0.025, 2.8, [2.2, 3.12, -2.91], brass);
  rod.rotation.z = Math.PI / 2;
  for (const x of [0.99, 3.4]) {
    for (let i = 0; i < 5; i++) {
      const fold = cylinder(null, 0.06, 0.085, 1.65, [x + (i - 2) * 0.079, 2.2, -2.94 + Math.cos(i * Math.PI) * 0.025], linen);
      fold.scale.z = 0.65;
    }
    round(null, [0.42, 0.08, 0.15], [x, 1.9, -2.86], rose, 0.03);
  }

  // Upholstered daybed with a wood base and layered cotton bedding.
  for (const x of [-2.62, -0.32]) for (const z of [-1.75, -0.38]) cylinder(null, 0.065, 0.045, 0.3, [x, 0.15, z], oak);
  round("bedFrame", [2.78, 0.3, 1.9], [-1.45, 0.36, -1.07], oak, 0.07);
  round("headboard", [0.18, 1.15, 1.95], [-2.86, 0.89, -1.07], sage, 0.08);
  round("mattress", [2.55, 0.29, 1.72], [-1.45, 0.63, -1.07], ivory, 0.12);
  round("blanket", [1.62, 0.16, 1.76], [-1, 0.81, -1.07], sage, 0.065);
  round(null, [0.48, 0.075, 1.79], [-0.44, 0.91, -1.07], linen, 0.028);
  for (const z of [-1.48, -0.68]) {
    round(null, [0.55, 0.2, 0.61], [-2.35, 0.87, z], ivory, 0.09).rotation.z = -0.15;
  }
  round(null, [0.34, 0.26, 0.48], [-1.98, 0.95, -1.08], rose, 0.1).rotation.z = -0.3;
  round("cabinet", [0.92, 0.79, 0.72], [0.72, 0.43, -2.35], oak, 0.045);
  for (const y of [0.3, 0.62]) {
    round(null, [0.81, 0.25, 0.045], [0.72, y, -1.97], cream, 0.02);
    ball(null, 0.035, [0.72, y, -1.92], brass);
  }
  cylinder(null, 0.15, 0.18, 0.045, [0.72, 0.85, -2.35], brass);
  cylinder(null, 0.025, 0.035, 0.4, [0.72, 1.06, -2.35], brass);
  cylinder("bedLampShade", 0.17, 0.28, 0.33, [0.72, 1.38, -2.35], linen);
  const bedLight = new THREE.PointLight(0xffce91, 1.6, 3.8, 2);
  bedLight.position.set(0.72, 1.26, -2.35); scene.add(bedLight); animated.bedLight = bedLight;

  // Rounded reading chair and a small tea table, clear of the walking route.
  round("cozyRug", [2.65, 0.035, 2.05], [1.55, 0.025, 1.15], linen, 0.017);
  round(null, [2.38, 0.012, 1.78], [1.55, 0.049, 1.15], mat(0xe2c4a0), 0.005);
  round(null, [2.26, 0.012, 1.66], [1.55, 0.058, 1.15], linen, 0.005);
  for (const x of [1.97, 2.67]) for (const z of [0.75, 1.45]) cylinder(null, 0.045, 0.035, 0.32, [x, 0.22, z], oak);
  round("chairSeat", [1.05, 0.25, 1.03], [2.32, 0.48, 1.12], rose, 0.11);
  round("chairBack", [1.08, 0.95, 0.27], [2.32, 0.94, 0.67], rose, 0.12).rotation.x = -0.1;
  for (const x of [1.83, 2.81]) round(null, [0.23, 0.5, 0.94], [x, 0.72, 1.13], rose, 0.1);
  round(null, [0.5, 0.43, 0.18], [2.3, 0.96, 0.9], linen, 0.07).rotation.z = 0.18;
  cylinder(null, 0.43, 0.43, 0.085, [1.05, 0.54, 1.65], oak);
  for (const a of [0, 2.1, 4.2]) cylinder(null, 0.035, 0.045, 0.5, [1.05 + Math.cos(a) * 0.26, 0.27, 1.65 + Math.sin(a) * 0.26], oak);
  round(null, [0.3, 0.045, 0.23], [1.08, 0.606, 1.6], sage, 0.012);
  cylinder(null, 0.065, 0.055, 0.12, [0.86, 0.64, 1.73], ivory);

  const plant = (x, y, z, scale = 1) => {
    cylinder(null, 0.18 * scale, 0.13 * scale, 0.32 * scale, [x, y + 0.16 * scale, z], linen);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4;
      const leaf = ball(null, 0.22 * scale, [x + Math.cos(a) * 0.15 * scale, y + (0.5 + i * 0.035) * scale, z + Math.sin(a) * 0.15 * scale], green, [0.55, 1, 0.35]);
      leaf.rotation.set(0.3, a, Math.cos(a) * 0.6);
    }
  };
  plant(3.17, 0, -2.45, 1.6); plant(2.75, 1.55, -3, 0.55);
  round(null, [1.4, 0.075, 0.33], [-0.55, 1.65, -2.93], oak, 0.02);
  for (let i = 0; i < 5; i++) round(null, [0.11, 0.28 + (i % 2) * 0.06, 0.19], [-1.05 + i * 0.13, 1.85, -2.92], [sage, rose, linen][i % 3], 0.012);
  plant(-0.14, 1.7, -2.94, 0.45);
  // Simple sun-and-hills artwork, drawn locally, with a real mat and wood frame.
  const art = document.createElement("canvas"); art.width = 256; art.height = 320;
  const ctx = art.getContext("2d");
  ctx.fillStyle = "#f3e6d3"; ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = "#dbaa71"; ctx.beginPath(); ctx.arc(173, 91, 37, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a7b29b"; ctx.beginPath(); ctx.ellipse(69, 300, 155, 144, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#698775"; ctx.beginPath(); ctx.ellipse(222, 315, 154, 116, 0.3, 0, Math.PI * 2); ctx.fill();
  const texture = new THREE.CanvasTexture(art); texture.colorSpace = THREE.SRGBColorSpace;
  round(null, [0.88, 1.07, 0.07], [-2.12, 2.29, -3.06], oak, 0.025);
  box(null, [0.77, 0.96, 0.016], [-2.12, 2.29, -3.015], ivory);
  box(null, [0.65, 0.82, 0.012], [-2.12, 2.29, -3.003], new THREE.MeshBasicMaterial({ map: texture }));
  const clockFace = cylinder(null, 0.26, 0.26, 0.06, [-0.55, 2.63, -3.02], oak); clockFace.rotation.x = Math.PI / 2;
  const face = cylinder(null, 0.225, 0.225, 0.065, [-0.55, 2.63, -2.998], ivory); face.rotation.x = Math.PI / 2;
  box(null, [0.018, 0.15, 0.02], [-0.55, 2.69, -2.956], brass);
  box(null, [0.12, 0.018, 0.02], [-0.5, 2.63, -2.956], brass);

  // Devices sit flush on the walls; soft markers keep the home visually calm.
  round("tempSensorBody", [0.08, 0.24, 0.33], [-3.75, 2.12, -1.65], ivory, 0.025);
  ball("tempSensor", 0.045, [-3.69, 2.12, -1.65], materials.sensor);
  round("pirHousing", [0.09, 0.27, 0.3], [-3.75, 2.37, 0.25], ivory, 0.035);
  ball("pirSensor", 0.1, [-3.68, 2.37, 0.25], materials.good, [0.55, 1, 1]);
  round("lightSensorPlate", [0.25, 0.15, 0.065], [2.2, 3.19, -3.065], ivory, 0.025);
  ball("lightSensor", 0.045, [2.2, 3.19, -3.016], materials.warn);
  cylinder("buzzer", 0.085, 0.085, 0.09, [0.99, 0.88, -2.07], materials.dim);
  animated.pirCone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x91aa93, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  animated.pirCone.position.set(-3.05, 2.37, 0.25); animated.pirCone.rotation.z = Math.PI / 2; scene.add(animated.pirCone);
  const shade = new THREE.MeshStandardMaterial({ color: 0xa89f91, emissive: 0x000000, roughness: 0.9 });
  cylinder(null, 0.016, 0.016, 0.36, [0.2, 3.34, -0.1], brass);
  cylinder("ceilingLamp", 0.24, 0.45, 0.3, [0.2, 3.04, -0.1], shade);
  const diffuser = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshStandardMaterial({ color: 0x9b968c, emissive: 0x000000, side: THREE.DoubleSide }));
  diffuser.rotation.x = Math.PI / 2;
  diffuser.position.y = -0.152;
  objects.ceilingLamp.add(diffuser);
  animated.lampDiffuser = diffuser;
  const lightPool = new THREE.Mesh(new THREE.CircleGeometry(1.25, 64), new THREE.MeshBasicMaterial({ color: 0xffdc91, transparent: true, opacity: 0.12, depthWrite: false }));
  lightPool.rotation.x = -Math.PI / 2;
  lightPool.position.set(0.2, 0.008, -0.1);
  lightPool.visible = false;
  scene.add(lightPool);
  animated.lampPool = lightPool;
  animated.lampGlow = ball("lampGlow", 0.32, [0.2, 2.89, -0.1], new THREE.MeshBasicMaterial({ color: 0xffdf9f, transparent: true, opacity: 0.14, depthWrite: false }), [1, 0.08, 1]);
  animated.lampGlow.visible = false;
}
