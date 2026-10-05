import { createHumanoidLesson } from "./create-humanoid-lesson.js";

export default createHumanoidLesson({
  title: "Robot rigged với WASD",
  description:
    "WASD: di chuyển · Shift: chạy · Space: nhảy · E: vẫy tay. Robot vẫn điều khiển được khi đang ở trên không.",
  modelUrl: "/models/futuristic-robot-v2-animated.glb",
  modelName: "Futuristic Robot",
  targetHeight: 2.35,
  groundColor: "#172c35",
  gridColor: "#22d3ee",
  accentColor: "#38bdf8",
  supportsJump: true,
});
