/**
 * Vertical field of view of the virtual camera. MediaPipe's face-geometry pipeline (used to
 * produce facialTransformationMatrixes) assumes a 63 degree vertical-FOV perspective camera, so
 * rendering with the same FOV makes the projected canonical face coincide with the landmarks
 * regardless of the physical webcam's real FOV. Hands use the same camera model.
 */
export const CAMERA_FOV = 63;
export const CAMERA_NEAR = 1; // cm
export const CAMERA_FAR = 2000; // cm
