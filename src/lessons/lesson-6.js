import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export default {
  title: "Đọc animation bên trong GLB",
  description:
    "Chọn một file .glb để xem skeleton, AnimationClip, duration và track. Mixer được tạo lúc chạy, không nằm sẵn trong GLB.",
  usesKeyboard: false,

  setup({ scene, camera }) {
    camera.position.set(3.8, 2.8, 5.2);
    camera.lookAt(0, 1, 0);

    const hemisphereLight = new THREE.HemisphereLight(
      "#e0f2fe",
      "#172033",
      2.4,
    );
    const sunlight = new THREE.DirectionalLight("#ffffff", 3);
    sunlight.position.set(4, 7, 5);
    scene.add(hemisphereLight, sunlight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(4, 64),
      new THREE.MeshStandardMaterial({ color: "#24342f", roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;

    const grid = new THREE.GridHelper(8, 16, "#4b7b72", "#304943");
    grid.position.y = 0.003;
    scene.add(ground, grid);

    const panel = document.createElement("section");
    panel.className = "glb-inspector";
    panel.innerHTML = `
      <div class="inspector-heading">
        <strong>GLB Inspector</strong>
        <span>Xử lý ngay trên máy</span>
      </div>
      <label class="glb-file-picker">
        Chọn file .glb
        <input type="file" accept=".glb,model/gltf-binary" />
      </label>
      <p class="glb-status">Đang đọc rabbit-animated.glb…</p>
      <dl class="glb-summary">
        <dt>Tệp</dt><dd data-field="file">—</dd>
        <dt>Mesh</dt><dd data-field="meshes">—</dd>
        <dt>Skeleton</dt><dd data-field="skeleton">—</dd>
        <dt>Animation</dt><dd data-field="animation">—</dd>
        <dt>Runtime mixer</dt><dd data-field="mixer">—</dd>
      </dl>
      <p class="clip-heading">AnimationClip trong file</p>
      <div class="clip-list"></div>
    `;
    document.querySelector(".stage").append(panel);

    const fileInput = panel.querySelector("input[type='file']");
    const status = panel.querySelector(".glb-status");
    const clipList = panel.querySelector(".clip-list");
    const fields = {
      file: panel.querySelector("[data-field='file']"),
      meshes: panel.querySelector("[data-field='meshes']"),
      skeleton: panel.querySelector("[data-field='skeleton']"),
      animation: panel.querySelector("[data-field='animation']"),
      mixer: panel.querySelector("[data-field='mixer']"),
    };

    const loader = new GLTFLoader();
    let model = null;
    let mixer = null;
    let activeAction = null;
    let activeButton = null;
    let objectUrl = null;
    let loadVersion = 0;

    function resetInspector() {
      mixer?.stopAllAction();
      if (mixer && model) mixer.uncacheRoot(model);

      if (model) {
        scene.remove(model);
        disposeModel(model);
      }

      if (objectUrl) URL.revokeObjectURL(objectUrl);

      model = null;
      mixer = null;
      activeAction = null;
      activeButton = null;
      objectUrl = null;
      clipList.replaceChildren();
    }

    function frameModel(root) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const largestSide = Math.max(size.x, size.y, size.z);

      if (largestSide > 0 && Number.isFinite(largestSide)) {
        root.scale.multiplyScalar(2.5 / largestSide);
      }

      root.updateMatrixWorld(true);
      box.setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      root.position.x -= center.x;
      root.position.y -= box.min.y;
      root.position.z -= center.z;
      root.updateMatrixWorld(true);

      box.setFromObject(root);
      const framedSize = box.getSize(new THREE.Vector3());
      const target = new THREE.Vector3(0, framedSize.y * 0.45, 0);
      camera.position.set(
        Math.max(3.2, framedSize.x * 1.5),
        Math.max(2.3, framedSize.y * 1.15),
        Math.max(4.2, framedSize.z * 2.2),
      );
      camera.lookAt(target);
    }

    function playClip(clip, button) {
      if (!mixer) return;

      const nextAction = mixer.clipAction(clip);
      if (nextAction === activeAction) return;

      nextAction.reset().fadeIn(0.18).play();
      activeAction?.fadeOut(0.18);
      activeButton?.classList.remove("is-active");
      button.classList.add("is-active");
      activeAction = nextAction;
      activeButton = button;
    }

    function showClips(clips) {
      clipList.replaceChildren();

      if (clips.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "empty-clips";
        emptyMessage.textContent =
          "Không có AnimationClip. Model này là model tĩnh nên không cần AnimationMixer.";
        clipList.append(emptyMessage);
        return;
      }

      clips.forEach((clip, index) => {
        const button = document.createElement("button");
        const name = document.createElement("span");
        const meta = document.createElement("span");

        button.type = "button";
        button.className = "clip-button";
        name.className = "clip-name";
        meta.className = "clip-meta";
        name.textContent = clip.name || `Clip ${index + 1}`;
        meta.textContent = `${clip.duration.toFixed(2)}s · ${clip.tracks.length} tracks`;

        button.append(name, meta);
        button.addEventListener("click", () => playClip(clip, button));
        clipList.append(button);

        if (index === 0) playClip(clip, button);
      });
    }

    function inspectGltf(gltf, fileName) {
      model = gltf.scene;
      model.name = "InspectedGLB";
      scene.add(model);
      frameModel(model);

      let meshCount = 0;
      let hasSkeleton = false;
      model.traverse((object) => {
        if (object.isMesh) meshCount += 1;
        if (object.isSkinnedMesh || object.skeleton) hasSkeleton = true;
      });

      const clips = gltf.animations;
      if (clips.length > 0) mixer = new THREE.AnimationMixer(model);

      fields.file.textContent = fileName;
      fields.meshes.textContent = String(meshCount);
      fields.skeleton.textContent = hasSkeleton ? "Có" : "Không";
      fields.animation.textContent =
        clips.length === 0
          ? "Model tĩnh"
          : hasSkeleton
            ? `${clips.length} clip · skeletal`
            : `${clips.length} clip · object transform`;
      fields.mixer.textContent = mixer ? "Đã tạo bằng JavaScript" : "Không cần";

      status.classList.remove("is-error");
      status.textContent = `Đã đọc xong ${clips.length} AnimationClip.`;
      showClips(clips);
    }

    function loadGlb(url, fileName, localObjectUrl = false) {
      const thisLoad = ++loadVersion;
      resetInspector();
      if (localObjectUrl) objectUrl = url;

      status.classList.remove("is-error");
      status.textContent = `Đang đọc ${fileName}…`;
      for (const field of Object.values(fields)) field.textContent = "—";

      loader.load(
        url,
        (gltf) => {
          if (thisLoad !== loadVersion) {
            disposeModel(gltf.scene);
            return;
          }
          inspectGltf(gltf, fileName);
        },
        undefined,
        (error) => {
          if (thisLoad !== loadVersion) return;
          console.error(`Không đọc được ${fileName}`, error);
          status.classList.add("is-error");
          status.textContent =
            "Không đọc được file GLB. Hãy kiểm tra file có đúng định dạng hay không.";
        },
      );
    }

    fileInput.addEventListener("change", () => {
      const [file] = fileInput.files;
      if (!file) return;
      loadGlb(URL.createObjectURL(file), file.name, true);
      fileInput.value = "";
    });

    loadGlb("/models/rabbit-animated.glb", "rabbit-animated.glb");

    return {
      update(deltaTime) {
        mixer?.update(deltaTime);
      },
      dispose() {
        loadVersion += 1;
        resetInspector();
        panel.remove();
      },
    };
  },
};

function disposeModel(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material?.dispose();
  });
}
