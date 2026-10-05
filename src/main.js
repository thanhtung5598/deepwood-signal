import * as THREE from "three";
import lesson1 from "./lessons/lesson-1.js";
import lesson2 from "./lessons/lesson-2.js";
import lesson3 from "./lessons/lesson-3.js";
import lesson4 from "./lessons/lesson-4.js";
import lesson5 from "./lessons/lesson-5.js";
import lesson6 from "./lessons/lesson-6.js";
import lesson7 from "./lessons/lesson-7.js";
import lesson8 from "./lessons/lesson-8.js";
import lesson9 from "./lessons/lesson-9.js";
import lesson10 from "./lessons/lesson-10.js";
import lesson11 from "./lessons/lesson-11.js";
import lesson12 from "./lessons/lesson-12.js";

const canvas = document.querySelector("#game");
const stage = document.querySelector(".stage");
const lessonNumber = document.querySelector("#lesson-number");
const lessonTitle = document.querySelector("#lesson-title");
const lessonDescription = document.querySelector("#lesson-description");
const tabButtons = document.querySelectorAll("[data-lesson]");

// Phần lõi dùng chung: mỗi bài nhận scene, camera và input từ đây.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const pressedKeys = new Set();
const lessons = {
  1: lesson1,
  2: lesson2,
  3: lesson3,
  4: lesson4,
  5: lesson5,
  6: lesson6,
  7: lesson7,
  8: lesson8,
  9: lesson9,
  10: lesson10,
  11: lesson11,
  12: lesson12,
};

let activeLessonNumber = 12;
let activeLesson = lesson12;
let updateLesson = () => {};
let disposeLesson = () => {};

function clearScene() {
  for (const child of [...scene.children]) {
    child.traverse((object) => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material?.dispose();
    });
    scene.remove(child);
  }
}

function activateLesson(number) {
  activeLessonNumber = number;
  activeLesson = lessons[number];
  pressedKeys.clear();
  disposeLesson();
  clearScene();
  scene.background = new THREE.Color("#171a21");

  const runtime = activeLesson.setup({ scene, camera, renderer, pressedKeys });
  if (typeof runtime === "function") {
    updateLesson = runtime;
    disposeLesson = () => {};
  } else {
    updateLesson = runtime.update ?? (() => {});
    disposeLesson = runtime.dispose ?? (() => {});
  }

  lessonNumber.textContent = String(number).padStart(2, "0");
  lessonTitle.textContent = activeLesson.title;
  lessonDescription.textContent = activeLesson.description;

  for (const button of tabButtons) {
    const selected = Number(button.dataset.lesson) === number;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }
}

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    activateLesson(Number(button.dataset.lesson));
  });
}

window.addEventListener("keydown", (event) => {
  if (!activeLesson.usesKeyboard) return;
  if (event.code.startsWith("Arrow") || event.code === "Space") {
    event.preventDefault();
  }
  pressedKeys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
});

window.addEventListener("blur", () => {
  pressedKeys.clear();
});

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

const clock = new THREE.Clock();

function gameLoop() {
  const deltaTime = Math.min(clock.getDelta(), 0.1);
  updateLesson(deltaTime);
  renderer.render(scene, camera);
  requestAnimationFrame(gameLoop);
}

window.addEventListener("resize", resize);
resize();
activateLesson(12);
gameLoop();
