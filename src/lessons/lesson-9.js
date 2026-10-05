import rabbitController from "./lesson-5.js";

export default {
  ...rabbitController,
  title: "Rabbit controller với WASD",
  description:
    "WASD: di chuyển · Shift: chạy · E: ăn. Rabbit tự chuyển giữa idle, hop, run và eat, kèm capsule collision.",
};
