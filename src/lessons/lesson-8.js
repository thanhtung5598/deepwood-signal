import { createHumanoidLesson } from "./create-humanoid-lesson.js";

export default createHumanoidLesson({
  title: "Forest Guardian Mecha với WASD",
  description:
    "WASD: di chuyển · Shift: chạy · Space: nhảy · E: vẫy tay. Forest Guardian vẫn điều khiển được khi đang ở trên không.",
  modelUrl: "/models/forest-guardian-mecha-animated.glb",
  modelName: "Forest Guardian Mecha",
  targetHeight: 2.35,
  groundColor: "#172c25",
  gridColor: "#4ade80",
  accentColor: "#a3e635",
  supportsJump: true,
  animationNames: {
    idle: "idle.001",
    walk: "walk.001",
    run: "run.001",
    jump: "jump.001",
    wave: "wave_goodbye_02.001",
  },
  animationTimeScales: {
    walk: 2.6,
    run: 1.28,
    jump: 3.1,
  },
  walkSpeed: 4.2,
  runSpeed: 7.4,
  rootMotionBone: "mixamorigHips",
  lockRootHeightAnimations: ["jump"],
});
