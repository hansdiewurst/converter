import ndarray from "ndarray";
import { BloxdschemData, Chunk as BloxdChunk } from "./schematic-handlers/bloxdschem";
import { SpongeSchemData } from "./schematic-handlers/schem";
import BlockConverter from "./block-converter";
import { SchematicData } from "./schematic-handlers/schematic";
import { LegalFileType, ExportFileType } from ".";
import { LitematicData } from "./schematic-handlers/litematic";

/**
 * Load schematics of different formats and write to bloxd or sponge schematic
 */
export default class Schematic {
    static blockConverter: BlockConverter;

    name: string;

    width: number;
    height: number;
    length: number;

    /** bloxd block-ids as shared format */
    blocks: ndarray.NdArray<Uint16Array>;

    private constructor() {}

    static fromType(type: LegalFileType, data: BloxdschemData | SpongeSchemData | SchematicData | LitematicData, name: string) {
        switch(type) {
            case "bloxdschem": return Schematic.fromBloxdschem(data as BloxdschemData, name);
            case "schem": return Schematic.fromSchem(data as SpongeSchemData, name);
            case "schematic": return Schematic.fromSchematic(data as SchematicData, name);
            case "litematic": return Schematic.fromLitematic(data as LitematicData, name);
        }
    }
    static fromBloxdschem(bloxdschem: BloxdschemData, name: string): Schematic {
        const schem = new Schematic();
        schem.name = name;
        schem.width = bloxdschem.width;
        schem.height = bloxdschem.height;
        schem.length = bloxdschem.length;
        schem.blocks = ndarray(new Uint16Array(schem.width * schem.height * schem.length), [schem.width, schem.height, schem.length]);

        const schemMaxX = bloxdschem.x + schem.width;
        const schemMaxY = bloxdschem.y + schem.height;
        const schemMaxZ = bloxdschem.z + schem.length;

        for(const chunk of bloxdschem.chunks) {
            const blocks = ndarray(chunk.blocks, [32, 32, 32]);

            const offsetX = chunk.x * 32 - bloxdschem.x;
            const offsetY = chunk.y * 32 - bloxdschem.y;
            const offsetZ = chunk.z * 32 - bloxdschem.z;

            const startX = Math.max(-offsetX, 0);
            const startY = Math.max(-offsetY, 0);
            const startZ = Math.max(-offsetZ, 0);

            const endX = Math.min(schemMaxX - chunk.x * 32, 32);
            const endY = Math.min(schemMaxY - chunk.y * 32, 32);
            const endZ = Math.min(schemMaxZ - chunk.z * 32, 32);

            for(let x = startX; x < endX; x++) {
                for(let y = startY; y < endY; y++) {
                    for(let z = startZ; z < endZ; z++) {
                        const block = blocks.get(x, y, z);
                        schem.blocks.set(
                            x + offsetX,
                            y + offsetY,
                            z + offsetZ,
                            block
                        );
                    }
                }
            }
        }

        return schem;
    }
    static async fromSchem(spongeSchem: SpongeSchemData, name: string): Promise<Schematic> {
        const schem = new Schematic();
        schem.name = name;
        schem.width = spongeSchem.width;
        schem.height = spongeSchem.height;
        schem.length = spongeSchem.length;

        const bloxdPalette = new Map<number, number>();
        for(const mcId in spongeSchem.palette) {
            const paletteI = spongeSchem.palette[mcId];
            bloxdPalette.set(paletteI, await this.blockConverter.mcToBloxd(mcId));
        }

        schem.blocks = ndarray(new Uint16Array(schem.width * schem.height * schem.length), [schem.width, schem.height, schem.length]);
        let blockI = 0;
        for(let y = 0; y < schem.height; y++) {
            for(let z = schem.length - 1; z >= 0; z--) {
                for(let x = 0; x < schem.width; x++) {
                    const paletteI = spongeSchem.blocks[blockI++];
                    schem.blocks.set(x, y, z, bloxdPalette.get(paletteI) ?? 2);
                }
            }
        }

        return schem;
    }
    static async fromSchematic(schematic: SchematicData, name: string): Promise<Schematic> {
        const schem = new Schematic();
        schem.name = name;
        schem.width = schematic.width;
        schem.height = schematic.height;
        schem.length = schematic.length;

        schem.blocks = ndarray(new Uint16Array(schem.width * schem.height * schem.length), [schem.width, schem.height, schem.length]);
        let blockI = 0;
        for(let y = 0; y < schem.height; y++) {
            for(let z = schem.length - 1; z >= 0; z--) {
                for(let x = 0; x < schem.width; x++) {
                    const block = schematic.blocks[blockI];
                    const data = schematic.blockData[blockI];

                    const mcId = this.blockConverter.legacyToMcId(block, data);
                    const bloxdId = await this.blockConverter.mcToBloxd(mcId);

                    schem.blocks.set(x, y, z, bloxdId);

                    blockI++;
                }
            }
        }

        return schem;
    }
    static async fromLitematic(litematic: LitematicData, name: string): Promise<Schematic> {
        const schem = new Schematic();
        schem.name = name;
        schem.width = litematic.width;
        schem.height = litematic.height;
        schem.length = litematic.length;

        schem.blocks = ndarray(new Uint16Array(schem.width * schem.height * schem.length), [schem.width, schem.height, schem.length]);

        const schemMinPos = { x: Infinity, y: Infinity, z: Infinity };
        for(const regionName in litematic.regions) {
            const pos = litematic.regions[regionName].position;
            for(const axis in pos) if(pos[axis] < schemMinPos[axis]) schemMinPos[axis] = pos[axis];
        }

        for(const regionName in litematic.regions) {
            const region = litematic.regions[regionName];

            const palette = region.blockContainer.palette;
            const bloxdPalette: number[] = new Array(palette.length);
            for(let paletteI = 0; paletteI < palette.length; paletteI++) {
                const block = palette[paletteI];
                const mcId = this.blockConverter.stringifyLitematicBlock(block);
                bloxdPalette[paletteI] = await this.blockConverter.mcToBloxd(mcId);
            }

            const offsetX = region.position.x - schemMinPos.x;
            const offsetY = region.position.y - schemMinPos.y;
            const offsetZ = region.position.z - schemMinPos.z;

            for(let x = 0; x < region.size.x; x++) {
                for(let y = 0; y < region.size.y; y++) {
                    for(let z = 0; z < region.size.z; z++) {
                        const paletteI = region.blockContainer.getPaletteIndexAtPos(x, y, z);
                        const bloxdId = bloxdPalette[paletteI];

                        //flip on the Z-Axis
                        schem.blocks.set(x + offsetX, y + offsetY, schem.length - 1 - z + offsetZ, bloxdId);
                    }
                }
            }
        }

        return schem;
    }

    async toType(type: ExportFileType) {
        switch(type) {
            case "schem": return await this.toSchem();
            case "bloxdschem": return this.toBloxdschem();
        }
    }
    private _writeBloxdChunk(chunkX: number, chunkY: number, chunkZ: number) {
        const chunkNdArray = this.blocks.lo(chunkX * 32, chunkY * 32, chunkZ * 32);
        const blocks: number[] = new Array(32**3);
        let blockI = 0;

        for(let x = 0; x < 32; x++) {
            for(let y = 0; y < 32; y++) {
                for(let z = 0; z < 32; z++) {
                    blocks[blockI++] = chunkNdArray.get(x, y, z);
                }
            }
        }

        return blocks;
    }
    toBloxdschem(): BloxdschemData {
        const chunks: BloxdChunk[] = [];
        const chunkWidth = this.width / 32;
        const chunkHeight = this.height / 32;
        const chunkLength = this.length / 32;

        for(let chunkX = 0; chunkX < chunkWidth; chunkX++) {
            for(let chunkY = 0; chunkY < chunkHeight; chunkY++) {
                for(let chunkZ = 0; chunkZ < chunkLength; chunkZ++) {
                    const blocks = this._writeBloxdChunk(chunkX, chunkY, chunkZ);

                    chunks.push({
                        x: chunkX,
                        y: chunkY,
                        z: chunkZ,
                        blocks
                    });
                }
            }
        }

        return {
            name: this.name,
            x: 0,
            y: 0,
            z: 0,
            width: this.width,
            height: this.height,
            length: this.length,
            chunks
        };
    }
    async toSchem(): Promise<SpongeSchemData> {
        let currPaletteI = 0;
        /** Map bloxd id to paletteI */
        const bloxdPalette: Record<number, number> = {};
        /** Map minecraft id to paletteI */
        const palette: Record<string, number> = {};

        const blocks = new Uint8Array(this.width * this.height * this.length);
        let blockI = 0;

        for(let y = 0; y < this.height; y++) {
            //invert on z because bloxd is lefthanded mc isnt
            for(let z = this.length - 1; z >= 0; z--) {
                for(let x = 0; x < this.width; x++) {
                    const bloxdId = this.blocks.get(x, y, z);
                    let paletteI: number;
                    if(bloxdId in bloxdPalette) {
                        paletteI = bloxdPalette[bloxdId];
                    } else {
                        const mcId = await Schematic.blockConverter.bloxdToMc(bloxdId);

                        //multiple bloxd ids can map to the same mc id, but one mc id can only have 1 palette idx
                        if(mcId in palette) {
                            paletteI = palette[mcId];
                        } else {
                            paletteI = currPaletteI++;
                            palette[mcId] = paletteI;
                        }

                        bloxdPalette[bloxdId] = paletteI;
                    }

                    //VarInt encoding
                    while(paletteI >= 128) {
                        let schemId = paletteI & 127 | 128;
                        //Because of pnbt
                        schemId -= 256;

                        blocks[blockI++] = schemId;
                        paletteI >>>= 7;
                    }
                    blocks[blockI++] = paletteI;
                }
            }
        }

        return {
            width: this.width,
            height: this.height,
            length: this.length,
            blocks: blocks,
            palette
        };
    }
}

(window as any).Schematic = Schematic;