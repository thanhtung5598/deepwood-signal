export function createInPlaceClip(
  sourceClip,
  rootMotionBone,
  rootPosition,
  lockHeight,
) {
  const clip = sourceClip.clone();
  const positionTrack = clip.tracks.find(
    (track) => track.name === `${rootMotionBone}.position`,
  );
  if (!positionTrack) return clip;

  const valueSize = positionTrack.getValueSize();
  if (valueSize === 3) {
    for (let index = 0; index < positionTrack.values.length; index += 3) {
      positionTrack.values[index] = rootPosition.x;
      if (lockHeight) positionTrack.values[index + 1] = rootPosition.y;
      positionTrack.values[index + 2] = rootPosition.z;
    }
  } else if (valueSize === 9) {
    for (let index = 0; index < positionTrack.values.length; index += 9) {
      positionTrack.values[index] = 0;
      positionTrack.values[index + 2] = 0;
      positionTrack.values[index + 3] = rootPosition.x;
      if (lockHeight) positionTrack.values[index + 4] = rootPosition.y;
      positionTrack.values[index + 5] = rootPosition.z;
      positionTrack.values[index + 6] = 0;
      positionTrack.values[index + 8] = 0;
    }
  }

  return clip;
}
