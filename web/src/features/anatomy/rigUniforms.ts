import { Matrix4, type IUniform } from 'three';
import type { LayerId } from '@/types/settings';

/** Runtime uniforms shared between rigs and materials (animated every frame by the rigs). */
const u = <T,>(value: T): IUniform<T> => ({ value });

export const layerAlpha: Record<LayerId, IUniform<number>> = {
  skull: u(0),
  brain: u(0),
  muscles: u(0),
  eyes: u(0),
  outline: u(0),
  hands: u(0),
  body: u(0),
};

/** Fades head anatomy out when the face is lost and back in on reacquisition. */
export const headPresence: IUniform<number> = u(0);

/** One presence uniform per hand slot (0 = subject's left, 1 = subject's right). */
export const handPresence: [IUniform<number>, IUniform<number>] = [u(0), u(0)];

/** Fades the body skeleton when the pose is lost. */
export const bodyPresence: IUniform<number> = u(0);

/** Mandible transform (hinge rotation + protrusion) in the head frame, for skinned muscles. */
export const jawUniform: IUniform<Matrix4> = u(new Matrix4());
