const BASE_ENTITY_BODY_HEIGHT_METERS = 0.56;
const BASE_ENTITY_LENGTH_METERS = 4.1;
const BASE_ENTITY_ROOF_HEIGHT_METERS = 0.32;
const BASE_ENTITY_WHEEL_HEIGHT_METERS = 0.28;
const BASE_ENTITY_WHEEL_LENGTH_METERS = 0.78;
const BASE_ENTITY_WHEEL_WIDTH_METERS = 0.3;
const BASE_ENTITY_WIDTH_METERS = 1.72;

const appendBoxMesh = (
  positions: number[],
  normals: number[],
  centerX: number,
  centerY: number,
  centerZ: number,
  width: number,
  length: number,
  height: number,
) => {
  const minX = centerX - width / 2;
  const maxX = centerX + width / 2;
  const minY = centerY - length / 2;
  const maxY = centerY + length / 2;
  const minZ = centerZ - height / 2;
  const maxZ = centerZ + height / 2;

  const pushFace = (vertices: number[], normal: [number, number, number]) => {
    positions.push(...vertices);
    normals.push(...Array.from({ length: vertices.length / 3 }, () => normal).flat());
  };

  pushFace(
    [
      minX, minY, maxZ,
      maxX, minY, maxZ,
      maxX, maxY, maxZ,
      minX, minY, maxZ,
      maxX, maxY, maxZ,
      minX, maxY, maxZ,
    ],
    [0, 0, 1],
  );
  pushFace(
    [
      minX, maxY, minZ,
      maxX, maxY, minZ,
      maxX, minY, minZ,
      minX, maxY, minZ,
      maxX, minY, minZ,
      minX, minY, minZ,
    ],
    [0, 0, -1],
  );
  pushFace(
    [
      minX, minY, minZ,
      minX, minY, maxZ,
      minX, maxY, maxZ,
      minX, minY, minZ,
      minX, maxY, maxZ,
      minX, maxY, minZ,
    ],
    [-1, 0, 0],
  );
  pushFace(
    [
      maxX, minY, minZ,
      maxX, maxY, maxZ,
      maxX, minY, maxZ,
      maxX, minY, minZ,
      maxX, maxY, minZ,
      maxX, maxY, maxZ,
    ],
    [1, 0, 0],
  );
  pushFace(
    [
      minX, maxY, minZ,
      minX, maxY, maxZ,
      maxX, maxY, maxZ,
      minX, maxY, minZ,
      maxX, maxY, maxZ,
      maxX, maxY, minZ,
    ],
    [0, 1, 0],
  );
  pushFace(
    [
      minX, minY, minZ,
      maxX, minY, maxZ,
      minX, minY, maxZ,
      minX, minY, minZ,
      maxX, minY, minZ,
      maxX, minY, maxZ,
    ],
    [0, -1, 0],
  );
};

export const createLowPolyVehicleMesh = () => {
  const positions: number[] = [];
  const normals: number[] = [];

  appendBoxMesh(
    positions,
    normals,
    0,
    0,
    BASE_ENTITY_BODY_HEIGHT_METERS / 2,
    BASE_ENTITY_WIDTH_METERS,
    BASE_ENTITY_LENGTH_METERS,
    BASE_ENTITY_BODY_HEIGHT_METERS,
  );
  appendBoxMesh(
    positions,
    normals,
    0,
    0.12,
    BASE_ENTITY_BODY_HEIGHT_METERS + BASE_ENTITY_ROOF_HEIGHT_METERS / 2,
    BASE_ENTITY_WIDTH_METERS * 0.62,
    BASE_ENTITY_LENGTH_METERS * 0.48,
    BASE_ENTITY_ROOF_HEIGHT_METERS,
  );

  const wheelX = BASE_ENTITY_WIDTH_METERS / 2 - BASE_ENTITY_WHEEL_WIDTH_METERS / 2;
  const wheelY = BASE_ENTITY_LENGTH_METERS / 2 - BASE_ENTITY_WHEEL_LENGTH_METERS / 2 - 0.26;
  const wheelZ = BASE_ENTITY_WHEEL_HEIGHT_METERS / 2;

  appendBoxMesh(
    positions,
    normals,
    -wheelX,
    wheelY,
    wheelZ,
    BASE_ENTITY_WHEEL_WIDTH_METERS,
    BASE_ENTITY_WHEEL_LENGTH_METERS,
    BASE_ENTITY_WHEEL_HEIGHT_METERS,
  );
  appendBoxMesh(
    positions,
    normals,
    wheelX,
    wheelY,
    wheelZ,
    BASE_ENTITY_WHEEL_WIDTH_METERS,
    BASE_ENTITY_WHEEL_LENGTH_METERS,
    BASE_ENTITY_WHEEL_HEIGHT_METERS,
  );
  appendBoxMesh(
    positions,
    normals,
    -wheelX,
    -wheelY,
    wheelZ,
    BASE_ENTITY_WHEEL_WIDTH_METERS,
    BASE_ENTITY_WHEEL_LENGTH_METERS,
    BASE_ENTITY_WHEEL_HEIGHT_METERS,
  );
  appendBoxMesh(
    positions,
    normals,
    wheelX,
    -wheelY,
    wheelZ,
    BASE_ENTITY_WHEEL_WIDTH_METERS,
    BASE_ENTITY_WHEEL_LENGTH_METERS,
    BASE_ENTITY_WHEEL_HEIGHT_METERS,
  );

  return {
    attributes: {
      normals: { size: 3, value: new Float32Array(normals) },
      positions: { size: 3, value: new Float32Array(positions) },
    },
  };
};
