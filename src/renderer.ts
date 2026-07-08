import ndarray, { NdArray } from "ndarray";
import Schematic from "./converter";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { averageColors } from "./averageColors";

type Vec3 = [number, number, number];
type Quad = {
    pos: Vec3,
    width: number,
    length: number,
    id: number
};
type AxisQuadSet = {
    quads: Quad[],
    transpose: Vec3
};
type GeomQuad = {
    positions: [Vec3, Vec3, Vec3, Vec3],
    color: Vec3
};


export class Renderer {
    readonly backgroundColor = 0xADD8E6;
    readonly lightColor = 0xFFFFAA;
    readonly lightIntensity = 0.8;

    canvas: HTMLCanvasElement;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    light: THREE.AmbientLight;

    mesher: Mesher;
    currMesh: THREE.Mesh | null = null;

    paused = true;

    constructor(canvas: HTMLCanvasElement) {
        //Setup threejs
        this.canvas = canvas;
        this.initThreeJS();

        //Mesher
        this.mesher = new Mesher(this);
    }

    private updateSize() {
        const width = window.innerWidth * 0.8;
        const height = window.innerHeight * 0.8;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 0, 2));
    }
    private initThreeJS() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.backgroundColor);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });

        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

        this.controls = new OrbitControls( this.camera, this.renderer.domElement );
        this.controls.minDistance = 1;

        this.light = new THREE.AmbientLight(this.lightColor, this.lightIntensity);

        this.scene.add(this.light);
        this.scene.add(this.camera);

        //updating
        window.addEventListener('resize', () => this.updateSize());
        this.updateSize();

        const RENDER_LOOP = () => {
            window.requestAnimationFrame(RENDER_LOOP);
            if(this.paused) return;

            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        RENDER_LOOP();
    }

    renderSchematic(schematic: Schematic) {
        this.unrenderSchematic();
        this.paused = false;

        this.controls.target.set(schematic.width / 2, schematic.height / 2, schematic.length / 2);
        this.camera.position.set(schematic.width * 1.5, schematic.height * 1.5, schematic.length * 1.5);
        this.camera.rotation.set(-1, -1, -1);
        const mesh = this.mesher.buildGeometry(schematic);
        this.currMesh = mesh;
    }
    unrenderSchematic() {
        if(this.currMesh) {
            this.scene.remove(this.currMesh);
            this.currMesh.geometry.dispose();
        }
        this.paused = true;
    }
}

class Mesher {
    private readonly directions: Vec3[] = [
        [0, 2, 1],
        [1, 0, 2],
        [2, 1, 0]
    ];

    private meshMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide
    });

    renderer: Renderer;
    constructor(renderer: Renderer) {
        this.renderer = renderer;
    }

    private getFaceValue(id: number, prevId: number) {
        //no face between 2 non-air voxels
        if(id && prevId) return 0;

        //no face between 2 air voxels
        if(id === prevId) return 0;

        //if either face is air, use the other one
        //this uses the same id because we disregard normal direction
        if(id === 0) return prevId;
        if(prevId === 0) return id;

        //cant happen but typescript
        return 0;
    }
    private transposeArray(arr: Vec3, transpose: Vec3): Vec3 {
        return [
            arr[transpose[0]],
            arr[transpose[1]],
            arr[transpose[2]],
        ];
    }

    private buildQuads(blockArray: NdArray<Uint16Array>, width: number, height: number, length: number) {
        /**
         * Stores block ids per layer
        */
        const mask = ndarray(new Uint16Array(width * length), [width, length]);

        const quads: Quad[] = [];

        for(let y = 0; y <= height; y++) {
            //Fill shared mask
            for(let x = 0; x < width; x++) {
                for(let z = 0; z < length; z++) {
                    const id = y === height ? 0 : blockArray.get(x, y, z);
                    const prevId = y === 0 ? 0 : blockArray.get(x, y - 1, z);

                    let value = this.getFaceValue(id, prevId);
                    mask.set(x, z, value);
                }
            }

            //GREED
            for(let  x = 0; x < width; x++) {
                for(let z = 0; z < length; z++) {
                    let id = mask.get(x,z);
                    if(id === 0) continue;
                    mask.set(x,z,0);

                    let qWidth = 1;
                    let qLength = 1;

                    //Expand the quad along the X
                    for(qWidth; x + qWidth < width; qWidth++) {
                        if(mask.get(x + qWidth, z) !== id) break;

                        mask.set(x + qWidth, z, 0);
                    }
                    //Expand along the Z
                    Z_LOOP:
                    for(qLength; z + qLength < length; qLength++) {
                        for(let qx = x; qx < x + qWidth; qx++) {
                            if(mask.get(qx, z + qLength) !== id) break Z_LOOP;
                        }

                        //Only zero out the mask after making sure this Z will be part of quad
                        for(let qx = x; qx < x + qWidth; qx++) mask.set(qx, z + qLength, 0);
                    }

                    //Store quad
                    quads.push({
                        pos: [x, y, z],
                        width: qWidth,
                        length: qLength,
                        id
                    });
                }
            }
        }

        return quads;
    }

    buildGeometry(schematic: Schematic) {
        //Build quads along all 3 axes
        let quadCount = 0;
        const quadsPerAxis: AxisQuadSet[] = [];
        for(const transpose of this.directions) {
            const blockArray = schematic.blocks.transpose(...transpose);
            const shape = this.transposeArray([schematic.width, schematic.height, schematic.length], transpose);

            const quads = this.buildQuads(blockArray, shape[0], shape[1], shape[2]);
            quadsPerAxis.push({
                quads,
                transpose
            });
            quadCount += quads.length;
        }

        //Convert to geometry data
        const geometryStorage = new GeometryStorage(quadCount);

        let quadIOffset = 0;
        for(const { quads, transpose } of quadsPerAxis) {
            for(let quadI = 0; quadI < quads.length; quadI++) {
                const quad = quads[quadI];

                const posA = this.transposeArray([quad.pos[0], quad.pos[1], quad.pos[2]], transpose);
                const posB = this.transposeArray([quad.pos[0] + quad.width, quad.pos[1], quad.pos[2]], transpose);
                const posC = this.transposeArray([quad.pos[0] + quad.width, quad.pos[1], quad.pos[2] + quad.length], transpose);
                const posD = this.transposeArray([quad.pos[0], quad.pos[1], quad.pos[2] + quad.length], transpose);

                let color = averageColors[quad.id];
                if(!color) {
                    console.log(`Block id ${quad.id} has no color`);
                    color = [0, 0, 0];
                }

                geometryStorage.storeQuad(quadI + quadIOffset, {
                    positions: [posA, posB, posC, posD],
                    color
                });
            }

            quadIOffset += quads.length;
        }

        //Create mesh
        const geometry = geometryStorage.toGeometry();

        const mesh = new THREE.Mesh(geometry, this.meshMaterial);
        this.renderer.scene.add(mesh);

        return mesh;
    }
}

class GeometryStorage {
    private readonly VERTICES_PER_QUAD = 4;
    private readonly INDICES_PER_QUAD = 6;
    private readonly DATA_PER_VERTEX = 3;

    vertexPositions: Float32Array;
    vertexColors: Float32Array;
    indices: number[];

    constructor(quadCount: number) {
        this.vertexPositions = new Float32Array(quadCount * this.VERTICES_PER_QUAD * this.DATA_PER_VERTEX);
        this.vertexColors = new Float32Array(quadCount * this.VERTICES_PER_QUAD * this.DATA_PER_VERTEX);
        this.indices = new Array(quadCount * this.INDICES_PER_QUAD);
    }

    storeQuad(quadIndex: number, quad: GeomQuad) {
        const positions = this.vertexPositions;
        const colors = this.vertexColors;
        const indices = this.indices;

        const vertexI = quadIndex * this.VERTICES_PER_QUAD;
        const posI = vertexI * this.DATA_PER_VERTEX;
        const indicesI = quadIndex * this.INDICES_PER_QUAD;

        const {
            positions: [posA, posB, posC, posD],
            color
        } = quad;


        //Positions
        positions[posI + 0] = posA[0];
        positions[posI + 1] = posA[1];
        positions[posI + 2] = posA[2];

        positions[posI + 3] = posB[0];
        positions[posI + 4] = posB[1];
        positions[posI + 5] = posB[2];

        positions[posI + 6] = posC[0];
        positions[posI + 7] = posC[1];
        positions[posI + 8] = posC[2];

        positions[posI + 9] = posD[0];
        positions[posI + 10] = posD[1];
        positions[posI + 11] = posD[2];

        //Colors (Same for all vertices)
        colors[posI + 0] = color[0];
        colors[posI + 1] = color[1];
        colors[posI + 2] = color[2];

        colors[posI + 3] = color[0];
        colors[posI + 4] = color[1];
        colors[posI + 5] = color[2];

        colors[posI + 6] = color[0];
        colors[posI + 7] = color[1];
        colors[posI + 8] = color[2];

        colors[posI + 9] = color[0];
        colors[posI + 10] = color[1];
        colors[posI + 11] = color[2];

        //Indices
        //ABC, ACD
        indices[indicesI + 0] = vertexI + 0;
        indices[indicesI + 1] = vertexI + 1;
        indices[indicesI + 2] = vertexI + 2;

        indices[indicesI + 3] = vertexI + 0;
        indices[indicesI + 4] = vertexI + 2;
        indices[indicesI + 5] = vertexI + 3;
    }

    toGeometry() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(this.vertexPositions, this.DATA_PER_VERTEX));
        geometry.setAttribute("color", new THREE.BufferAttribute(this.vertexColors, this.DATA_PER_VERTEX));
        geometry.setIndex(this.indices);

        return geometry;
    }
}