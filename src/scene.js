import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const COLORS = [0x51c4cf, 0xffc060, 0xff526b, 0x9a8aff];
export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#09141e");
  scene.fog = new THREE.FogExp2("#09141e", 0.007);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(48, 48, 60);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Ciudad sintética en 3D: arrastra para girar y usa la rueda para acercar",
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 20;
  controls.maxDistance = 180;
  scene.add(new THREE.HemisphereLight(0xcceaff, 0x263940, 2.6));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(15, 35, 20);
  scene.add(light);
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(80, 0.6, 53),
    new THREE.MeshStandardMaterial({ color: 0x112733, roughness: 0.9 }),
  );
  ground.position.y = -0.6;
  scene.add(ground);
  const grid = new THREE.GridHelper(80, 40, 0x264958, 0x163443);
  grid.position.y = -0.25;
  scene.add(grid);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 38),
    new THREE.MeshStandardMaterial({
      color: 0x123c52,
      metalness: 0.7,
      roughness: 0.25,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.35, 43);
  scene.add(sea);
  const decorations = new THREE.Group();
  scene.add(decorations);
  // Bloques abstractos, no un mapa georreferenciado.
  for (let x = -32; x < 35; x += 5.5)
    for (let z = -15; z < 18; z += 6) {
      const h = 1.5 + (Math.abs(x * 13 + z * 7) % 5);
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, h, 2.7),
        new THREE.MeshStandardMaterial({ color: 0x1d3645, roughness: 0.8 }),
      );
      building.position.set(x, h / 2, z);
      decorations.add(building);
    }
  let people,
    network,
    world,
    states,
    selected = -1;
  const sphere = new THREE.SphereGeometry(0.32, 7, 5),
    mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
  const dummy = new THREE.Object3D(),
    color = new THREE.Color();
  function disposeNetwork() {
    if (network) {
      scene.remove(network);
      network.geometry.dispose();
      network.material.dispose();
    }
  }
  function load(next) {
    world = next;
    selected = -1;
    if (people) {
      scene.remove(people);
      people.dispose();
    }
    disposeNetwork();
    people = new THREE.InstancedMesh(sphere, mat, world.nodes.length);
    people.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(people);
    const coords = [];
    for (const [a, b] of world.edges) {
      for (const i of [a, b]) {
        const p = world.nodes[i];
        coords.push(p.x, 0.55, p.z);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
    network = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({
        color: 0x3d7384,
        transparent: true,
        opacity: 0.1,
      }),
    );
    scene.add(network);
    update(new Array(world.nodes.length).fill(0));
  }
  function update(next) {
    states = next;
    if (!world) return;
    for (let i = 0; i < world.nodes.length; i++) {
      const p = world.nodes[i],
        s = states[i];
      dummy.position.set(p.x, 0.7 + (s === 2 ? 0.25 : 0), p.z);
      dummy.scale.setScalar(s === 2 ? 1.8 : s === 1 ? 1.4 : 1);
      dummy.updateMatrix();
      people.setMatrixAt(i, dummy.matrix);
      people.setColorAt(i, color.setHex(COLORS[s]));
    }
    people.instanceMatrix.needsUpdate = true;
    people.instanceColor.needsUpdate = true;
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  new ResizeObserver(resize).observe(container);
  resize();
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    tip = document.createElement("div");
  tip.className = "node-tip";
  container.appendChild(tip);
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!people) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObject(people)[0];
    selected = hit?.instanceId ?? -1;
    tip.hidden = selected < 0;
    if (selected >= 0) {
      tip.textContent = `Persona ${selected + 1} · ${["Susceptible", "Expuesta", "Infecciosa", "Inmune / retirada"][states[selected]]} · ${world.degree[selected]} contactos`;
      tip.style.left = `${Math.min(e.clientX - rect.left + 12, rect.width - 250)}px`;
      tip.style.top = `${e.clientY - rect.top - 34}px`;
    }
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });
  let alive = true;
  function render(t) {
    if (!alive) return;
    controls.update();
    if (people && states) {
      const pulse = 1 + Math.sin(t * 0.006) * 0.12;
      for (let i = 0; i < states.length; i++)
        if (states[i] === 2) {
          const p = world.nodes[i];
          dummy.position.set(p.x, 1, p.z);
          dummy.scale.setScalar(1.8 * pulse);
          dummy.updateMatrix();
          people.setMatrixAt(i, dummy.matrix);
        }
      people.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
  return {
    load,
    update,
    toggleNetwork: (v) => {
      if (network) network.visible = v;
    },
    reset: () => {
      camera.position.set(48, 48, 60);
      controls.target.set(0, 0, 0);
    },
    dispose: () => {
      alive = false;
      renderer.dispose();
    },
  };
}
