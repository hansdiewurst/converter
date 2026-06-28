import { GenericObject } from "../types";
import { SchematicHandler } from "./schematicHandler";
import pnbt from "prismarine-nbt";

type LongArray = [number, number][];
type Vec3 = { x: number, y: number, z: number };

export type LitematicBlock = { Name: string, Properties?: GenericObject };
type BlockPalette = LitematicBlock[];
type LitematicNBTData = {
    Metadata: {
        EnclosingSize: Vec3
    } & GenericObject;
    Regions: Record<string, {
        BlockStatePalette: BlockPalette;
        BlockStates: LongArray;
        Position: Vec3;
        Size: Vec3;
        //Bunch more but not needed + im lazy
    }>;
    Version: number;
    SubVersion: number;
};
type Region = {
    blockContainer: BlockContainer;
    position: Vec3;
    size: Vec3;
};
export interface LitematicData {
    width: number;
    height: number;
    length: number;
    regions: Region[];
};

//https://github.com/sakura-ryoko/litematica/blob/e1a2f94a887465d392d1d4f369202752664db393/src/main/java/fi/dy/masa/litematica/schematic/container/LitematicaBitArray.java
class BlockContainer {
    private longArray: LongArray;
    private bitsPerEntry: number;
    private maxEntryValue: bigint;
    private size: Vec3;
    private layerSize: number;
    palette: BlockPalette;

    constructor(size: Vec3, palette: BlockPalette, longArray: LongArray) {
        this.bitsPerEntry = Math.max(2, Math.ceil(Math.log2(palette.length)));
        this.maxEntryValue = (1n << BigInt(this.bitsPerEntry)) - 1n;
        this.longArray = longArray;
        this.size = size;
        this.layerSize = size.x * size.z;
        this.palette = palette;
    }

    private readLongArrayVal(index: number): bigint {
        const val = this.longArray[index];

        return (BigInt(val[0] >>> 0) << 32n) | BigInt(val[1] >>> 0);
    }
    private getPaletteIndexAt(index: number) {
        const bits = this.bitsPerEntry;

        const startOffset = index * bits;
        const startArrIndex = startOffset >>> 6;
        const endArrIndex = ((index + 1) * bits - 1) >>> 6;
        const startBitOffset = BigInt(startOffset & 0x3F);

        let paletteIdx: bigint;
        if (startArrIndex == endArrIndex) {
            paletteIdx = this.readLongArrayVal(startArrIndex) >> startBitOffset;
        } else {
            const endOffset = 64n - startBitOffset;

            paletteIdx =
                this.readLongArrayVal(startArrIndex) >> startBitOffset |
                this.readLongArrayVal(endArrIndex) << endOffset;
        }

        return Number(paletteIdx & this.maxEntryValue);
    }
    private getIndex(x: number, y: number, z: number) {
        return y * this.layerSize + z * this.size.x + x;
    }

    getPaletteIndexAtPos(x: number, y: number, z: number) {
        return this.getPaletteIndexAt(this.getIndex(x, y, z));
    }
    getAtPos(x: number, y: number, z: number) {
        return this.palette[this.getPaletteIndexAtPos(x, y, z)];
    }
}

export default class Handler implements SchematicHandler<LitematicData> {
    private async parse(buffer: Buffer): Promise<LitematicNBTData> {
        //parseAs return type is wrong
        const schem = await pnbt.parseAs(buffer, "big", {
            noArraySizeCheck: true
        }) as unknown as { data: pnbt.Compound };

        return pnbt.simplify(schem.data);
    };

    async parseBuffer(buffer: Buffer) {
        const schem = await this.parse(buffer);
        const size = schem.Metadata.EnclosingSize;

        if(size.x < 0 || size.y < 0 || size.z < 0) throw new Error("Invalid litematic enclosing size. Dont think this can happen");

        const regions: Region[] = [];
        for (const name in schem.Regions) {
            const region = schem.Regions[name];

            const position = region.Position;
            const size = region.Size;

            //Resolve negative sizes by setting origin position to smallest pos of Region
            for(const axis in size) {
                if(size[axis] < 0) {
                    size[axis] = size[axis] * -1;
                    position[axis] = position[axis] + size[axis];
                }
            }

            const palette = region.BlockStatePalette;
            const blockStates = region.BlockStates;

            //Blocks
            const blockContainer = new BlockContainer(size, palette, blockStates);

            regions.push({
                position,
                size,
                blockContainer
            });
        }

        const json = {
            width: size.x,
            height: size.y,
            length: size.z,
            regions
        };

        return json;
    }

    writeBuffer(data: LitematicData): Buffer {
        throw new Error("Writing to .litematic is currently not supported.");
    }
}